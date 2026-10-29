/**
 * Sincroniza el Test Plan TM-1283 (stock de automatizacion) con los specs
 * automatizados de los repos MAGIIS y TODOS sus git worktrees.
 *
 * Uso: bun run qa:stock:sync [--apply] [--prune] [--label]
 *   (sin flags = dry-run: solo imprime el diff y escribe sync-<fecha>.md)
 * Env: QA_STOCK_REPOS = raices separadas por ';' (default: los 3 repos hermanos).
 * Credenciales: igual que qa:coverage (~/.xray-cli + ATLASSIAN_*).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadConfig } from '../cli/xray/lib/config';
import { graphql } from '../cli/xray/lib/graphql';

const PLAN_KEY = 'TM-1283';
const PLAN_ISSUE_ID = '42406';
const OUT_DIR = join(import.meta.dir, '..', 'docs', 'qa', 'automation-stock');
const DEFAULT_REPOS = ['magiis-playwright', 'magiis-carrier-v2-e2e', 'magiis-api-e2e']
  .map(r => join('C:\\Users\\Erika\\OneDrive - MAGIIS USA LLC (1)\\Escritorio\\automation-projects', r));
const KEY = String.raw`(?:TM|MG|MX)-\d+`;
const SKIP_DIRS = new Set(['node_modules', 'refs', 'evidence', '.git']);

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const PRUNE = args.has('--prune');
const LABEL = args.has('--label');

interface Origin { repo: string, worktree: string, branch: string, file: string }
interface PlanTest { issueId: string, jira: { key: string, labels?: string[] } }
interface JiraIssue { id: string, key: string, fields: { issuetype?: { name: string }, labels?: string[] } }
interface Exec {
  issueId: string
  jira: { key: string, summary: string }
  testPlans: { results: Array<{ issueId: string }> }
  tests: { results: Array<{ issueId: string, jira: { key: string } }> }
  // Runs con estado: un test solo cuenta como "automatizado por ATR" si realmente corrio (estado != TO DO).
  testRuns: { results: Array<{ status: { name: string }, test: { issueId: string, jira: { key: string } } }> }
}
interface Worktree { path: string, branch: string, repo: string }
interface LooseHit { worktree: string, file: string }

// ---------- Jira REST ----------
function jiraCreds(): { baseUrl: string, auth: string } {
  const cfg = loadConfig();
  const baseUrl = cfg?.jira_base_url || process.env.ATLASSIAN_URL;
  const email = cfg?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = cfg?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;
  const missing = [
    !baseUrl && 'ATLASSIAN_URL',
    !email && 'ATLASSIAN_EMAIL',
    !token && 'ATLASSIAN_API_TOKEN',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Faltan credenciales Jira: ${missing.join(', ')} (ver .env.example)`);
  }
  return { baseUrl: baseUrl as string, auth: Buffer.from(`${email}:${token}`).toString('base64') };
}

async function jira<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const { baseUrl, auth } = jiraCreds();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 404) { return null; }
  if (!res.ok) {
    throw new Error(`Jira ${method} ${path} fallo: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function searchAll(jql: string): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  for (;;) {
    const page = await jira<{ issues: JiraIssue[], nextPageToken?: string, isLast?: boolean }>(
      'POST',
      '/rest/api/3/search/jql',
      { jql, fields: ['issuetype', 'labels'], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
    );
    if (!page) { break; }
    out.push(...page.issues);
    if (!page.nextPageToken || page.isLast) { break; }
    nextPageToken = page.nextPageToken;
  }
  return out;
}

// ---------- Xray GraphQL ----------
async function fetchPlanTests(): Promise<PlanTest[]> {
  const q = 'query($id:String!,$start:Int!){getTestPlan(issueId:$id){tests(limit:100,start:$start){total results{issueId jira(fields:["key","labels"])}}}}';
  const all: PlanTest[] = [];
  let total = Infinity;
  while (all.length < total) {
    const r = await graphql<{ getTestPlan: { tests: { total: number, results: PlanTest[] } } }>(
      q,
      { id: PLAN_ISSUE_ID, start: all.length },
    );
    total = r.getTestPlan.tests.total;
    if (r.getTestPlan.tests.results.length === 0) { break; }
    all.push(...r.getTestPlan.tests.results);
  }
  if (all.length !== total) { throw new Error(`Paginacion incompleta: ${all.length}/${total}`); }
  return all;
}

async function fetchExecs(): Promise<Exec[]> {
  const q = 'query($start:Int!){getTestExecutions(jql:"project = TM",limit:100,start:$start){total results{issueId jira(fields:["key","summary"]) testPlans(limit:100){results{issueId}} tests(limit:100){results{issueId jira(fields:["key"])}} testRuns(limit:100){results{status{name} test{issueId jira(fields:["key"])}}}}}}';
  const all: Exec[] = [];
  let total = Infinity;
  while (all.length < total) {
    const r = await graphql<{ getTestExecutions: { total: number, results: Exec[] } }>(q, { start: all.length });
    total = r.getTestExecutions.total;
    if (r.getTestExecutions.results.length === 0) { break; }
    all.push(...r.getTestExecutions.results);
  }
  return all;
}

// ---------- Escaneo de codigo ----------
function gitWorktrees(repo: string): Worktree[] {
  const r = spawnSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.warn(`Aviso: git worktree list fallo en ${repo}`);
    return [];
  }
  const out: Worktree[] = [];
  let cur: Partial<Worktree> = {};
  for (const line of `${r.stdout}\n`.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9).trim(), branch: '(detached)', repo };
    }
    else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7).trim().replace('refs/heads/', '');
    }
    else if (line === '' && cur.path) {
      if (existsSync(cur.path)) { out.push(cur as Worktree); }
      cur = {};
    }
  }
  return out;
}

/** Quita comentarios de linea y de bloque respetando strings y template literals. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') { i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { i++; }
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      out += c;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { out += src[i++]; }
        if (c !== '`' && src[i] === '\n') { break; }
        out += src[i++];
      }
      if (i < src.length) { out += src[i++]; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function walk(dir: string, visit: (file: string) => void): void {
  let entries: string[];
  try { entries = readdirSync(dir); }
  catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) { continue; }
    const full = join(dir, name);
    let isDir: boolean;
    try { isDir = statSync(full).isDirectory(); }
    catch { continue; }
    if (isDir) {
      if (full.replace(/\\/g, '/').endsWith('tests/specs/exploratory')) { continue; }
      walk(full, visit);
    }
    else {
      visit(full);
    }
  }
}

function extractKeys(file: string, raw: string): Set<string> {
  const src = stripComments(raw);
  const keys = new Set<string>();
  const keyRe = new RegExp(`^${KEY}$`);
  const add = (k: string | undefined): void => { if (k && keyRe.test(k)) { keys.add(k); } };
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g)) { consts.set(m[1], m[2]); }
  for (const m of src.matchAll(/makeAnnotate\(\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))/g)) {
    add(m[2] ?? consts.get(m[3]));
  }
  for (const m of src.matchAll(new RegExp(String.raw`@atc\(\s*['"](${KEY})['"]`, 'g'))) { add(m[1]); }
  for (const m of src.matchAll(new RegExp(String.raw`type:\s*['"](?:tms|test_key)['"]\s*,\s*description:\s*['"](${KEY})['"]`, 'g'))) { add(m[1]); }
  for (const m of src.matchAll(new RegExp(String.raw`description:\s*['"](${KEY})['"]\s*,\s*type:\s*['"](?:tms|test_key)['"]`, 'g'))) { add(m[1]); }
  for (const m of src.matchAll(/\b(?:tms|test_key)\s*:\s*([^\n}]*)/g)) {
    for (const k of m[1].matchAll(/['"`]((?:TM|MG|MX)-\d+)['"`]/g)) { add(k[1]); }
  }
  for (const m of src.matchAll(/\b(?:test|it)(?:\.(?:only|skip|fixme))?\(\s*['"`]\s*((?:TM|MG|MX)-\d+)\b/g)) { add(m[1]); }
  if (/(?:^|[\\/])xray-keys\.ts$/.test(file)) {
    for (const m of src.matchAll(new RegExp(String.raw`['"](${KEY})['"]`, 'g'))) { add(m[1]); }
  }
  return keys;
}

function scanWorktree(wt: Worktree, found: Map<string, Origin[]>, execHits: Set<string>): void {
  const testsDir = join(wt.path, 'tests');
  if (existsSync(testsDir)) {
    walk(testsDir, (file) => {
      if (!file.endsWith('.ts') || file.endsWith('.diag.spec.ts')) { return; }
      const raw = readFileSync(file, 'utf8');
      if (!/(?:TM|MG|MX)-\d+/.test(raw)) { return; }
      for (const k of extractKeys(file, raw)) {
        const list = found.get(k) ?? [];
        list.push({ repo: wt.repo, worktree: wt.path, branch: wt.branch, file: relative(wt.path, file).replace(/\\/g, '/') });
        found.set(k, list);
      }
    });
  }
  const grepExec = (raw: string): void => {
    for (const m of raw.matchAll(/XRAY_EXECUTION_KEY\s*[=:]\s*\?['"]?(TM-\d+)/g)) { execHits.add(m[1]); }
  };
  const pkg = join(wt.path, 'package.json');
  if (existsSync(pkg)) {
    try {
      grepExec(JSON.stringify((JSON.parse(readFileSync(pkg, 'utf8')) as { scripts?: unknown }).scripts ?? {}));
    }
    catch { /* package.json invalido */ }
  }
  const envExample = join(wt.path, '.env.example');
  if (existsSync(envExample)) { grepExec(readFileSync(envExample, 'utf8')); }
  for (const sub of ['.github', 'scripts']) {
    const dir = join(wt.path, sub);
    if (!existsSync(dir)) { continue; }
    walk(dir, (file) => {
      if (sub === '.github') { grepExec(readFileSync(file, 'utf8')); }
      if ((file.replace(/\\/g, '/').split('/').pop() ?? '').startsWith('run-xray-atr')) {
        for (const m of stripComments(readFileSync(file, 'utf8')).matchAll(/\bTM-\d+\b/g)) { execHits.add(m[0]); }
      }
    });
  }
}

/** Ultima ocurrencia (incluso en comentarios) de las keys stale, para el reporte. */
function looseLocations(worktrees: Worktree[], keys: string[]): Map<string, LooseHit> {
  const out = new Map<string, LooseHit>();
  if (!keys.length) { return out; }
  const re = new RegExp(String.raw`\b(?:${keys.join('|')})\b`, 'g');
  for (const wt of worktrees) {
    const dir = join(wt.path, 'tests');
    if (!existsSync(dir)) { continue; }
    walk(dir, (file) => {
      if (!file.endsWith('.ts')) { return; }
      for (const m of new Set(readFileSync(file, 'utf8').match(re) ?? [])) {
        out.set(m, { worktree: wt.path, file: relative(wt.path, file).replace(/\\/g, '/') });
      }
    });
  }
  return out;
}

// ---------- Resolucion ----------
interface Resolved { tests: Map<string, JiraIssue>, moved: Map<string, string>, ignored: Map<string, string> }

async function resolveKeys(keys: string[]): Promise<Resolved> {
  const tests = new Map<string, JiraIssue>();
  const ignored = new Map<string, string>();
  const moved = new Map<string, string>();
  const returned = new Set<string>();
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    for (const is of await searchAll(`key in (${batch.join(',')})`)) {
      returned.add(is.key);
      if (is.fields.issuetype?.name === 'Xray Test') { tests.set(is.key, is); }
      else if (batch.includes(is.key)) { ignored.set(is.key, is.fields.issuetype?.name ?? '?'); }
    }
  }
  // Keys no devueltas tal cual: probablemente movidas (MG -> TM); resolver por GET individual.
  for (const k of keys) {
    if (returned.has(k)) { continue; }
    const is = await jira<JiraIssue>('GET', `/rest/api/3/issue/${k}?fields=issuetype,labels`);
    if (!is) { ignored.set(k, 'no existe en Jira'); continue; }
    if (is.fields.issuetype?.name === 'Xray Test') {
      tests.set(is.key, is);
      if (is.key !== k) { moved.set(k, is.key); }
    }
    else {
      ignored.set(k, `${is.fields.issuetype?.name ?? '?'} (${is.key})`);
    }
  }
  return { tests, moved, ignored };
}

async function main(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const roots = process.env.QA_STOCK_REPOS
    ? process.env.QA_STOCK_REPOS.split(';').map(s => s.trim()).filter(Boolean)
    : DEFAULT_REPOS;
  const worktrees = roots.flatMap(gitWorktrees);
  const found = new Map<string, Origin[]>();
  const execHits = new Set<string>();
  for (const wt of worktrees) { scanWorktree(wt, found, execHits); }
  console.log(`Worktrees escaneados: ${worktrees.length} | keys halladas: ${found.size}`);

  const { tests, moved, ignored } = await resolveKeys([...found.keys()]);
  const movedByNew = new Map([...moved.entries()].map(([o, n]) => [n, o]));
  const planTests = await fetchPlanTests();
  const planKeys = new Set(planTests.map(t => t.jira.key));
  const originsOf = (k: string): Origin[] => {
    const old = movedByNew.get(k);
    return [...(found.get(k) ?? []), ...(old ? (found.get(old) ?? []) : [])];
  };

  // ATR automatizados: (a) key cableada como XRAY_EXECUTION_KEY / run-xray-atr*, (b) summary /automatiz/i; nunca /manual/i.
  const execs = await fetchExecs();
  const linked = (e: Exec): boolean => e.testPlans.results.some(p => p.issueId === PLAN_ISSUE_ID);
  const isAuto = (e: Exec): boolean => !/manual/i.test(e.jira.summary) && (execHits.has(e.jira.key) || /automatiz/i.test(e.jira.summary));
  const autoExecs = execs.filter(isAuto);
  const atrTests = new Map<string, string>();
  // Solo runs ejecutados: un test en TO DO dentro de un ATR automatizado nunca corrio y no es stock.
  for (const e of autoExecs) {
    for (const r of e.testRuns.results) {
      if (r.status.name !== 'TO DO') { atrTests.set(r.test.jira.key, r.test.issueId); }
    }
  }

  // Stock = codigo U tests de ATR automatizados
  const idOf = (k: string): string => tests.get(k)?.id ?? atrTests.get(k) ?? '';
  const stockKeys = new Set([...tests.keys(), ...atrTests.keys()]);
  const source = (k: string): string => (tests.has(k) && atrTests.has(k) ? 'ambas' : tests.has(k) ? 'código' : 'ATR');
  const toAdd = [...stockKeys]
    .filter(k => !planKeys.has(k))
    .map(k => ({ key: k, id: idOf(k) }))
    .sort((a, b) => Number(a.key.slice(3)) - Number(b.key.slice(3)));
  const stale = planTests.filter(t => !stockKeys.has(t.jira.key));
  const loose = looseLocations(worktrees, stale.map(t => t.jira.key));

  const stockIds = new Set(planTests.map(t => t.issueId));
  for (const t of toAdd) { stockIds.add(t.id); }
  const execsToLink = autoExecs.filter(e => !linked(e));
  const manualWithStock = execs.filter(e => !isAuto(e) && !linked(e) && e.tests.results.some(t => stockIds.has(t.issueId)));

  const needLabel = LABEL
    ? [...new Set([...toAdd.map(t => t.key), ...planTests.filter(t => !t.jira.labels?.includes('automated')).map(t => t.jira.key)])]
    : [];

  // ---------- Reporte ----------
  const byOrigin = new Map<string, string[]>();
  for (const t of toAdd) {
    for (const o of originsOf(t.key)) {
      const id = `${o.repo.split(/[\\/]/).pop()} | ${o.worktree} | ${o.branch}`;
      byOrigin.set(id, [...(byOrigin.get(id) ?? []), t.key]);
    }
  }
  const detail = toAdd.map((t) => {
    const old = movedByNew.has(t.key) ? ` (antes ${movedByNew.get(t.key)})` : '';
    const where = originsOf(t.key).map(o => `${o.branch}: ${o.file}`).slice(0, 3).join('<br>');
    return `| ${t.key}${old} | ${source(t.key)} | ${where || 'ATR automatizado'} |`;
  });
  const md = `# Sync del stock de automatizacion — ${date}

Plan **${PLAN_KEY}** (issueId ${PLAN_ISSUE_ID}). Modo: ${APPLY ? 'APPLY' : 'dry-run'}${PRUNE ? ' + prune' : ''}${LABEL ? ' + label' : ''}.

## Resumen

| Indicador | Valor |
| --- | ---: |
| Worktrees escaneados | ${worktrees.length} |
| Keys halladas en codigo | ${found.size} |
| Tests resueltos (Xray Test) | ${tests.size} |
| Tests en el plan hoy | ${planTests.length} |
| Altas (toAdd) | ${toAdd.length} |
| Stale (en plan, sin codigo ni ATR automatizado) | ${stale.length} |
| Ignoradas (no son Xray Test) | ${ignored.size} |
| ATR a enlazar | ${execsToLink.length} |
| ATR manuales con tests del stock | ${manualWithStock.length} |

## Altas por repo / worktree / rama

${byOrigin.size ? [...byOrigin.entries()].map(([id, ks]) => `### ${id}\n\n${ks.join(', ')}`).join('\n\n') : '_Sin altas._'}

## Altas (detalle)

${toAdd.length ? `| Test | Fuente | Origen (rama: archivo) |\n| --- | --- | --- |\n${detail.join('\n')}` : '_Sin altas._'}

## Ignoradas

${ignored.size ? `| Key | Tipo |\n| --- | --- |\n${[...ignored.entries()].sort().map(([k, v]) => `| ${k} | ${v} |`).join('\n')}` : '_Ninguna._'}

## Stale

${stale.length
  ? stale.map((t) => {
      const l = loose.get(t.jira.key);
      return `- ${t.jira.key} — ${l ? `ultima ubicacion conocida (sin anotacion valida): ${l.worktree} :: ${l.file}` : 'sin ocurrencias en ningún worktree'}`;
    }).join('\n')
  : '_Ninguno._'}

${PRUNE ? '(--prune: se retiran del plan al aplicar.)' : '(No se retiran sin --prune.)'}

## ATR

### A enlazar al plan

${execsToLink.length ? execsToLink.map(e => `- **${e.jira.key}** — ${e.jira.summary}`).join('\n') : '_Ninguno._'}

### Manuales con tests del stock (decision humana)

${manualWithStock.length ? manualWithStock.map(e => `- **${e.jira.key}** — ${e.jira.summary}`).join('\n') : '_Ninguno._'}

## Regenerar

\`bun run qa:stock:sync\` (dry-run) · \`--apply\` · \`--prune\` · \`--label\`.
`;
  if (!existsSync(OUT_DIR)) { mkdirSync(OUT_DIR, { recursive: true }); }
  writeFileSync(join(OUT_DIR, `sync-${date}.md`), md);
  console.log(`Resueltos ${tests.size} | toAdd ${toAdd.length} | stale ${stale.length} | execsToLink ${execsToLink.length} | manuales ${manualWithStock.length} | ignoradas ${ignored.size}`);
  for (const t of toAdd) {
    console.log(`  ${t.key} <- ${originsOf(t.key).map(o => `${o.branch}:${o.file}`).slice(0, 2).join(' ; ')}`);
  }
  console.log(`Escrito: docs/qa/automation-stock/sync-${date}.md`);

  if (!APPLY) {
    console.log('Dry-run: sin cambios en Xray/Jira.');
    return;
  }

  for (let i = 0; i < toAdd.length; i += 50) {
    const ids = toAdd.slice(i, i + 50).map(t => t.id);
    await graphql(
      'mutation($id:String!,$ids:[String]!){addTestsToTestPlan(issueId:$id,testIssueIds:$ids){addedTests warning}}',
      { id: PLAN_ISSUE_ID, ids },
    );
  }
  if (PRUNE) {
    for (let i = 0; i < stale.length; i += 50) {
      const ids = stale.slice(i, i + 50).map(t => t.issueId);
      await graphql(
        'mutation($id:String!,$ids:[String]!){removeTestsFromTestPlan(issueId:$id,testIssueIds:$ids)}',
        { id: PLAN_ISSUE_ID, ids },
      );
    }
  }
  for (let i = 0; i < execsToLink.length; i += 50) {
    const ids = execsToLink.slice(i, i + 50).map(e => e.issueId);
    await graphql(
      'mutation($id:String!,$ids:[String]!){addTestExecutionsToTestPlan(issueId:$id,testExecIssueIds:$ids){addedTestExecutions warning}}',
      { id: PLAN_ISSUE_ID, ids },
    );
  }
  for (const k of needLabel) {
    await jira('PUT', `/rest/api/3/issue/${k}`, { update: { labels: [{ add: 'automated' }] } });
  }
  console.log(`Aplicado: +${toAdd.length} tests, ${PRUNE ? `-${stale.length} stale, ` : ''}+${execsToLink.length} ATR, ${needLabel.length} labels.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
