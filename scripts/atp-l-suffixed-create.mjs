#!/usr/bin/env bun
/**
 * ATP MG — create the 12 letter-suffixed Area-L Tests the main bulk script
 * structurally skips (its areaOf regex only matches digit-only suffixes).
 *
 * Targets exactly: L-09a L-09b L-12a L-12b L-12c L-13a L-13b L-13c
 *                  L-14a L-14b L-16a L-16b   (CSV order)
 * numbered TC12..TC23 (11 integer-suffix L tests already exist as TC1..TC11).
 *
 * Per TC: create Manual Test -> V2 ADF description -> one step ->
 * add to Set MG-206 -> add to Plan MG-178 -> labels
 * (atp-mg-gateway-release + tcid:<local> + CSV labels).
 *
 * Resumable via the shared atp-bulk-progress.jsonl (same line shape).
 * MG only. No product tickets touched.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, MUTATIONS, QUERIES } from '../cli/xray/lib/graphql.ts';
import { resolveIssueId } from '../cli/xray/lib/jira.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '.context', 'magiis-process', 'atp-mg-import-NEW.csv');
const PROGRESS_PATH = join(ROOT, '.context', 'magiis-process', 'atp-bulk-progress.jsonl');

const PROJECT_KEY = 'MG';
const TEST_PLAN_KEY = 'MG-178';
const SET_KEY = 'MG-206';
const SET_ISSUE_ID = '40130';
const START_TCN = 12;
const RELEASE_LABEL = 'atp-mg-gateway-release';
const ASSIGNEE_ID = process.env.ASSIGNEE_ACCOUNT_ID;
const JIRA_URL = process.env.ATLASSIAN_URL;
const JIRA_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_TOKEN = process.env.ATLASSIAN_API_TOKEN;

const TARGET_TCIDS = [
  'TC-PAY-L-09a',
  'TC-PAY-L-09b',
  'TC-PAY-L-12a',
  'TC-PAY-L-12b',
  'TC-PAY-L-12c',
  'TC-PAY-L-13a',
  'TC-PAY-L-13b',
  'TC-PAY-L-13c',
  'TC-PAY-L-14a',
  'TC-PAY-L-14b',
  'TC-PAY-L-16a',
  'TC-PAY-L-16b',
];

const DRY = process.argv.includes('--dry-run');

// --- RFC-4180 CSV parser (verbatim from atp-bulk-create.mjs) ---------------
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

function buildTargets() {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  rows.shift();
  const byId = new Map();
  for (const r of rows) {
    const tcid = (r[COL.tcid] || '').trim();
    if (!TARGET_TCIDS.includes(tcid)) { continue; }
    if (!byId.has(tcid)) {
      byId.set(tcid, {
        tcid,
        area: 'L',
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
    }
    byId.get(tcid).steps.push({
      precondition: (r[COL.precondition] || '').trim(),
      action: (r[COL.action] || '').trim(),
      data: (r[COL.data] || '').trim(),
      expected: (r[COL.expected] || '').trim(),
    });
  }
  // deterministic order = TARGET_TCIDS order; tcn starts at START_TCN
  return TARGET_TCIDS.map((id, i) => {
    const tc = byId.get(id);
    if (!tc) { throw new Error(`Target tcid not found in CSV: ${id}`); }
    tc.tcn = START_TCN + i;
    return tc;
  });
}

// --- content builders (verbatim from atp-bulk-create.mjs) ------------------
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
  const isFinding = /\*\*/.test(tc.summary) || /finding|hallazgo/i.test(tc.labels);
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
  const labels = [RELEASE_LABEL, `tcid:${tc.tcid}`];
  for (const l of tc.labels.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!/\s/.test(l) && !labels.includes(l)) { labels.push(l); }
  }
  return labels;
}

// --- retry + REST ----------------------------------------------------------
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
async function setDescription(key, adf) {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_URL}/rest/api/3/issue/${key}`, {
    method: 'PUT',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ fields: { description: adf } }),
  });
  if (!res.ok) { throw new Error(`description PUT ${key} -> ${res.status} ${(await res.text()).slice(0, 200)}`); }
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

// --- progress --------------------------------------------------------------
function loadProgress() {
  const map = new Map();
  if (!existsSync(PROGRESS_PATH)) { return map; }
  for (const line of readFileSync(PROGRESS_PATH, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) { continue; }
    try { const o = JSON.parse(t); if (o.tcid) { map.set(o.tcid, o); } }
    catch { /* ignore */ }
  }
  return map;
}
function appendProgress(entry) { appendFileSync(PROGRESS_PATH, `${JSON.stringify(entry)}\n`); }

// --- Xray ops --------------------------------------------------------------
async function createTest(tc) {
  const jiraFields = {
    summary: buildSummary(SET_KEY, tc.tcn, tc.summary),
    labels: buildLabels(tc),
    project: { key: PROJECT_KEY },
  };
  if (ASSIGNEE_ID) { jiraFields.assignee = { id: ASSIGNEE_ID }; }
  const res = await graphql(MUTATIONS.createTest, {
    testType: { name: tc.type || 'Manual' },
    jira: { fields: jiraFields },
  });
  return res.createTest.test;
}
async function currentStepCount(key) {
  const res = await graphql(QUERIES.getTest, { jql: `key = ${key}` });
  return res.getTests?.results?.[0]?.steps?.length || 0;
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

async function main() {
  const tcs = buildTargets();
  console.log(`\n=== ATP MG — L suffixed create (${DRY ? 'DRY-RUN' : 'LIVE'}) ===`);
  console.log(`Project: ${PROJECT_KEY}  Set: ${SET_KEY} (${SET_ISSUE_ID})  Plan: ${TEST_PLAN_KEY}`);
  console.log(`Targets: ${tcs.length}  (TC${START_TCN}..TC${START_TCN + tcs.length - 1})\n`);

  if (DRY) {
    for (const tc of tcs) {
      console.log(`   [L] ${tc.tcid} -> "${buildSummary(SET_KEY, tc.tcn, tc.summary)}"  steps=${tc.steps.length}  labels=[${buildLabels(tc).join(', ')}]`);
    }
    return;
  }
  if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN) { throw new Error('Missing ATLASSIAN_* env for description REST.'); }

  const planIssueId = await withRetry(() => resolveIssueId(TEST_PLAN_KEY), `resolve ${TEST_PLAN_KEY}`);
  const progress = loadProgress();
  const results = [];

  for (const tc of tcs) {
    let entry = progress.get(tc.tcid) || {
      tcid: tc.tcid,
      area: 'L',
      set: SET_KEY,
      tcn: tc.tcn,
      mgKey: null,
      issueId: null,
      desc: false,
      steps: false,
      inSet: false,
      inPlan: false,
    };
    try {
      if (!entry.mgKey) {
        const test = await withRetry(() => createTest(tc), `createTest ${tc.tcid}`);
        entry = { ...entry, mgKey: test.jira.key, issueId: test.issueId, set: SET_KEY, tcn: tc.tcn };
        appendProgress(entry);
      }
      if (!entry.desc) {
        await withRetry(() => setDescription(entry.mgKey, buildAdf(tc)), `desc ${entry.mgKey}`);
        entry = { ...entry, desc: true }; appendProgress(entry);
      }
      if (!entry.steps) {
        await addStepsFrom(entry.issueId, entry.mgKey, tc.steps);
        entry = { ...entry, steps: true }; appendProgress(entry);
      }
      if (!entry.inSet) {
        await withRetry(() => graphql(MUTATIONS.addTestsToTestSet, {
          issueId: SET_ISSUE_ID,
          testIssueIds: [entry.issueId],
        }), `addToSet ${entry.mgKey}`);
        entry = { ...entry, inSet: true }; appendProgress(entry);
      }
      if (!entry.inPlan) {
        await withRetry(() => graphql(MUTATIONS.addTestsToTestPlan, {
          issueId: planIssueId,
          testIssueIds: [entry.issueId],
        }), `addToPlan ${entry.mgKey}`);
        entry = { ...entry, inPlan: true }; appendProgress(entry);
      }
      progress.set(tc.tcid, entry);
      const descLen = await readDescriptionLen(entry.mgKey);
      console.log(`   ✔ [L] ${tc.tcid} -> ${entry.mgKey}  TC${tc.tcn}  steps=${tc.steps.length}  desc=${descLen > 50 ? 'OK' : 'CHECK'}  set/plan=OK`);
      results.push({ tcid: tc.tcid, mgKey: entry.mgKey });
    }
    catch (err) {
      console.error(`   ✘ [L] ${tc.tcid} FAILED: ${err.message}`);
      results.push({ tcid: tc.tcid, error: err.message });
    }
  }

  const ok = results.filter(r => r.mgKey && !r.error);
  const failed = results.filter(r => r.error);
  console.log(`\n=== Done: ${ok.length} created/completed, ${failed.length} failed ===`);
  failed.forEach(f => console.log(`   ✘ ${f.tcid}: ${f.error}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
