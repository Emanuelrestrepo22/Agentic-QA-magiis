/**
 * Materializes the MG-19 "Alta de Viaje" manual suite (154 Xray Tests) into Jira/Xray.
 *
 * Reads .context/magiis-process/mg19-manifest.json (built by the QA suite generator,
 * which joins suite.xlsx + xray_import/suite.csv and gates on 154 cases / 459 steps).
 *
 * Per test it:
 *   1. looks it up by label `tcid:<ID>` and ADOPTS it if it already exists (never duplicates)
 *   2. creates a Manual Xray Test with summary/labels/priority/assignee/folder in one call
 *   3. writes a wiki-markup description via Jira REST v2
 *   4. adds one manual step per step (Xray drops steps passed inline to createTest)
 *   5. links it to the source Story with the `Test` link type (MG house pattern, MG-227)
 *   6. appends a progress line to mg19-suite-progress.jsonl (resume-safe)
 *
 * HARD RULE (MG): only Xray entities are created. The Story receives issue LINKS only —
 * never a transition, a field edit, or a comment.
 *
 * Usage:
 *   bun scripts/mg19-suite-materialize.mjs containers  [--dry-run]
 *   bun scripts/mg19-suite-materialize.mjs canary      [--dry-run]
 *   bun scripts/mg19-suite-materialize.mjs bulk        [--dry-run] [--limit N]
 *   bun scripts/mg19-suite-materialize.mjs membership  [--dry-run]
 *   bun scripts/mg19-suite-materialize.mjs verify
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllAttachedTestIds, graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, '.context/magiis-process/mg19-manifest.json');
const JOURNAL = resolve(ROOT, '.context/magiis-process/mg19-suite-progress.jsonl');
const CONTAINERS = resolve(ROOT, '.context/magiis-process/mg19-containers.json');

// ---------------------------------------------------------------------------
// Constants. Deliberately hardcoded: XRAY_PROJECT_KEY in .env is env-scoped (MG/TM
// work vs MX work) and trusting it once created 32 issues in the wrong project.
//
// PROJECT_KEY stays 'MG' on purpose (2026-08-13, Fase 2.3 of the MG->TM rename): this
// script is a completed one-off campaign (MG-19, Alta de Viaje) whose STORY_KEY and
// EPIC_* constants below are literal keys of already-created Jira objects at the time
// it ran. Two of those epics (MG-134, MG-509) later moved to TM (TM-34, TM-1) in the
// project migration -- see .agents/xray-key-migration.json -- but rewriting PROJECT_KEY
// here would silently change what a re-run of this script targets without updating the
// STORY_KEY/EPIC_* values that still assume MG, which is a bigger edit than "fix the
// guard" and risks corrupting a script that already did its job. If this campaign needs
// a NEW run against current state, update PROJECT_KEY/STORY_KEY/EPIC_* together as one
// deliberate change, not as a side effect of parameterizing the guard below.
// ---------------------------------------------------------------------------
const PROJECT_KEY = 'MG';
const STORY_KEY = 'MG-19';
const EPIC_TEST_PLANS = 'MG-134'; // QA Master Test Plan
const EPIC_TEST_ARTIFACTS = 'MG-509'; // QA Test Artifacts
const ATP_TITLE = 'ATP · Carrier v2 — Alta de Viaje (MG-19)';
const ATR_TITLE = 'ATR · Alta de Viaje — Carrier v2 (Ronda 1)';
const TEST_ENV = 'test';

const LINK_TEST = '10334'; // Test:    tests / is tested by   (verified live in MG)
const LINK_RELATES = '10003'; // Relates: relates to

const MAX_WRITES = 900; // circuit breaker against a parsing bug
const MAX_CONSECUTIVE_FAILS = 3;
const MAX_FAIL_RATE = 0.05;
const PACE_MS = 120;

const JIRA_URL = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const JIRA_AUTH = `Basic ${Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString('base64')}`;
const ASSIGNEE = process.env.ASSIGNEE_ACCOUNT_ID || '';

const args = process.argv.slice(2);
const PHASE = args[0];
const DRY = args.includes('--dry-run');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : Infinity; })();

let writes = 0;
const bumpWrites = (what) => {
  if (DRY) { return; }
  if (++writes > MAX_WRITES) { throw new Error(`circuit breaker: >${MAX_WRITES} writes (at ${what})`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
// Generalized 2026-08-13 (Fase 2.3, MG->TM rename): takes the expected prefix as a
// parameter instead of hardcoding 'MG-', so the same guard works for any project this
// script (or a copy of it) targets. Call sites below pass PROJECT_KEY, so behavior for
// THIS campaign is unchanged -- see the note on PROJECT_KEY for why it stays 'MG'.
function assertProjectKey(key, what, expectedPrefix = PROJECT_KEY) {
  if (typeof key !== 'string' || !key.startsWith(`${expectedPrefix}-`)) {
    throw new Error(`CROSS-PROJECT ABORT: ${what} returned key ${key}. Expected ${expectedPrefix}-*.`);
  }
}

// ---------------------------------------------------------------------------
// Jira REST
// ---------------------------------------------------------------------------
async function jira(path, init = {}) {
  const res = await fetch(`${JIRA_URL}${path}`, {
    ...init,
    headers: {
      Authorization: JIRA_AUTH,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira ${init.method || 'GET'} ${path} -> ${res.status} ${body.slice(0, 400)}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Wiki markup as a plain string via REST v2 renders correctly on this site
 *  and auto-links issue keys — far simpler and safer than hand-writing ADF.
 */
async function setDescription(key, wiki) {
  if (DRY) { return; }
  bumpWrites(`description ${key}`);
  await jira(`/rest/api/2/issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ fields: { description: wiki } }),
  });
}

async function findByLabel(label) {
  const jql = `project = ${PROJECT_KEY} AND labels = "${label}"`;
  const r = await jira(`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=5`);
  return (r.issues || []).map(i => i.key);
}

async function existingLinks(key) {
  const r = await jira(`/rest/api/3/issue/${key}?fields=issuelinks`);
  return (r.fields.issuelinks || []).map(l => ({
    typeId: l.type.id,
    other: (l.outwardIssue || l.inwardIssue)?.key,
    dir: l.outwardIssue ? 'out' : 'in',
  }));
}

/**
 * outward "tests"/"relates to" -> inward. POST /issueLink is NOT idempotent,
 *  so every caller diffs against existingLinks() first.
 */
async function link(typeId, outwardKey, inwardKey) {
  if (DRY) { return; }
  bumpWrites(`link ${outwardKey}->${inwardKey}`);
  await jira('/rest/api/3/issueLink', {
    method: 'POST',
    body: JSON.stringify({
      type: { id: typeId },
      outwardIssue: { key: outwardKey },
      inwardIssue: { key: inwardKey },
    }),
  });
}

// ---------------------------------------------------------------------------
// Xray GraphQL — local mutations, because the shipped ones hardcode jira.fields
// and cannot set parent / assignee / priority / labels.
// ---------------------------------------------------------------------------
const M_CREATE_TEST_PLAN = `
  mutation CreateTestPlan($jira: JSON!, $testIssueIds: [String]) {
    createTestPlan(testIssueIds: $testIssueIds, jira: $jira) {
      testPlan { issueId jira(fields: ["key", "summary"]) }
      warnings
    }
  }`;

const M_CREATE_TEST_EXECUTION = `
  mutation CreateTestExecution($jira: JSON!, $testIssueIds: [String], $testEnvironments: [String]) {
    createTestExecution(testIssueIds: $testIssueIds, testEnvironments: $testEnvironments, jira: $jira) {
      testExecution { issueId jira(fields: ["key", "summary"]) }
      warnings
    }
  }`;

const M_CREATE_TEST = `
  mutation CreateTest($jira: JSON!, $testType: UpdateTestTypeInput, $folderPath: String) {
    createTest(jira: $jira, testType: $testType, folderPath: $folderPath) {
      test { issueId jira(fields: ["key", "summary"]) }
      warnings
    }
  }`;

const M_ADD_STEP = `
  mutation AddTestStep($issueId: String!, $action: String, $data: String, $result: String) {
    addTestStep(issueId: $issueId, step: { action: $action, data: $data, result: $result }) { id }
  }`;

const M_CREATE_FOLDER = `
  mutation CreateFolder($projectId: String, $path: String!, $testIssueIds: [String]) {
    createFolder(projectId: $projectId, path: $path, testIssueIds: $testIssueIds) {
      folder { path testsCount }
      warnings
    }
  }`;

const M_ADD_TO_FOLDER = `
  mutation AddTestsToFolder($projectId: String, $path: String!, $testIssueIds: [String]!) {
    addTestsToFolder(projectId: $projectId, path: $path, testIssueIds: $testIssueIds) {
      folder { path testsCount }
      warnings
    }
  }`;

const M_ADD_TO_PLAN = `
  mutation AddTestsToTestPlan($issueId: String!, $testIssueIds: [String]!) {
    addTestsToTestPlan(issueId: $issueId, testIssueIds: $testIssueIds) { warning }
  }`;

const M_ADD_TO_EXEC = `
  mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String]!) {
    addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) { warning }
  }`;

/**
 * Retryable only for naturally idempotent / set-semantic operations.
 *  NEVER wrap createTest: an ECONNRESET can arrive AFTER the server committed,
 *  so a blind retry duplicates the issue (the defect in atp-bulk-create.mjs:551).
 */
const RETRYABLE = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|permissions? failed|\b5\d\d\b|\b429\b/i;
async function withRetry(fn, what, max = 5) {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= max || !RETRYABLE.test(String(e.message))) { throw e; }
      console.log(`   ↻ retry ${attempt}/${max} ${what}: ${String(e.message).slice(0, 90)}`);
      await sleep(delay); delay = Math.min(delay * 2, 30000);
    }
  }
}

// ---------------------------------------------------------------------------
// Journal — append-only, last line per key wins. Idempotency ultimately lives
// in Jira (the `tcid:` label), so a lost journal is recoverable.
// ---------------------------------------------------------------------------
function journalAppend(obj) {
  if (DRY) { return; }
  appendFileSync(JOURNAL, `${JSON.stringify(obj)}\n`, 'utf8');
}

function journalRead() {
  if (!existsSync(JOURNAL)) { return { header: null, tc: new Map() }; }
  const tc = new Map();
  let header = null;
  for (const line of readFileSync(JOURNAL, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) { continue; }
    let e; try { e = JSON.parse(line); }
    catch { continue; }
    if (e.kind === 'run') { header = e; }
    else if (e.kind === 'tc') { tc.set(e.tcid, e); }
  }
  return { header, tc };
}

function loadManifest() {
  if (!existsSync(MANIFEST)) { throw new Error(`missing manifest: ${MANIFEST} — run the manifest builder first`); }
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  if (m.project !== PROJECT_KEY) { throw new Error(`manifest project ${m.project} != ${PROJECT_KEY}`); }
  if (m.tests.length !== m.expected) { throw new Error(`manifest has ${m.tests.length}, expected ${m.expected}`); }
  const { header } = journalRead();
  if (header && header.csvSha256 !== m.csvSha256) {
    throw new Error('SOURCE DRIFT: the suite changed since this run started. '
      + 'Step resume would misalign. Archive the journal and start a fresh run.');
  }
  return m;
}

function loadContainers() {
  if (!existsSync(CONTAINERS)) { throw new Error('containers not created yet — run the `containers` phase first'); }
  return JSON.parse(readFileSync(CONTAINERS, 'utf8'));
}

// ---------------------------------------------------------------------------
// Description body (wiki markup)
// ---------------------------------------------------------------------------
function testDescription(t) {
  const L = [];
  L.push(`*Caso de uso:* ${t.casoDeUso || '—'}`);
  L.push(`*Componente:* ${t.component || '—'}`);
  L.push(`*Tipo:* ${t.type} · *Severidad:* ${t.severity}`);
  L.push('');
  L.push('h3. Precondiciones');
  L.push(t.preconditions || '—');
  L.push('');
  L.push('h3. Datos de prueba');
  L.push(t.testData || '—');
  if (t.endpoints && t.endpoints !== 'No aplica') {
    L.push(''); L.push('h3. Endpoints'); L.push(`{{${t.endpoints}}}`);
  }
  if (t.notes) { L.push(''); L.push('h3. Notas'); L.push(t.notes); }
  L.push(''); L.push('h3. Trazabilidad');
  L.push(`* Historia: ${STORY_KEY}`);
  L.push(`* Identificador de suite: {{${t.tcid}}}`);
  L.push(`* Modulo: {{${t.gitlabModule}}}`);
  L.push(''); L.push('----');
  L.push(`_Historia de usuario:_ ${t.userStory}`);
  return L.join('\n');
}

function atpDescription(m) {
  const byComp = {};
  for (const t of m.tests) { byComp[t.component] = (byComp[t.component] || 0) + 1; }
  const L = [];
  L.push('h2. Alcance');
  L.push(`Plan de pruebas de aceptacion de la pantalla *Nuevo Viaje* migrada a Carrier v2 (${STORY_KEY}), release v2.0.9.`);
  L.push('Cubre el alta de viaje y el flujo posterior: creacion, clonacion de viajes finalizados y cancelados, point to point, asignacion manual de chofer y visibilidad de candidatos.');
  L.push('');
  L.push(`*Total de casos:* ${m.expected} · *Pasos:* ${m.totalSteps} · *Smoke:* ${m.smokeCount}`);
  L.push(`*Ambiente:* ${TEST_ENV} (apps-test) · *Formato:* Manual`);
  L.push('');
  L.push('h2. Cobertura por componente');
  L.push('||Componente||Casos||');
  for (const [c, n] of Object.entries(byComp).sort((a, b) => b[1] - a[1])) { L.push(`|${c}|${n}|`); }
  L.push('');
  L.push('h2. Tecnicas aplicadas');
  L.push('* Particiones de equivalencia sobre la configuracion del carrier y del tipo de servicio.');
  L.push('* Valores limite en cupo por colaborador, radio de busqueda y ventanas horarias.');
  L.push('* Tabla de decision para la interaccion cupo x tipo de cliente x tipo de servicio.');
  L.push('* Transicion de estados sobre el ciclo del viaje y las pestanas de Gestion de Viajes.');
  L.push('* Conjetura de errores sobre paridad v1 vs v2 en la migracion.');
  L.push('');
  L.push('h2. Fuera de alcance');
  L.push('* Reparto automatico y propagacion por anillos (comportamiento de backend).');
  L.push('* Pasarelas de pago: cubierto por el ATP del release de gateway (MG-178).');
  L.push('* App Pax y App Driver: solo se valida el efecto observable desde Carrier.');
  L.push('');
  L.push('h2. Casos dados de baja por criterio de QA');
  L.push('||ID||Motivo||');
  for (const [id, why] of Object.entries(m.excluded)) { L.push(`|${id}|${why}|`); }
  L.push('');
  L.push('_Los identificadores son vitalicios: los numeros liberados quedan vacantes a proposito._');
  return L.join('\n');
}

function atrDescription(m) {
  const L = [];
  L.push('h2. Resumen de ejecucion');
  L.push(`Ronda 1 sobre el ambiente *${TEST_ENV}* (apps-test, carrier US1000).`);
  L.push('');
  L.push(`Alcance de esta ronda: los *${m.smokeCount} casos smoke* como puerta Go/No-Go.`);
  L.push(`Los ${m.expected - m.smokeCount} casos restantes quedan en estado TODO dentro de esta misma ejecucion.`);
  L.push('');
  L.push('{panel:title=Lectura correcta del resultado}');
  L.push(`Ejecutar ${m.smokeCount} de ${m.expected} casos NO equivale a "la suite paso".`);
  L.push('El veredicto de esta ronda cubre unicamente la superficie smoke.');
  L.push('{panel}');
  L.push('');
  L.push('h2. Resultado');
  L.push('_Se completa al cerrar la ronda._');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------
async function phaseContainers() {
  const m = loadManifest();
  console.log(`\n=== FASE 2 · contenedores ${DRY ? '(DRY RUN)' : ''} ===\n`);

  if (existsSync(CONTAINERS)) {
    const c = JSON.parse(readFileSync(CONTAINERS, 'utf8'));
    console.log(`ya existen -> ATP ${c.atp.key} · ATR ${c.atr.key}`);
    return c;
  }
  if (DRY) {
    console.log(`ATP  "${ATP_TITLE}"  parent=${EPIC_TEST_PLANS}  assignee=${ASSIGNEE.slice(0, 18)}...`);
    console.log(`ATR  "${ATR_TITLE}"  parent=${EPIC_TEST_ARTIFACTS}  env=${TEST_ENV}`);
    console.log('\ndescripcion ATP (primeras 12 lineas):');
    console.log(atpDescription(m).split('\n').slice(0, 12).map(l => `  ${l}`).join('\n'));
    return null;
  }

  const jiraFields = (summary, parentKey) => ({
    fields: {
      project: { key: PROJECT_KEY },
      summary,
      parent: { key: parentKey },
      ...(ASSIGNEE ? { assignee: { id: ASSIGNEE } } : {}),
    },
  });

  bumpWrites('createTestPlan');
  const pr = await graphql(M_CREATE_TEST_PLAN, { jira: jiraFields(ATP_TITLE, EPIC_TEST_PLANS), testIssueIds: [] });
  const atp = { key: pr.createTestPlan.testPlan.jira.key, issueId: pr.createTestPlan.testPlan.issueId };
  assertProjectKey(atp.key, 'createTestPlan');
  console.log(`✔ ATP ${atp.key}`);
  if (pr.createTestPlan.warnings?.length) { console.log(`  warnings: ${pr.createTestPlan.warnings.join('; ')}`); }

  bumpWrites('createTestExecution');
  const er = await graphql(M_CREATE_TEST_EXECUTION, {
    jira: jiraFields(ATR_TITLE, EPIC_TEST_ARTIFACTS),
    testIssueIds: [],
    testEnvironments: [TEST_ENV],
  });
  const atr = { key: er.createTestExecution.testExecution.jira.key, issueId: er.createTestExecution.testExecution.issueId };
  assertProjectKey(atr.key, 'createTestExecution');
  console.log(`✔ ATR ${atr.key}`);
  if (er.createTestExecution.warnings?.length) { console.log(`  warnings: ${er.createTestExecution.warnings.join('; ')}`); }

  await setDescription(atp.key, atpDescription(m));
  await setDescription(atr.key, atrDescription(m));

  // Read back: did Xray forward parent/assignee, or silently drop them?
  for (const [role, c, wantParent] of [['ATP', atp, EPIC_TEST_PLANS], ['ATR', atr, EPIC_TEST_ARTIFACTS]]) {
    const got = await jira(`/rest/api/3/issue/${c.key}?fields=parent,assignee,project,issuetype,summary`);
    if (got.fields.project.key !== PROJECT_KEY) { throw new Error(`HARD ABORT: ${c.key} is in ${got.fields.project.key}`); }
    c.parent = got.fields.parent?.key ?? null;
    c.assignee = got.fields.assignee?.accountId ?? null;
    console.log(`  ${role} ${c.key}: type=${got.fields.issuetype.name} parent=${c.parent} assignee=${c.assignee ? 'ok' : 'NULL'}`);
    if (c.parent !== wantParent) {
      console.log(`  ⚠ ${role} parent llego como ${c.parent}; reparando con PUT -> ${wantParent}`);
      bumpWrites(`repair parent ${c.key}`);
      await jira(`/rest/api/3/issue/${c.key}`, { method: 'PUT', body: JSON.stringify({ fields: { parent: { key: wantParent } } }) });
      c.parent = wantParent;
    }
  }

  const out = { atp, atr, story: STORY_KEY, createdAt: new Date().toISOString() };
  writeFileSync(CONTAINERS, JSON.stringify(out, null, 1), 'utf8');

  if (!journalRead().header) {
    journalAppend({
      kind: 'run',
      project: PROJECT_KEY,
      story: STORY_KEY,
      csvSha256: m.csvSha256,
      expected: m.expected,
      campaignLabel: m.campaignLabel,
      atp: atp.key,
      atr: atr.key,
      ts: new Date().toISOString(),
    });
  }
  journalAppend({ kind: 'container', role: 'atp', ...atp });
  journalAppend({ kind: 'container', role: 'atr', ...atr });

  // Container-level links (diffed): ATP->Story, ATR->Story, ATR->ATP
  const want = [
    [LINK_RELATES, atp.key, STORY_KEY],
    [LINK_RELATES, atr.key, STORY_KEY],
    [LINK_RELATES, atr.key, atp.key],
  ];
  for (const [type, from, to] of want) {
    const have = (await existingLinks(from)).some(l => l.typeId === type && l.other === to);
    if (have) { console.log(`  = enlace ya existe ${from} -> ${to}`); continue; }
    await link(type, from, to);
    console.log(`  ✔ ${from} relates to ${to}`);
  }
  return out;
}

async function materializeOne(t, ctr, jrn) {
  const prev = jrn.tc.get(t.tcid);
  let key = prev?.key ?? null;
  let issueId = prev?.issueId ?? null;

  // Idempotency lives in Jira: adopt an existing test rather than duplicating.
  if (!key) {
    const found = await findByLabel(`tcid:${t.tcid}`);
    if (found.length > 1) { throw new Error(`DUPLICATE: ${t.tcid} matches ${found.join(', ')} — stop and resolve by hand`); }
    if (found.length === 1) {
      key = found[0];
      const got = await jira(`/rest/api/3/issue/${key}?fields=summary`);
      issueId = got.id;
      console.log(`   ↩ adoptado ${key}`);
    }
  }

  if (!key) {
    if (DRY) { return { tcid: t.tcid, key: '(dry)', steps: 0 }; }
    bumpWrites(`createTest ${t.tcid}`);
    // NOT wrapped in withRetry on purpose — see the RETRYABLE comment.
    const r = await graphql(M_CREATE_TEST, {
      jira: {
        fields: {
          project: { key: PROJECT_KEY },
          summary: t.summary,
          labels: [...t.labels, `atp:${ctr.atp.key}`, `atr:${ctr.atr.key}`],
          priority: { name: t.priority },
          ...(ASSIGNEE ? { assignee: { id: ASSIGNEE } } : {}),
        },
      },
      testType: { name: 'Manual' },
      folderPath: t.folder,
    });
    key = r.createTest.test.jira.key;
    issueId = r.createTest.test.issueId;
    assertProjectKey(key, `createTest ${t.tcid}`);
    journalAppend({ kind: 'tc', tcid: t.tcid, key, issueId, created: true, steps: 0, ts: new Date().toISOString() });
  }

  // Steps: count-based resume. addTestStep appends, so read live and continue.
  let live = 0;
  if (!DRY) {
    const g = await withRetry(() => graphql(QUERIES.getTests, { jql: `key = ${key}`, limit: 1 }), `getTests ${key}`);
    live = g?.getTests?.results?.[0]?.steps?.length ?? 0;
  }
  if (live > t.steps.length) {
    console.log(`   ⚠ ${key} tiene ${live} pasos y el manifiesto espera ${t.steps.length} — se deja para revision manual`);
  }
  else {
    for (let i = live; i < t.steps.length; i++) {
      if (DRY) { continue; }
      bumpWrites(`addTestStep ${t.tcid}#${i + 1}`);
      await withRetry(() => graphql(M_ADD_STEP, {
        issueId,
        action: t.steps[i].action,
        data: t.steps[i].data || '',
        result: t.steps[i].result || '',
      }), `addTestStep ${key}#${i + 1}`);
      await sleep(PACE_MS);
    }
  }

  if (!prev?.desc && !DRY) { await setDescription(key, testDescription(t)); }

  // Story link (MG house pattern: each Test `tests` its Story), diffed.
  let linked = prev?.linkStory ?? false;
  if (!linked && !DRY) {
    const have = (await existingLinks(key)).some(l => l.typeId === LINK_TEST && l.other === STORY_KEY);
    if (!have) { await link(LINK_TEST, key, STORY_KEY); }
    linked = true;
  }

  journalAppend({
    kind: 'tc',
    tcid: t.tcid,
    key,
    issueId,
    created: true,
    desc: true,
    steps: t.steps.length,
    linkStory: linked,
    ts: new Date().toISOString(),
  });
  return { tcid: t.tcid, key, steps: t.steps.length };
}

async function phaseTests(which) {
  const m = loadManifest();
  const ctr = loadContainers();
  const jrn = journalRead();

  let pool = m.tests;
  if (which === 'canary') {
    const two = pool.find(t => t.steps.length === 2);
    const five = pool.slice().sort((a, b) => b.steps.length - a.steps.length)[0];
    pool = [two, five].filter(Boolean);
  }
  else {
    pool = pool.filter(t => !(jrn.tc.get(t.tcid)?.linkStory)).slice(0, LIMIT);
  }

  console.log(`\n=== ${which === 'canary' ? 'FASE 3 · canario' : 'FASE 4 · bulk'} ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`pendientes: ${pool.length} de ${m.expected}\n`);

  const done = []; const failed = [];
  let consecutive = 0;
  for (const [i, t] of pool.entries()) {
    const tag = `[${i + 1}/${pool.length}] ${t.tcid}`;
    try {
      const r = await materializeOne(t, ctr, jrn);
      done.push(r);
      consecutive = 0;
      console.log(`✔ ${tag} -> ${r.key} (${r.steps} pasos)`);
    }
    catch (e) {
      failed.push({ tcid: t.tcid, error: String(e.message).slice(0, 200) });
      journalAppend({ kind: 'error', tcid: t.tcid, error: String(e.message).slice(0, 400), ts: new Date().toISOString() });
      console.log(`✖ ${tag}: ${String(e.message).slice(0, 160)}`);
      if (/CROSS-PROJECT|circuit breaker|DUPLICATE|SOURCE DRIFT/.test(e.message)) {
        console.log('\nABORTO DURO. No se hace rollback: una campana parcial es valida.');
        break;
      }
      if (++consecutive >= MAX_CONSECUTIVE_FAILS) { console.log(`\nABORTO: ${consecutive} fallos consecutivos.`); break; }
      if (failed.length / Math.max(pool.length, 1) > MAX_FAIL_RATE && failed.length > 5) {
        console.log('\nABORTO: tasa de fallo > 5%.'); break;
      }
    }
  }

  console.log(`\nresumen: ${done.length} ok · ${failed.length} con error`);
  if (failed.length) {
    console.log('\ncasos con error (auditables):');
    for (const f of failed) { console.log(`  ${f.tcid}  ${f.error}`); }
    console.log(`\nreanudar con: bun scripts/mg19-suite-materialize.mjs ${which}`);
  }
  if (!DRY) { journalAppend({ kind: 'summary', phase: which, ok: done.length, failed: failed.length, ts: new Date().toISOString() }); }
  return { done, failed };
}

async function phaseMembership() {
  const m = loadManifest();
  const ctr = loadContainers();
  const jrn = journalRead();
  const ids = m.tests.map(t => jrn.tc.get(t.tcid)?.issueId).filter(Boolean);
  console.log(`\n=== FASE 5 · membresia Xray ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`tests con issueId conocido: ${ids.length}/${m.expected}\n`);

  for (const [role, container, query, root, mutation] of [
    ['ATP', ctr.atp, QUERIES.getTestPlanTestsPage, 'getTestPlan', M_ADD_TO_PLAN],
    ['ATR', ctr.atr, QUERIES.getTestExecutionTestsPage, 'getTestExecution', M_ADD_TO_EXEC],
  ]) {
    const current = new Set(await fetchAllAttachedTestIds(query, root, container.issueId));
    const missing = ids.filter(id => !current.has(id));
    console.log(`${role} ${container.key}: ${current.size} adentro · ${missing.length} por agregar`);
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100);
      if (DRY) { console.log(`  (dry) agregaria ${chunk.length}`); continue; }
      bumpWrites(`${role} add-tests`);
      await withRetry(() => graphql(mutation, { issueId: container.issueId, testIssueIds: chunk }), `${role} addTests`);
      console.log(`  ✔ +${chunk.length}`);
    }
  }
}

/**
 * Xray silently ignores `folderPath` on createTest (same class of silent drop as
 *  inline steps), so the repository folder has to be assigned in a second pass.
 */
async function phaseFolders() {
  const m = loadManifest();
  const jrn = journalRead();
  const ids = m.tests.map(t => jrn.tc.get(t.tcid)?.issueId).filter(Boolean);
  const projectId = '10109';
  console.log(`\n=== FASE 4c · carpeta del repositorio ${DRY ? '(DRY RUN)' : ''} ===`);
  console.log(`destino: ${m.folder} · tests: ${ids.length}\n`);
  if (DRY) { return; }

  try {
    bumpWrites('createFolder');
    const r = await graphql(M_CREATE_FOLDER, { projectId, path: m.folder, testIssueIds: [] });
    console.log(`✔ carpeta creada: ${JSON.stringify(r.createFolder?.folder)}`);
  }
  catch (e) {
    console.log(`  (la carpeta ya existia o no hizo falta crearla: ${String(e.message).slice(0, 100)})`);
  }
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    bumpWrites('addTestsToFolder');
    const r = await withRetry(() => graphql(M_ADD_TO_FOLDER, { projectId, path: m.folder, testIssueIds: chunk }), 'addTestsToFolder');
    console.log(`  ✔ +${chunk.length} -> ${JSON.stringify(r.addTestsToFolder?.folder)}`);
  }
}

async function phaseVerify() {
  const m = loadManifest();
  const ctr = loadContainers();
  console.log('\n=== VERIFICACION ===\n');

  // 1. tests + steps + folder, paginated
  const all = [];
  for (let start = 0; start < 300; start += 100) {
    const r = await graphql(QUERIES.getTestsFullDataNoCoverage, {
      jql: `project = ${PROJECT_KEY} AND labels = "${m.campaignLabel}"`,
      limit: 100,
      start,
    });
    const res = r?.getTests?.results ?? [];
    all.push(...res);
    if (all.length >= (r?.getTests?.total ?? 0) || res.length === 0) { break; }
  }
  const noSteps = all.filter(t => !t.steps?.length);
  const wrongFolder = all.filter(t => t.folder?.path && t.folder.path !== m.folder);
  console.log(`tests con el label   : ${all.length}  (esperado ${m.expected})`);
  console.log(`sin pasos            : ${noSteps.length}  ${noSteps.slice(0, 5).map(t => t.jira?.key).join(' ')}`);
  console.log(`carpeta incorrecta   : ${wrongFolder.length}`);

  const stepMismatch = [];
  const byKey = new Map(all.map(t => [t.jira?.key, t]));
  const jrn = journalRead();
  for (const t of m.tests) {
    const k = jrn.tc.get(t.tcid)?.key; if (!k) { continue; }
    const live = byKey.get(k); if (!live) { continue; }
    if ((live.steps?.length ?? 0) !== t.steps.length) { stepMismatch.push(`${t.tcid}/${k}: ${live.steps?.length} != ${t.steps.length}`); }
  }
  console.log(`pasos != manifiesto  : ${stepMismatch.length}  ${stepMismatch.slice(0, 4).join(' | ')}`);

  // 2. membership
  for (const [role, c, q, root] of [
    ['ATP', ctr.atp, QUERIES.getTestPlanTestsPage, 'getTestPlan'],
    ['ATR', ctr.atr, QUERIES.getTestExecutionTestsPage, 'getTestExecution'],
  ]) {
    const n = (await fetchAllAttachedTestIds(q, root, c.issueId)).length;
    console.log(`membresia ${role} ${c.key.padEnd(8)}: ${n}  (esperado ${m.expected})`);
  }

  // 3. links on the Story
  const links = await existingLinks(STORY_KEY);
  const tests = links.filter(l => l.typeId === LINK_TEST).length;
  const rel = links.filter(l => l.typeId === LINK_RELATES).length;
  console.log(`enlaces en ${STORY_KEY}    : ${tests} Test · ${rel} Relates · ${links.length} total`);

  // 4. cross-project contamination — deliberately NOT filtered by project
  const jql = `labels = "${m.campaignLabel}" ORDER BY key`;
  const r = await jira(`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=project&maxResults=100`);
  const foreign = (r.issues || []).filter(i => !i.key.startsWith('MG-'));
  console.log(`contaminacion        : ${foreign.length ? `✖ ${foreign.map(i => i.key).join(',')}` : '✔ ninguna'}`);

  // 5. blast radius on the Story
  const ch = await jira(`/rest/api/3/issue/${STORY_KEY}/changelog?maxResults=100`);
  const today = new Date().toISOString().slice(0, 10);
  const fields = new Set();
  for (const h of ch.values || []) {
    if (!h.created.startsWith(today)) { continue; }
    for (const it of h.items) { fields.add(it.field); }
  }
  const onlyLinks = [...fields].every(f => /link/i.test(f));
  console.log(`cambios hoy en ${STORY_KEY} : ${[...fields].join(', ') || '(ninguno)'}  ${onlyLinks ? '✔ solo enlaces' : '✖ REVISAR'}`);
}

// ---------------------------------------------------------------------------
const PHASES = {
  containers: phaseContainers,
  canary: () => phaseTests('canary'),
  bulk: () => phaseTests('bulk'),
  folders: phaseFolders,
  membership: phaseMembership,
  verify: phaseVerify,
};

if (!PHASES[PHASE]) {
  console.error(`fase desconocida: ${PHASE || '(ninguna)'}\nopciones: ${Object.keys(PHASES).join(' | ')}`);
  process.exit(1);
}
if (!JIRA_URL || !process.env.ATLASSIAN_EMAIL || !process.env.ATLASSIAN_API_TOKEN) {
  console.error('faltan ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN en .env');
  process.exit(1);
}

try {
  await PHASES[PHASE]();
  console.log(`\n(escrituras en esta corrida: ${writes})`);
}
catch (e) {
  console.error(`\nFALLO: ${e.message}`);
  process.exit(1);
}
