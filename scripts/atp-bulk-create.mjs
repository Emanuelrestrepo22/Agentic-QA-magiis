#!/usr/bin/env bun
/**
 * ATP MG — Bulk Xray Test creation (resumable)
 *
 * Reads .context/magiis-process/atp-mg-import-NEW.csv (one row per step,
 * grouped by TCID_local) and, per unique TC:
 *   1. resolves its Test Set (existing MG-key at an offset, or a new set)
 *   2. creates a Manual Xray Test  (summary = "{setKey} | TC{n}: {Summary}")
 *   3. writes a rich V2 description (Jira ADF via REST)
 *   4. adds one manual step per CSV row
 *   5. links it to the Test Set + Test Plan MG-178
 *   6. labels it (atp-mg-gateway-release + tcid:<TCID_local>)
 *   7. appends a progress line to atp-bulk-progress.jsonl (resume-safe)
 *
 * HARD RULE (MG): only Xray entities are touched (Test / Test Set / steps /
 * membership / labels). No product tickets are created or modified.
 *
 * Resumability:
 *   - atp-set-map.json     : area -> { key, issueId }  (created/known sets)
 *   - atp-bulk-progress.jsonl : append-only, last line per tcid is authoritative,
 *                               carries per-substep flags so a crashed TC is
 *                               COMPLETED (never duplicated) on the next run.
 *
 * Usage:
 *   bun scripts/atp-bulk-create.mjs --areas MPX,J,WEB,ENT,REACT,DOC --dry-run
 *   bun scripts/atp-bulk-create.mjs --areas MPX,J,WEB,ENT,REACT,DOC
 *   bun scripts/atp-bulk-create.mjs                      # all 304 (big run)
 *   bun scripts/atp-bulk-create.mjs --create-sets-only --areas ...
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, MUTATIONS, QUERIES } from '../cli/xray/lib/graphql.ts';
import { resolveIssueId } from '../cli/xray/lib/jira.ts';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '.context', 'magiis-process', 'atp-mg-import-NEW.csv');
const SET_MAP_PATH = join(ROOT, '.context', 'magiis-process', 'atp-set-map.json');
const PROGRESS_PATH = join(ROOT, '.context', 'magiis-process', 'atp-bulk-progress.jsonl');

// Target project is the ATP's project (MG). We deliberately do NOT read
// XRAY_PROJECT_KEY from env — in this repo it is set to MX (other work) and
// silently trusting it created 32 issues in the wrong project. Override only
// via an explicit --project flag.
let PROJECT_KEY = 'MG';
const TEST_PLAN_KEY = 'MG-178';
const RELEASE_LABEL = 'atp-mg-gateway-release';
const ASSIGNEE_ID = process.env.ASSIGNEE_ACCOUNT_ID;
const JIRA_URL = process.env.ATLASSIAN_URL;
const JIRA_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_TOKEN = process.env.ATLASSIAN_API_TOKEN;

// Set registry. Existing sets: extend from `offset`. New sets: created here.
const SETS = {
  // area : { title|null, offset, existingKey|null }
  C: { existingKey: 'MG-181', offset: 5, title: null },
  D: { existingKey: 'MG-182', offset: 7, title: null },
  F: { existingKey: 'MG-184', offset: 5, title: null },
  G: { existingKey: 'MG-185', offset: 8, title: null },
  H: { existingKey: 'MG-186', offset: 4, title: null },
  TRIP: { existingKey: null, offset: 1, title: 'ATP · TRIP — Alta de viaje (Stripe)' },
  CHG: { existingKey: null, offset: 1, title: 'ATP · CHG — Cargo a bordo' },
  QUOTE: { existingKey: null, offset: 1, title: 'ATP · QUOTE — Alta de viaje desde Quote' },
  REC: { existingKey: null, offset: 1, title: 'ATP · REC — Viajes recurrentes' },
  L: { existingKey: null, offset: 1, title: 'ATP · L — Hardening PG/sistema (MX-6026)' },
  WAL: { existingKey: null, offset: 1, title: 'ATP · WAL — Wallet/tarjetas' },
  CFG: { existingKey: null, offset: 1, title: 'ATP · CFG — Configuración de pasarela' },
  COB: { existingKey: null, offset: 1, title: 'ATP · COB — Cobro/hold (Authorize)' },
  EDIT: { existingKey: null, offset: 1, title: 'ATP · EDIT — Edición de viaje' },
  CLON: { existingKey: null, offset: 1, title: 'ATP · CLON — Clonación de viaje' },
  K: { existingKey: null, offset: 1, title: 'ATP · K — Migración marketplace/OAuth/PCI (MG-13)' },
  REACT: { existingKey: null, offset: 1, title: 'ATP · REACT — Reactivación de viaje' },
  DOC: { existingKey: null, offset: 1, title: 'ATP · DOC — Documentación runbook (MG-22)' },
  J: { existingKey: null, offset: 1, title: 'ATP · J — Operación PSP' },
  WEB: { existingKey: null, offset: 1, title: 'ATP · WEB — Integraciones web' },
  ENT: { existingKey: null, offset: 1, title: 'ATP · ENT' },
  MPX: { existingKey: null, offset: 1, title: 'ATP · MPX — MercadoPago deltas' },
};

// Local Test Set create mutation that carries an assignee (MG forbids
// unassigned issues; the shared lib mutation hardcodes jira fields without one).
const CREATE_TEST_SET_WITH_JIRA = `
  mutation CreateTestSet($jira: JSON!, $testIssueIds: [String]) {
    createTestSet(testIssueIds: $testIssueIds, jira: $jira) {
      testSet { issueId jira(fields: ["key", "summary"]) }
      warnings
    }
  }
`;

// Deterministic area processing order (stable across runs).
const AREA_ORDER = [
  'CFG',
  'TRIP',
  'WAL',
  'CHG',
  'COB',
  'QUOTE',
  'REC',
  'EDIT',
  'CLON',
  'REACT',
  'L',
  'K',
  'DOC',
  'J',
  'WEB',
  'ENT',
  'MPX',
  'C',
  'D',
  'F',
  'G',
  'H',
];

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
function parseFlags(argv) {
  const f = { dryRun: false, areas: null, limit: null, createSetsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { f.dryRun = true; }
    else if (a === '--create-sets-only') { f.createSetsOnly = true; }
    else if (a === '--areas') { f.areas = (argv[++i] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean); }
    else if (a === '--limit') { f.limit = Number.parseInt(argv[++i], 10); }
    else if (a === '--project') { f.project = (argv[++i] || '').trim().toUpperCase(); }
  }
  return f;
}
const FLAGS = parseFlags(process.argv.slice(2));
if (FLAGS.project) { PROJECT_KEY = FLAGS.project; }

// Guard: the existing sets + Test Plan are all MG-*. If the resolved target
// project does not match that family, refuse (this is what would have caught
// the MX contamination). Skip the guard only when overriding intentionally.
if (!FLAGS.project && !TEST_PLAN_KEY.startsWith(`${PROJECT_KEY}-`)) {
  console.error(`FATAL: PROJECT_KEY=${PROJECT_KEY} but TEST_PLAN=${TEST_PLAN_KEY}. Refusing to run to avoid cross-project contamination.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// RFC-4180 CSV parser (handles quotes, "" escapes, embedded newlines/commas)
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      }
      else { field += c; }
    }
    else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Grouping — CSV rows -> ordered unique TCs
// ---------------------------------------------------------------------------
const COL = {
  tcid: 0,
  summary: 1,
  type: 2,
  precondition: 3,
  action: 4,
  data: 5,
  expected: 6,
  priority: 7,
  severity: 8,
  labels: 9,
  components: 10,
  legacy: 11,
  requirement: 12,
  layer: 13,
  gateways: 14,
  level: 15,
  status: 16,
};

function areaOf(tcid) {
  const m = /^TC-PAY-([A-Z]+)-\d+$/.exec(tcid.trim());
  return m ? m[1] : null;
}

function buildTcs() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(raw);
  rows.shift(); // header
  const byId = new Map();
  const order = [];
  for (const r of rows) {
    const tcid = (r[COL.tcid] || '').trim();
    if (!tcid || !tcid.startsWith('TC-PAY-')) { continue; }
    if (!byId.has(tcid)) {
      const area = areaOf(tcid);
      byId.set(tcid, {
        tcid,
        area,
        summary: (r[COL.summary] || '').trim(),
        type: (r[COL.type] || 'Manual').trim() || 'Manual',
        priority: (r[COL.priority] || '').trim(),
        severity: (r[COL.severity] || '').trim(),
        labels: (r[COL.labels] || '').trim(),
        components: (r[COL.components] || '').trim(),
        legacy: (r[COL.legacy] || '').trim(),
        requirement: (r[COL.requirement] || '').trim(),
        layer: (r[COL.layer] || '').trim(),
        gateways: (r[COL.gateways] || '').trim(),
        level: (r[COL.level] || '').trim(),
        steps: [],
      });
      order.push(tcid);
    }
    byId.get(tcid).steps.push({
      precondition: (r[COL.precondition] || '').trim(),
      action: (r[COL.action] || '').trim(),
      data: (r[COL.data] || '').trim(),
      expected: (r[COL.expected] || '').trim(),
    });
  }
  // assign tcn per area (offset + index within area, CSV order)
  const areaCounters = {};
  for (const tcid of order) {
    const tc = byId.get(tcid);
    const cfg = SETS[tc.area];
    if (!cfg) { tc.tcn = null; continue; }
    if (areaCounters[tc.area] == null) { areaCounters[tc.area] = cfg.offset; }
    tc.tcn = areaCounters[tc.area]++;
  }
  return order.map(id => byId.get(id));
}

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------
function ensureValidar(summary) {
  return /^validar\b/i.test(summary) ? summary : `Validar ${summary}`;
}

function buildSummary(setKey, tcn, csvSummary) {
  const base = `${setKey} | TC${tcn}: ${ensureValidar(csvSummary)}`;
  return base.length > 255 ? `${base.slice(0, 252)}...` : base;
}

function deriveUserStory(tc) {
  const action = ensureValidar(tc.summary).replace(/^Validar\s+/i, '').trim();
  const lc = action ? action.charAt(0).toLowerCase() + action.slice(1) : 'ejecutar el flujo';
  const req = tc.requirement ? `requerimiento ${tc.requirement}` : 'requerimiento del release';
  const gw = tc.gateways || 'de pago';
  return `Como QA del sistema de pagos MAGIIS, quiero ${lc}, para verificar que el flujo con la pasarela ${gw} cumple el comportamiento esperado del ${req}.`;
}

function inferTestKind(tc) {
  const t = tc.steps.map(s => s.expected).join(' ').toLowerCase();
  if (/bloquear|no concret|no se crea|no autoriz|error|rechaz|declin|impedir/.test(t)) { return 'Negativa'; }
  return 'Positiva';
}

// ADF helpers ---------------------------------------------------------------
const txt = t => ({ type: 'text', text: t || ' ' });
const h = (level, t) => ({ type: 'heading', attrs: { level }, content: [txt(t)] });
const p = t => ({ type: 'paragraph', content: [txt(t)] });
const bl = items => ({
  type: 'bulletList',
  content: (items.length ? items : ['—']).map(t => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [txt(t)] }],
  })),
});

function buildAdf(tc) {
  const preconds = [...new Set(tc.steps.map(s => s.precondition).filter(Boolean))];
  const datos = [...new Set(tc.steps.map(s => s.data).filter(Boolean))];
  const expected = [...new Set(tc.steps.map(s => s.expected).filter(Boolean))];
  const isFinding = /\*\*/.test(tc.summary);

  const content = [
    h(3, 'User Story'),
    p(deriveUserStory(tc)),
    h(3, 'Clasificación'),
    bl([
      'Tipo de caso: Funcional',
      `Tipo de prueba: ${inferTestKind(tc)}`,
      `Prioridad: ${tc.priority || 'N/D'}`,
      `Severidad: ${tc.severity || 'N/D'}`,
    ]),
    h(3, 'Precondiciones'),
    preconds.length ? bl(preconds) : p('Ambiente UAT con la pasarela configurada/vinculada y usuarios de prueba disponibles.'),
    h(3, 'Datos'),
    datos.length ? bl(datos) : p('No aplica / datos estándar del ambiente.'),
    h(3, 'Resultado esperado'),
    bl(expected.map(e => (/^deber/i.test(e) ? e : `Debería ${e.charAt(0).toLowerCase() + e.slice(1)}`))),
    h(3, 'Resultado obtenido'),
    p('Pendiente ejecución.'),
    h(3, 'Endpoints / DB'),
    p(`Pendiente de mapear en ejecución (Layer: ${tc.layer || 'N/D'}).`),
    h(3, 'Trazabilidad'),
    bl([
      `Requirement_MG: ${tc.requirement || 'N/D'}`,
      `Legacy_ID: ${tc.legacy || 'N/D'}`,
      `TCID_local: ${tc.tcid}`,
    ]),
    h(3, 'Observaciones'),
    p(`Layer: ${tc.layer || 'N/D'} · Gateways: ${tc.gateways || 'N/D'}${isFinding ? ' · 🔴 Posible hallazgo — revisar en ejecución.' : ''}`),
  ];
  return { type: 'doc', version: 1, content };
}

function buildLabels(tc) {
  const labels = [RELEASE_LABEL];
  // tcid:<local> — Jira labels forbid spaces; TCID has none.
  labels.push(`tcid:${tc.tcid}`);
  // carry CSV labels too (deduped, space-free)
  for (const l of tc.labels.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!/\s/.test(l) && !labels.includes(l)) { labels.push(l); }
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Retry wrapper (ECONNRESET / permissions failed / 5xx)
// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, label, max = 5) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (err) {
      attempt++;
      const msg = String((err && err.message) || err);
      const retryable = /ECONNRESET|permissions? failed|ETIMEDOUT|EAI_AGAIN|socket hang up|50\d|429|network/i.test(msg);
      if (!retryable || attempt >= max) { throw new Error(`${label} failed after ${attempt} attempt(s): ${msg}`); }
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(`   ⚠ ${label} retry ${attempt}/${max - 1} in ${backoff}ms — ${msg.slice(0, 120)}`);
      await sleep(backoff);
    }
  }
}

// ---------------------------------------------------------------------------
// Jira REST — set ADF description on an issue
// ---------------------------------------------------------------------------
async function setDescription(key, adf) {
  if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN) {
    throw new Error('Missing ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN in env for description REST.');
  }
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_URL}/rest/api/3/issue/${key}`, {
    method: 'PUT',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fields: { description: adf } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`description PUT ${key} -> ${res.status} ${t.slice(0, 200)}`);
  }
}

async function readDescriptionLen(key) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_URL}/rest/api/3/issue/${key}?fields=description`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) { return -1; }
  const j = await res.json();
  return JSON.stringify(j.fields?.description || '').length;
}

// ---------------------------------------------------------------------------
// Progress + set-map persistence
// ---------------------------------------------------------------------------
function loadSetMap() {
  if (!existsSync(SET_MAP_PATH)) { return {}; }
  try { return JSON.parse(readFileSync(SET_MAP_PATH, 'utf-8')); }
  catch { return {}; }
}
function saveSetMap(map) {
  writeFileSync(SET_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`);
}
function loadProgress() {
  const map = new Map();
  if (!existsSync(PROGRESS_PATH)) { return map; }
  for (const line of readFileSync(PROGRESS_PATH, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) { continue; }
    try { const o = JSON.parse(t); if (o.tcid) { map.set(o.tcid, o); } }
    catch { /* ignore malformed */ }
  }
  return map;
}
function appendProgress(entry) {
  appendFileSync(PROGRESS_PATH, `${JSON.stringify(entry)}\n`);
}

// ---------------------------------------------------------------------------
// Xray ops
// ---------------------------------------------------------------------------
async function createTest(tc, setKey) {
  const jiraFields = {
    summary: buildSummary(setKey, tc.tcn, tc.summary),
    labels: buildLabels(tc),
    project: { key: PROJECT_KEY },
  };
  if (ASSIGNEE_ID) { jiraFields.assignee = { id: ASSIGNEE_ID }; }
  const res = await graphql(MUTATIONS.createTest, {
    testType: { name: tc.type || 'Manual' },
    jira: { fields: jiraFields },
  });
  return res.createTest.test; // { issueId, jira:{key,summary} }
}

async function currentStepCount(key) {
  const res = await graphql(QUERIES.getTest, { jql: `key = ${key}` });
  const t = res.getTests?.results?.[0];
  return t?.steps?.length || 0;
}

async function addStepsFrom(issueId, key, steps) {
  const already = await currentStepCount(key);
  for (let i = already; i < steps.length; i++) {
    const s = steps[i];
    await withRetry(() => graphql(MUTATIONS.addTestStep, {
      issueId,
      step: { action: s.action || '(sin acción)', data: s.data || '', result: s.expected || '' },
    }), `addStep ${key} #${i + 1}`);
  }
}

async function ensureSet(area, setMap) {
  const cfg = SETS[area];
  if (cfg.existingKey) {
    if (!setMap[area]) {
      const issueId = await withRetry(() => resolveIssueId(cfg.existingKey), `resolve ${cfg.existingKey}`);
      setMap[area] = { key: cfg.existingKey, issueId, existing: true };
      saveSetMap(setMap);
    }
    return setMap[area];
  }
  if (setMap[area]?.key) { return setMap[area]; }
  const setJiraFields = { summary: cfg.title, project: { key: PROJECT_KEY } };
  if (ASSIGNEE_ID) { setJiraFields.assignee = { id: ASSIGNEE_ID }; }
  const res = await withRetry(() => graphql(CREATE_TEST_SET_WITH_JIRA, {
    jira: { fields: setJiraFields },
    testIssueIds: [],
  }), `createTestSet ${area}`);
  const set = res.createTestSet.testSet;
  setMap[area] = { key: set.jira.key, issueId: set.issueId, existing: false };
  saveSetMap(setMap);
  console.log(`   ✔ Test Set created: ${set.jira.key}  (${cfg.title})`);
  return setMap[area];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const allTcs = buildTcs();
  let tcs = allTcs.filter(t => t.area && SETS[t.area]);
  if (FLAGS.areas) { tcs = tcs.filter(t => FLAGS.areas.includes(t.area)); }
  // order by AREA_ORDER, then by tcn within area
  tcs.sort((a, b) => {
    const ai = AREA_ORDER.indexOf(a.area); const bi = AREA_ORDER.indexOf(b.area);
    return ai !== bi ? ai - bi : a.tcn - b.tcn;
  });
  if (FLAGS.limit) { tcs = tcs.slice(0, FLAGS.limit); }

  const scopeAreas = [...new Set(tcs.map(t => t.area))].sort((a, b) => AREA_ORDER.indexOf(a) - AREA_ORDER.indexOf(b));

  console.log('\n=== ATP MG bulk-create ===');
  console.log(`Mode:   ${FLAGS.dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`Areas:  ${FLAGS.areas ? FLAGS.areas.join(',') : 'ALL'} -> in scope: ${scopeAreas.join(',')}`);
  console.log(`TCs:    ${tcs.length}`);

  const setMap = loadSetMap();
  const progress = loadProgress();

  // ---- Phase 1: ensure sets ----
  console.log('\n--- Sets ---');
  for (const area of scopeAreas) {
    const cfg = SETS[area];
    if (FLAGS.dryRun) {
      const known = setMap[area]?.key;
      console.log(`   ${area.padEnd(6)} -> ${known || (cfg.existingKey || '<new set will be created>')}  ${cfg.title ? `(${cfg.title})` : `(existing, offset TC${cfg.offset})`}`);
    }
    else {
      const s = await ensureSet(area, setMap);
      console.log(`   ${area.padEnd(6)} -> ${s.key}  (offset TC${cfg.offset}${s.existing ? ', existing' : ', new'})`);
    }
  }

  if (FLAGS.createSetsOnly) {
    console.log('\n--create-sets-only: stopping after set bootstrap.');
    return;
  }

  // ---- resolve Test Plan issueId ----
  let planIssueId = null;
  if (!FLAGS.dryRun) {
    planIssueId = await withRetry(() => resolveIssueId(TEST_PLAN_KEY), `resolve ${TEST_PLAN_KEY}`);
  }

  // ---- Phase 2: per-TC ----
  console.log('\n--- Tests ---');
  const results = [];
  for (const tc of tcs) {
    const setKey = FLAGS.dryRun
      ? (setMap[tc.area]?.key || SETS[tc.area].existingKey || `<${tc.area}-new>`)
      : setMap[tc.area].key;

    if (FLAGS.dryRun) {
      const adf = buildAdf(tc);
      console.log(`   [${tc.area}] ${tc.tcid} -> "${buildSummary(setKey, tc.tcn, tc.summary)}"  steps=${tc.steps.length}  descBlocks=${adf.content.length}  labels=[${buildLabels(tc).join(', ')}]`);
      results.push({ tcid: tc.tcid, set: setKey, tcn: tc.tcn, steps: tc.steps.length });
      continue;
    }

    let entry = progress.get(tc.tcid) || {
      tcid: tc.tcid,
      area: tc.area,
      set: setKey,
      tcn: tc.tcn,
      mgKey: null,
      issueId: null,
      desc: false,
      steps: false,
      inSet: false,
      inPlan: false,
    };

    try {
      // create
      if (!entry.mgKey) {
        const test = await withRetry(() => createTest(tc, setKey), `createTest ${tc.tcid}`);
        entry = { ...entry, mgKey: test.jira.key, issueId: test.issueId, set: setKey, tcn: tc.tcn };
        appendProgress(entry);
      }
      // description
      if (!entry.desc) {
        await withRetry(() => setDescription(entry.mgKey, buildAdf(tc)), `desc ${entry.mgKey}`);
        entry = { ...entry, desc: true };
        appendProgress(entry);
      }
      // steps
      if (!entry.steps) {
        await addStepsFrom(entry.issueId, entry.mgKey, tc.steps);
        entry = { ...entry, steps: true };
        appendProgress(entry);
      }
      // set membership
      if (!entry.inSet) {
        await withRetry(() => graphql(MUTATIONS.addTestsToTestSet, {
          issueId: setMap[tc.area].issueId,
          testIssueIds: [entry.issueId],
        }), `addToSet ${entry.mgKey}`);
        entry = { ...entry, inSet: true };
        appendProgress(entry);
      }
      // plan membership
      if (!entry.inPlan) {
        await withRetry(() => graphql(MUTATIONS.addTestsToTestPlan, {
          issueId: planIssueId,
          testIssueIds: [entry.issueId],
        }), `addToPlan ${entry.mgKey}`);
        entry = { ...entry, inPlan: true };
        appendProgress(entry);
      }
      progress.set(tc.tcid, entry);
      const descLen = await readDescriptionLen(entry.mgKey);
      console.log(`   ✔ [${tc.area}] ${tc.tcid} -> ${entry.mgKey}  TC${tc.tcn}  steps=${tc.steps.length}  desc=${descLen > 50 ? 'OK' : 'CHECK'}  set/plan=OK`);
      results.push({ tcid: tc.tcid, mgKey: entry.mgKey, set: setKey, tcn: tc.tcn, steps: tc.steps.length, descLen });
    }
    catch (err) {
      console.error(`   ✘ [${tc.area}] ${tc.tcid} FAILED: ${err.message}`);
      results.push({ tcid: tc.tcid, error: err.message });
    }
  }

  // ---- summary ----
  const ok = results.filter(r => r.mgKey && !r.error);
  const failed = results.filter(r => r.error);
  console.log(`\n=== Done: ${ok.length} created/completed, ${failed.length} failed (${FLAGS.dryRun ? 'dry-run' : 'live'}) ===`);
  if (failed.length) { failed.forEach(f => console.log(`   ✘ ${f.tcid}: ${f.error}`)); }
}

main().catch((e) => { console.error(e); process.exit(1); });
