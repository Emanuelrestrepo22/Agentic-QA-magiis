/**
 * Reporte de cobertura de automatizacion MAGIIS (Test Plan TM-1283).
 *
 * Uso: bun run qa:coverage
 * Credenciales: Xray via ~/.xray-cli (o `bun xray auth login`); Jira via
 * ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN (.env o config xray).
 * Salida: docs/qa/automation-stock/coverage-<fecha>.md + COVERAGE-LATEST.md
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../cli/xray/lib/config';
import { graphql } from '../cli/xray/lib/graphql';

const PLAN_KEY = 'TM-1283';
const PLAN_ISSUE_ID = '42406';
const OUT_DIR = join(import.meta.dir, '..', 'docs', 'qa', 'automation-stock');
const MANUAL_LABELS = ['requiere-ejecucion-manual', 'manual-only', 'no-automatizable'];
const AUTOMATABLE_LABELS = [
  'automation-candidate',
  'automatable-api',
  'automatable-ui',
  'capa-ui',
  'capa-api',
  'capa-ui-api',
];

interface PlanTest { issueId: string, jira: { key: string, labels?: string[], components?: Array<{ name: string } | string> } }
interface PlanExec { jira: { key: string, summary: string } }
interface JiraIssue { key: string, fields: { labels?: string[] } }

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

async function jiraPost<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, auth } = jiraCreds();
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Jira ${path} fallo: ${res.status} ${res.statusText} (revisar ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN)`);
  }
  return (await res.json()) as T;
}

async function approxCount(jql: string): Promise<number> {
  return (await jiraPost<{ count: number }>('/rest/api/3/search/approximate-count', { jql })).count;
}

async function searchAll(jql: string): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  for (;;) {
    const page = await jiraPost<{ issues: JiraIssue[], nextPageToken?: string, isLast?: boolean }>(
      '/rest/api/3/search/jql',
      { jql, fields: ['labels'], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) },
    );
    out.push(...page.issues);
    if (!page.nextPageToken || page.isLast) { break; }
    nextPageToken = page.nextPageToken;
  }
  return out;
}

// ---------- Xray GraphQL ----------
async function fetchPlanTests(): Promise<PlanTest[]> {
  const q = 'query($id:String!,$start:Int!){getTestPlan(issueId:$id){tests(limit:100,start:$start){total results{issueId jira(fields:["key","labels","components"])}}}}';
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

async function fetchPlanExecs(): Promise<PlanExec[]> {
  const q = 'query($id:String!){getTestPlan(issueId:$id){testExecutions(limit:100){total results{jira(fields:["key","summary"])}}}}';
  const r = await graphql<{ getTestPlan: { testExecutions: { results: PlanExec[] } } }>(q, { id: PLAN_ISSUE_ID });
  return r.getTestPlan.testExecutions.results;
}

// ---------- helpers ----------
const pct = (n: number, d: number): string => (d ? ((n / d) * 100).toFixed(1) : '0.0');
function tally(items: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const i of items) { m.set(i, (m.get(i) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const table = (h: [string, string], rows: Array<[string, number]>): string =>
  [`| ${h[0]} | ${h[1]} |`, '| --- | ---: |', ...rows.map(([k, v]) => `| \`${k}\` | ${v} |`)].join('\n');

async function main(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const [planTests, execs, tmIssues, mxTotal] = await Promise.all([
    fetchPlanTests(),
    fetchPlanExecs(),
    searchAll('project = TM AND issuetype = "Xray Test"'),
    approxCount('project = MX AND issuetype = "Xray Test"'),
  ]);

  const totalTM = tmIssues.length;
  const manualOnly = tmIssues.filter(i => i.fields.labels?.some(l => MANUAL_LABELS.includes(l))).length;
  const automatable = tmIssues.filter(i => i.fields.labels?.some(l => AUTOMATABLE_LABELS.includes(l))).length;

  const stockTM = planTests.filter(t => t.jira.key.startsWith('TM-')).length;
  const stockMX = planTests.filter(t => t.jira.key.startsWith('MX-')).length;
  const stockOther = planTests.length - stockTM - stockMX;

  const labels = tally(planTests.flatMap(t => t.jira.labels ?? [])).slice(0, 25);
  const comps = tally(planTests.flatMap(t => (t.jira.components ?? []).map(c => (typeof c === 'string' ? c : c.name))));
  const tcidFam = tally(planTests.flatMap(t => (t.jira.labels ?? [])
    .filter(l => l.startsWith('tcid:'))
    .map(l => l.slice(5).replace(/-\d+$/, ''))));

  const headline = pct(stockTM, totalTM);
  const otherRow = stockOther ? `| Stock otros proyectos | ${stockOther} |\n` : '';
  const body = `# Cobertura de automatizacion MAGIIS — ${date}

Fuente: Test Plan Xray **${PLAN_KEY}** (issueId ${PLAN_ISSUE_ID}). Metrica y criterios: \`INVENTARIO.md\`.

## Resumen

**Cobertura sobre TM: ${stockTM} / ${totalTM} = ${headline} %**

| Indicador | Valor |
| --- | ---: |
| Stock automatizado en el plan (TM + MX) | ${planTests.length} |
| Stock TM | ${stockTM} |
| Stock MX | ${stockMX} |
${otherRow}| Xray Tests en TM (denominador total) | ${totalTM} |
| Xray Tests en MX | ${mxTotal} |
| TM manual-only (labels: ${MANUAL_LABELS.join(', ')}) | ${manualOnly} |
| TM automatizable etiquetado (labels: ${AUTOMATABLE_LABELS.join(', ')}) | ${automatable} |

## Cobertura por denominador

| Denominador | Valor | Cobertura |
| --- | ---: | ---: |
| Total TM | ${totalTM} | ${pct(stockTM, totalTM)} % |
| Automatizable etiquetado | ${automatable} | ${pct(stockTM, automatable)} % |
| Total TM menos manual-only | ${totalTM - manualOnly} | ${pct(stockTM, totalTM - manualOnly)} % |

Nota: "automatizable etiquetado" es cota alta; no todo Test con spec lleva label de candidato.

## Por proyecto

| Proyecto | Stock | Total Tests | Cobertura |
| --- | ---: | ---: | ---: |
| TM | ${stockTM} | ${totalTM} | ${pct(stockTM, totalTM)} % |
| MX | ${stockMX} | ${mxTotal} | ${pct(stockMX, mxTotal)} % |

## Desglose del stock

### Top 25 labels

${table(['Label', 'Tests'], labels)}

### Familias \`tcid:\`

${tcidFam.length ? table(['Familia', 'Tests'], tcidFam) : '_Sin labels `tcid:` en el stock._'}

### Componentes

${comps.length ? table(['Componente', 'Tests'], comps) : '_Sin componentes en el stock._'}

## Test Executions (ATR) vinculadas al plan (${execs.length})

${execs.length ? execs.map(e => `- **${e.jira.key}** — ${e.jira.summary}`).join('\n') : '_Ninguna._'}

## Como regenerar

\`bun run qa:coverage\` (requiere sesion Xray en \`~/.xray-cli\` y credenciales Jira \`ATLASSIAN_URL\`, \`ATLASSIAN_EMAIL\`, \`ATLASSIAN_API_TOKEN\`).
`;

  if (!existsSync(OUT_DIR)) { mkdirSync(OUT_DIR, { recursive: true }); }
  const dated = `coverage-${date}.md`;
  writeFileSync(join(OUT_DIR, dated), body);
  writeFileSync(join(OUT_DIR, 'COVERAGE-LATEST.md'), `> Ultima corrida: [${dated}](./${dated})\n\n${body}`);
  console.log(`Cobertura TM: ${stockTM}/${totalTM} = ${headline} % | stock ${planTests.length} (${stockTM} TM + ${stockMX} MX) | MX total ${mxTotal} | manual-only ${manualOnly} | automatizable ${automatable} | ATR ${execs.length}`);
  console.log(`Escrito: docs/qa/automation-stock/${dated} y COVERAGE-LATEST.md`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
