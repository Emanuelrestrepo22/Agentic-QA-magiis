/**
 * Attaches a set of TM tests (selected by label) to a Xray repository folder,
 * a Test Plan and a Test Execution — idempotently and with retry.
 *
 * Split out from the creation scripts on purpose: Xray Cloud intermittently answers
 * "Error collecting jira information for issue 'N', the project may need to be
 * re-indexed!" right after a burst of createTest calls. Membership is set-semantic,
 * so it is always safe to retry — unlike createTest, which is never retried.
 *
 * Usage:
 *   bun scripts/tm-attach-membership.mjs --label destino-abierto --plan TM-36 --exec TM-18 [--dry-run]
 *   bun scripts/tm-attach-membership.mjs --label destino-abierto --plan TM-36 --exec TM-18 --folder "/Carrier/v2-front/AltaViaje"
 */

import { fetchAllAttachedTestIds, graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const PROJECT_KEY = 'TM';
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes('--dry-run');

const LABEL = flag('label');
const PLAN = flag('plan');
const EXEC = flag('exec');
const FOLDER = flag('folder', '/Carrier/v2-front/AltaViaje');

if (!LABEL) { console.error('falta --label'); process.exit(1); }

const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH = `Basic ${Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString('base64')}`;
const jira = async (p) => {
  const r = await fetch(`${JIRA}${p}`, { headers: { Authorization: AUTH, Accept: 'application/json' } });
  if (!r.ok) { throw new Error(`Jira ${p} -> ${r.status}`); }
  return r.json();
};

const M_CREATE_FOLDER = `
  mutation CreateFolder($projectId: String, $path: String!, $testIssueIds: [String]) {
    createFolder(projectId: $projectId, path: $path, testIssueIds: $testIssueIds) {
      folder { path testsCount } warnings
    }
  }`;

const M_ADD_TO_FOLDER = `
  mutation AddTestsToFolder($projectId: String, $path: String!, $testIssueIds: [String]!) {
    addTestsToFolder(projectId: $projectId, path: $path, testIssueIds: $testIssueIds) {
      folder { path testsCount } warnings
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

// The re-index error is transient and membership is idempotent → always retryable.
const RETRYABLE = /re-indexed|ECONNRESET|ETIMEDOUT|socket hang up|\b5\d\d\b|\b429\b|permissions? failed/i;
async function withRetry(fn, what, max = 8) {
  let delay = 2000;
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      if (attempt >= max || !RETRYABLE.test(String(e.message))) { throw e; }
      console.log(`   ↻ ${attempt}/${max} ${what}: ${String(e.message).split('\n').pop().slice(0, 80)}`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
}

const page = async start => graphql(QUERIES.getTestsFullDataNoCoverage, { jql: `project = ${PROJECT_KEY} AND labels = "${LABEL}"`, limit: 100, start });

const tests = [];
for (let s = 0; s < 500; s += 100) {
  const r = await withRetry(() => page(s), `getTests start=${s}`);
  const res = r?.getTests?.results ?? [];
  tests.push(...res);
  if (res.length < 100) { break; }
}

console.log(`\n=== membresía · label "${LABEL}" ${DRY ? '(DRY RUN)' : ''} ===`);
console.log(`tests encontrados : ${tests.length}`);
const sinPasos = tests.filter(t => !t.steps?.length);
if (sinPasos.length) { console.log(`⚠ sin pasos       : ${sinPasos.map(t => t.jira?.key).join(' ')}`); }
const fuera = tests.filter(t => t.folder?.path !== FOLDER);
console.log(`fuera de carpeta  : ${fuera.length}`);

const ids = tests.map(t => t.issueId);
if (!ids.length) { console.log('nada que hacer'); process.exit(0); }
for (const t of tests) {
  if (!String(t.jira?.key || '').startsWith(`${PROJECT_KEY}-`)) {
    throw new Error(`ABORTO: ${t.jira?.key} fuera de ${PROJECT_KEY}`);
  }
}

if (DRY) { console.log(`\n(dry) ataría ${ids.length} tests a ${FOLDER}, ${PLAN}, ${EXEC}`); process.exit(0); }

if (fuera.length) {
  const projectId = (await withRetry(() => graphql(QUERIES.getProjectSettings, { projectIdOrKey: PROJECT_KEY }), 'getProjectSettings')).getProjectSettings.projectId;

  // The Xray repository folder tree does NOT travel with a cross-project issue move,
  // so on a migrated project the path has to be recreated before anything can join it.
  try {
    const c = await withRetry(() => graphql(M_CREATE_FOLDER, { projectId, path: FOLDER, testIssueIds: [] }), 'createFolder');
    console.log(`✔ carpeta creada -> ${JSON.stringify(c.createFolder?.folder)}`);
  }
  catch (e) {
    if (!/already exist/i.test(String(e.message))) { console.log(`  (createFolder: ${String(e.message).split('\n').pop().slice(0, 90)})`); }
  }

  const r = await withRetry(() => graphql(M_ADD_TO_FOLDER, { projectId, path: FOLDER, testIssueIds: fuera.map(t => t.issueId) }), 'addTestsToFolder');
  console.log(`✔ carpeta -> ${JSON.stringify(r.addTestsToFolder?.folder)}`);
}

for (const [rol, key, q, root, mut] of [
  ['plan', PLAN, QUERIES.getTestPlanTestsPage, 'getTestPlan', M_ADD_TO_PLAN],
  ['exec', EXEC, QUERIES.getTestExecutionTestsPage, 'getTestExecution', M_ADD_TO_EXEC],
]) {
  if (!key) { continue; }
  const containerId = (await jira(`/rest/api/3/issue/${key}?fields=summary`)).id;
  const current = new Set(await withRetry(() => fetchAllAttachedTestIds(q, root, containerId), `${rol} read`));
  const missing = ids.filter(i => !current.has(i));
  console.log(`${rol} ${key}: ${current.size} adentro · ${missing.length} por agregar`);
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    await withRetry(() => graphql(mut, { issueId: containerId, testIssueIds: chunk }), `${rol} add`);
    console.log(`  ✔ +${chunk.length}`);
  }
  const after = (await withRetry(() => fetchAllAttachedTestIds(q, root, containerId), `${rol} verify`)).length;
  console.log(`  total ahora: ${after}`);
}
console.log('');
