#!/usr/bin/env bun
/**
 * ATP MG — Fase 4: automated-execution layer (Xray).
 *
 * Modes:
 *   --analyze            classify the 341 ATP tests (automatable-api + suite). NO writes.
 *   --apply-labels       append label `automatable-api` to the automatable set (Jira REST).
 *   --create-execs       create the 5 ATR Test Executions (GraphQL, assignee-safe).
 *   --add-tests          attach automatable tests to their suite execution (GraphQL).
 *   --link               link each execution -> Test Plan MG-178 (Relates) + parent Epic + release anchor.
 *
 * HARD RULE (MG): only Xray entities + the single QA epic + labels/links. No product tickets.
 * Continue-on-error; the classification is written to scratchpad JSON and reused by write modes.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql } from '../cli/xray/lib/graphql.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, '.context', 'magiis-process', 'atp-mg-import-NEW.csv');
const CLASS_PATH = join(ROOT, '.context', 'magiis-process', 'atp-fase4-classification.json');
const EXEC_MAP_PATH = join(ROOT, '.context', 'magiis-process', 'atp-fase4-exec-map.json');
const APPLY_LOG = join(ROOT, '.context', 'magiis-process', 'atp-fase4-apply.jsonl');

const PROJECT_KEY = 'MG';
const RELEASE_LABEL = 'atp-mg-gateway-release';
const AUTOMATABLE_LABEL = 'automatable-api';
const TEST_PLAN_KEY = 'MG-178';
const RELEASE_ANCHOR = 'MG-3';
const ASSIGNEE_ID = process.env.ASSIGNEE_ACCOUNT_ID;
const JIRA_URL = process.env.ATLASSIAN_URL;
const JIRA_EMAIL = process.env.ATLASSIAN_EMAIL;
const JIRA_TOKEN = process.env.ATLASSIAN_API_TOKEN;

// ---- Suite (ATR) definitions -----------------------------------------------
// area -> suite key. Only these areas map to an execution (task spec).
const SUITES = {
  s1: { summary: 'ATR · API — Vinculación & gate', areas: ['A', 'B', 'CFG'] },
  s2: { summary: 'ATR · API — Alta/validación tarjeta & 3DS', areas: ['C', 'D', 'WAL'] },
  s3: { summary: 'ATR · API — Hold & cobro', areas: ['E', 'F', 'COB'] },
  s4: { summary: 'ATR · API — Wallet lifecycle & pax', areas: ['H'] },
  s5: { summary: 'ATR · API — Hardening PG', areas: ['L'] },
};
const AREA_TO_SUITE = {};
for (const [sid, s] of Object.entries(SUITES)) { for (const a of s.areas) { AREA_TO_SUITE[a] = sid; } }

// ---- CSV parse (RFC-4180) --------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let q = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { q = false; }
      }
      else { field += c; }
    }
    else if (c === '"') { q = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
const COL = { tcid: 0, level: 15 };

function csvLevelByTcid() {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
  rows.shift();
  const map = new Map();
  for (const r of rows) {
    const tcid = (r[COL.tcid] || '').trim();
    if (!tcid.startsWith('TC-PAY-')) { continue; }
    if (!map.has(tcid)) { map.set(tcid, (r[COL.level] || '').trim()); }
  }
  return map;
}

function areaOf(tcid) {
  const m = /^TC-PAY-([A-Z]+)-/.exec((tcid || '').trim());
  return m ? m[1] : null;
}

// Mirror-based level for strategic tcids absent from the CSV.
// mirror §5: API = A,B,C,D,E,F,H (+ G-02/03/04/06/07) and all L; UI = G-01/05, I-*.
function mirrorLevel(tcid) {
  const area = areaOf(tcid);
  const m = /^TC-PAY-[A-Z]+-(\d+)/.exec(tcid || '');
  const n = m ? Number.parseInt(m[1], 10) : null;
  if (area === 'I') { return 'UI'; }
  if (area === 'G') { return [2, 3, 4, 6, 7].includes(n) ? 'API' : 'UI'; }
  if (['A', 'B', 'C', 'D', 'E', 'F', 'H', 'L'].includes(area)) { return 'API'; }
  return 'UI';
}

function tcidFrom(labels, summary) {
  const l = (labels || []).find(x => /^tcid:/i.test(x));
  if (l) { return l.slice(5); }
  // strategic tests carry the id in the summary: "TC-PAY-A-01 · ..."
  const m = /\b(TC-PAY-[A-Z]+-\d+[a-z]?)\b/.exec(summary || '');
  return m ? m[1] : null;
}

// ---- Xray fetch: all release tests + labels --------------------------------
const GET_TESTS = `
  query($jql:String!,$limit:Int!,$start:Int!){
    getTests(jql:$jql,limit:$limit,start:$start){
      total start limit
      results{ issueId jira(fields:["key","labels","summary"]) }
    }
  }`;

async function fetchReleaseTests() {
  const jql = `project = ${PROJECT_KEY} AND labels = "${RELEASE_LABEL}"`;
  const out = [];
  let start = 0; const limit = 100; let total = Infinity;
  while (start < total) {
    const r = await graphql(GET_TESTS, { jql, limit, start });
    const g = r.getTests;
    total = g.total;
    for (const t of g.results) {
      out.push({
        issueId: t.issueId,
        key: t.jira.key,
        labels: t.jira.labels || [],
        summary: t.jira.summary || '',
      });
    }
    start += g.results.length;
    if (!g.results.length) { break; }
  }
  return out;
}

// ---- classification --------------------------------------------------------
async function classify() {
  const csv = csvLevelByTcid();
  const tests = await fetchReleaseTests();
  const rows = tests.map((t) => {
    const tcid = tcidFrom(t.labels, t.summary);
    const area = areaOf(tcid);
    const csvLevel = tcid && csv.has(tcid) ? csv.get(tcid) : null;
    const level = csvLevel || (tcid ? mirrorLevel(tcid) : 'UI');
    const levelSrc = csvLevel ? 'csv' : (tcid ? 'mirror' : 'none');
    const automatable = /API/i.test(level);
    const suite = automatable && area ? (AREA_TO_SUITE[area] || null) : null;
    const alreadyLabeled = (t.labels || []).includes(AUTOMATABLE_LABEL);
    return { key: t.key, issueId: t.issueId, tcid, area, level, levelSrc, automatable, suite, alreadyLabeled };
  });
  return rows;
}

function summarize(rows) {
  const total = rows.length;
  const auto = rows.filter(r => r.automatable);
  const bySuite = {};
  for (const sid of Object.keys(SUITES)) { bySuite[sid] = auto.filter(r => r.suite === sid); }
  const unmapped = auto.filter(r => !r.suite);
  console.log('\n=== ATP MG Fase 4 — classification ===');
  console.log(`Total release tests: ${total}`);
  console.log(`Automatable (Level⊇API): ${auto.length}`);
  console.log(`Already labeled ${AUTOMATABLE_LABEL}: ${auto.filter(r => r.alreadyLabeled).length}`);
  console.log('\n-- by suite --');
  for (const [sid, s] of Object.entries(SUITES)) {
    console.log(`  ${sid} ${s.summary}  [areas ${s.areas.join(',')}]  -> ${bySuite[sid].length} tests`);
  }
  console.log(`  (unmapped automatable, no suite): ${unmapped.length}`);
  if (unmapped.length) { console.log(`     areas: ${[...new Set(unmapped.map(r => r.area))].join(', ')}`); }
  // level source + area breakdown
  const byArea = {};
  for (const r of rows) { byArea[r.area] = byArea[r.area] || { total: 0, auto: 0 }; byArea[r.area].total++; if (r.automatable) { byArea[r.area].auto++; } }
  console.log('\n-- by area (auto/total) --');
  for (const a of Object.keys(byArea).sort()) { console.log(`  ${a}: ${byArea[a].auto}/${byArea[a].total}`); }
  console.log(`\nlevelSrc: csv=${rows.filter(r => r.levelSrc === 'csv').length} mirror=${rows.filter(r => r.levelSrc === 'mirror').length} none=${rows.filter(r => r.levelSrc === 'none').length}`);
  const noTcid = rows.filter(r => !r.tcid);
  if (noTcid.length) { console.log(`\n⚠ tests without tcid label: ${noTcid.length} -> ${noTcid.map(r => r.key).join(', ')}`); }
}

// ---- Jira REST helpers -----------------------------------------------------
const authHeader = () => `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jiraFetch(path, opts = {}) {
  const res = await fetch(`${JIRA_URL}${path}`, {
    ...opts,
    headers: { 'Authorization': authHeader(), 'Content-Type': 'application/json', 'Accept': 'application/json', ...(opts.headers || {}) },
  });
  return res;
}

async function withRetry(fn, label) {
  try { return await fn(); }
  catch (e) {
    console.warn(`   ⚠ ${label} failed once (${String(e.message).slice(0, 120)}); retrying in 4s`);
    await sleep(4000);
    return fn();
  }
}

async function appendLabel(key) {
  const res = await jiraFetch(`/rest/api/3/issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ update: { labels: [{ add: AUTOMATABLE_LABEL }] } }),
  });
  if (!res.ok && res.status !== 204) { throw new Error(`label ${key} -> ${res.status} ${(await res.text()).slice(0, 150)}`); }
}

// ---- write modes -----------------------------------------------------------
const CREATE_EXEC_WITH_JIRA = `
  mutation($jira: JSON!, $testEnvironments: [String]) {
    createTestExecution(testEnvironments: $testEnvironments, jira: $jira) {
      testExecution { issueId jira(fields: ["key", "summary"]) }
      warnings
    }
  }`;

async function createExecs(rows) {
  const auto = rows.filter(r => r.automatable && r.suite);
  const map = existsSync(EXEC_MAP_PATH) ? JSON.parse(readFileSync(EXEC_MAP_PATH, 'utf-8')) : {};
  for (const [sid, s] of Object.entries(SUITES)) {
    const n = auto.filter(r => r.suite === sid).length;
    if (!n) { console.log(`   - ${sid}: 0 tests, skipping exec creation`); continue; }
    if (map[sid]?.key) { console.log(`   = ${sid} already created: ${map[sid].key}`); continue; }
    const jira = { fields: { summary: s.summary, project: { key: PROJECT_KEY } } };
    if (ASSIGNEE_ID) { jira.fields.assignee = { id: ASSIGNEE_ID }; }
    const res = await withRetry(() => graphql(CREATE_EXEC_WITH_JIRA, { jira, testEnvironments: ['staging'] }), `createExec ${sid}`);
    const te = res.createTestExecution.testExecution;
    map[sid] = { key: te.jira.key, issueId: te.issueId, summary: s.summary, tests: n };
    writeFileSync(EXEC_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`);
    console.log(`   ✔ ${sid} -> ${te.jira.key}  "${s.summary}"  (${n} tests)`);
  }
  return map;
}

async function addTests(rows) {
  const map = JSON.parse(readFileSync(EXEC_MAP_PATH, 'utf-8'));
  const auto = rows.filter(r => r.automatable && r.suite);
  for (const [sid, exec] of Object.entries(map)) {
    const ids = auto.filter(r => r.suite === sid).map(r => r.issueId);
    if (!ids.length) { continue; }
    // chunk to be safe
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const res = await withRetry(() => graphql(
        'mutation($issueId:String!,$ids:[String!]!){ addTestsToTestExecution(issueId:$issueId,testIssueIds:$ids){ addedTests warning } }',
        { issueId: exec.issueId, ids: chunk },
      ), `addTests ${sid} [${i}]`);
      console.log(`   ✔ ${sid} ${exec.key}: added ${res.addTestsToTestExecution.addedTests.length} (chunk ${i / 50 + 1})`);
    }
  }
}

async function linkExecs() {
  const map = JSON.parse(readFileSync(EXEC_MAP_PATH, 'utf-8'));
  const epicKey = process.env.QA_ARTIFACTS_EPIC;
  if (!epicKey) { console.warn('   ⚠ QA_ARTIFACTS_EPIC not set — skipping parent link'); }
  for (const exec of Object.values(map)) {
    // 1. issue-link Relates -> Test Plan MG-178
    try {
      const r = await jiraFetch('/rest/api/3/issueLink', {
        method: 'POST',
        body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: exec.key }, outwardIssue: { key: TEST_PLAN_KEY } }),
      });
      console.log(`   ${r.ok ? '✔' : '✘'} ${exec.key} Relates ${TEST_PLAN_KEY} (${r.status})`);
    }
    catch (e) { console.warn(`   ✘ link plan ${exec.key}: ${e.message}`); }
    // 2. issue-link Relates -> release anchor MG-3
    try {
      const r = await jiraFetch('/rest/api/3/issueLink', {
        method: 'POST',
        body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: exec.key }, outwardIssue: { key: RELEASE_ANCHOR } }),
      });
      console.log(`   ${r.ok ? '✔' : '✘'} ${exec.key} Relates ${RELEASE_ANCHOR} (${r.status})`);
    }
    catch (e) { console.warn(`   ✘ link anchor ${exec.key}: ${e.message}`); }
    // 3. parent -> Epic (parent field for team-managed; fall back to epic link)
    if (epicKey) {
      const r = await jiraFetch(`/rest/api/3/issue/${exec.key}`, {
        method: 'PUT',
        body: JSON.stringify({ fields: { parent: { key: epicKey } } }),
      });
      if (r.ok || r.status === 204) { console.log(`   ✔ ${exec.key} parent -> ${epicKey}`); }
      else { console.warn(`   ✘ ${exec.key} parent -> ${epicKey}: ${r.status} ${(await r.text()).slice(0, 150)}`); }
    }
  }
}

// ---- main ------------------------------------------------------------------
async function main() {
  const mode = process.argv[2] || '--analyze';
  let rows;
  if (existsSync(CLASS_PATH) && mode !== '--analyze') {
    rows = JSON.parse(readFileSync(CLASS_PATH, 'utf-8'));
  }
  else {
    rows = await classify();
    writeFileSync(CLASS_PATH, `${JSON.stringify(rows, null, 2)}\n`);
  }

  if (mode === '--analyze') { summarize(rows); return; }

  if (mode === '--apply-labels') {
    const targets = rows.filter(r => r.automatable && !r.alreadyLabeled);
    console.log(`Applying ${AUTOMATABLE_LABEL} to ${targets.length} tests...`);
    let ok = 0; let fail = 0;
    for (const r of targets) {
      try { await withRetry(() => appendLabel(r.key), `label ${r.key}`); ok++; appendFileSync(APPLY_LOG, `${JSON.stringify({ ts: Date.now(), op: 'label', key: r.key, ok: true })}\n`); }
      catch (e) { fail++; console.error(`   ✘ ${r.key}: ${e.message}`); appendFileSync(APPLY_LOG, `${JSON.stringify({ ts: Date.now(), op: 'label', key: r.key, ok: false, err: e.message })}\n`); }
    }
    console.log(`\nLabels: ${ok} ok, ${fail} failed (already-labeled skipped: ${rows.filter(r => r.automatable && r.alreadyLabeled).length})`);
    return;
  }

  if (mode === '--create-execs') { await createExecs(rows); return; }
  if (mode === '--add-tests') { await addTests(rows); return; }
  if (mode === '--link') { await linkExecs(); return; }
  console.error(`Unknown mode: ${mode}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
