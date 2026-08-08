/**
 * Xray Release Consistency Gate (D)
 *
 * Valida la consistencia del TMS de una release (fixVersion) ANTES de cerrarla.
 * Previene el estado detectado en la primera iteracion (release 17080):
 *   - artefactos de prueba sin fixVersion (invisibles en el board de release)
 *   - issues funcionales sin ningun Test linkeado (cobertura no trazable)
 *   - Test Executions (ATR) con 0 test runs (ejecucion hueca / GO-NO-GO invalido)
 *
 * Checks:
 *   1. COVERAGE   - cada issue funcional (Historia/Error/Subtarea) tiene >=1 Test linkeado.
 *   2. VERSION    - cada artefacto (Xray Test/Test Plan/Test Execution) de la release lleva fixVersion.
 *   3. EMPTY_EXEC - ninguna ATR (Test Execution) de la release tiene 0 test runs.
 *
 * Uso:
 *   bun run xray:gate --version "17080" --tag "v1.72.6" [--project MX] [--json]
 *
 * --version  Nombre EXACTO de una fixVersion aceptada para la release (requerido,
 *            repetible). Si una release convive con alias (ej. "17080" y
 *            "v1.72.6 Web"), pasa todos; el primero es el canonico del reporte y
 *            todos se aceptan en el check VERSION. Idealmente la release usa UNO solo.
 * --tag      Token de texto para hallar artefactos aun SIN fixVersion (repetible).
 *            Fallback para el backlog no etiquetado; una vez adoptada la convencion
 *            (fixVersion obligatorio) deja de ser necesario. Default: el --version.
 * --project  Project key. Default: default_project del config o env PROJECT_KEY.
 * --json     Emite el reporte como JSON (para CI).
 *
 * Exit code 1 si cualquier check FAIL. 0 si todo PASS.
 */
import { loadConfig } from '../cli/xray/lib/config';
import { graphql, QUERIES } from '../cli/xray/lib/graphql';
import { resolveIssueId } from '../cli/xray/lib/jira';

// ----------------------------------------------------------------------------
// Tipos y constantes
// ----------------------------------------------------------------------------
const ARTIFACT_TYPES = ['Xray Test', 'Test Plan', 'Test Execution'] as const;
// Issuetypes que EXIGEN cobertura de test (excluye infra: Tarea/Task/Devops).
const COVERAGE_TYPES = ['Historia', 'Error', 'Subtarea', 'Story', 'Bug', 'Sub-task'];

interface JiraIssue {
  key: string
  fields: {
    summary: string
    issuetype: { name: string }
    fixVersions?: Array<{ name: string }>
    issuelinks?: Array<{
      type?: { name: string }
      outwardIssue?: LinkedRef
      inwardIssue?: LinkedRef
    }>
  }
}
interface LinkedRef {
  key: string
  fields?: { issuetype?: { name: string } }
}

interface Args {
  versions: string[]
  tags: string[]
  project: string
  json: boolean
}

// ----------------------------------------------------------------------------
// Parse args
// ----------------------------------------------------------------------------
function parseArgs(argv: string[]): Args {
  const versions: string[] = [];
  const tags: string[] = [];
  let project = '';
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version') { versions.push(argv[++i] ?? ''); }
    else if (a === '--tag') { tags.push(argv[++i] ?? ''); }
    else if (a === '--project') { project = argv[++i] ?? ''; }
    else if (a === '--json') { json = true; }
  }
  const cfg = loadConfig();
  project = project || cfg?.default_project || process.env.PROJECT_KEY || '';
  if (versions.length === 0) {
    console.error('ERROR: --version es requerido (nombre exacto de la fixVersion en Jira; repetible para alias).');
    process.exit(2);
  }
  if (!project) {
    console.error('ERROR: no se pudo resolver el project key (--project o default_project).');
    process.exit(2);
  }
  if (tags.length === 0) { tags.push(...versions); }
  return { versions, tags, project, json };
}

// ----------------------------------------------------------------------------
// Jira REST (Basic auth reutilizando las creds del config del xray CLI)
// ----------------------------------------------------------------------------
function jiraAuth(): { baseUrl: string, header: string } {
  const cfg = loadConfig();
  const baseUrl = cfg?.jira_base_url || process.env.ATLASSIAN_URL || '';
  const email = cfg?.jira_email || process.env.ATLASSIAN_EMAIL || '';
  const token = cfg?.jira_api_token || process.env.ATLASSIAN_API_TOKEN || '';
  if (!baseUrl || !email || !token) {
    throw new Error('Faltan credenciales Jira. Corre: bun xray auth login --jira-url <url> --jira-email <email> --jira-token <token>');
  }
  return { baseUrl, header: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

async function jiraSearch(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const { baseUrl, header } = jiraAuth();
  const out: JiraIssue[] = [];
  let startAt = 0;
  for (;;) {
    const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}`
      + `&maxResults=100&startAt=${startAt}&fields=${fields.join(',')}`;
    const res = await fetch(url, { headers: { Authorization: header, Accept: 'application/json' } });
    if (!res.ok) { throw new Error(`Jira JQL fallo (${res.status}): ${await res.text()}`); }
    const data = (await res.json()) as { issues?: JiraIssue[], total?: number };
    const issues = data.issues ?? [];
    out.push(...issues);
    if (issues.length < 100) { break; }
    startAt += 100;
  }
  return out;
}

// Un issue linkeado cuenta como "Test" si su issuetype contiene "test" pero NO
// es un contenedor (plan/execution/set). Cubre "Xray Test" y "Test".
function isLinkedTest(name?: string): boolean {
  if (!name) { return false; }
  const n = name.toLowerCase();
  return n.includes('test') && !/plan|execution|set/.test(n);
}

function linkedTestKeys(issue: JiraIssue): string[] {
  const keys: string[] = [];
  for (const link of issue.fields.issuelinks ?? []) {
    const ref = link.outwardIssue ?? link.inwardIssue;
    if (ref && isLinkedTest(ref.fields?.issuetype?.name)) { keys.push(ref.key); }
  }
  return keys;
}

// ----------------------------------------------------------------------------
// Checks
// ----------------------------------------------------------------------------
interface Finding { check: string, key: string, detail: string }

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const canonical = args.versions[0];
  const acceptedVersions = new Set(args.versions);
  const findings: Finding[] = [];
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  const versionInClause = args.versions.map(q).join(',');

  // --- Descubrimiento de artefactos de la release -------------------------
  // (a) correctamente etiquetados por fixVersion
  const byVersionJql = `project = ${args.project} AND issuetype in (${ARTIFACT_TYPES.map(q).join(',')}) AND fixVersion in (${versionInClause})`;
  // (b) fallback por texto en summary (backlog aun sin fixVersion)
  const tagClause = args.tags.map(t => `summary ~ ${q(t)}`).join(' OR ');
  const byTagJql = `project = ${args.project} AND issuetype in (${ARTIFACT_TYPES.map(q).join(',')}) AND (${tagClause})`;

  const [taggedArtifacts, textArtifacts] = await Promise.all([
    jiraSearch(byVersionJql, ['summary', 'issuetype', 'fixVersions']),
    jiraSearch(byTagJql, ['summary', 'issuetype', 'fixVersions']),
  ]);

  const artifacts = new Map<string, JiraIssue>();
  for (const it of [...taggedArtifacts, ...textArtifacts]) { artifacts.set(it.key, it); }

  // --- Check 2: VERSION (fixVersion presente y correcto) ------------------
  for (const it of artifacts.values()) {
    const versions = (it.fields.fixVersions ?? []).map(v => v.name);
    if (!versions.some(v => acceptedVersions.has(v))) {
      findings.push({
        check: 'VERSION',
        key: it.key,
        detail: `${it.fields.issuetype.name} sin fixVersion aceptada [${args.versions.join(' | ')}] (tiene: ${versions.length ? versions.join(', ') : 'ninguna'})`,
      });
    }
  }

  // --- Check 3: EMPTY_EXEC (ATR con 0 runs) -------------------------------
  const executions = [...artifacts.values()].filter(it => it.fields.issuetype.name === 'Test Execution');
  for (const exe of executions) {
    try {
      const issueId = await resolveIssueId(exe.key);
      const res = await graphql<{ getTestExecution: { testRuns?: { total?: number } } }>(
        QUERIES.getTestExecution,
        { issueId },
      );
      const total = res.getTestExecution?.testRuns?.total ?? 0;
      if (total === 0) {
        findings.push({ check: 'EMPTY_EXEC', key: exe.key, detail: `ATR con 0 test runs: ${exe.fields.summary}` });
      }
    }
    catch (e) {
      findings.push({ check: 'EMPTY_EXEC', key: exe.key, detail: `no se pudo leer runs: ${(e as Error).message}` });
    }
  }

  // --- Check 1: COVERAGE (issue funcional sin Test linkeado) --------------
  const coverageJql = `project = ${args.project} AND fixVersion in (${versionInClause}) AND issuetype in (${COVERAGE_TYPES.map(q).join(',')})`;
  const funcIssues = await jiraSearch(coverageJql, ['summary', 'issuetype', 'issuelinks']);
  for (const it of funcIssues) {
    const tests = linkedTestKeys(it);
    if (tests.length === 0) {
      findings.push({ check: 'COVERAGE', key: it.key, detail: `sin Test linkeado: ${it.fields.summary}` });
    }
  }

  // --- Reporte ------------------------------------------------------------
  const summary = {
    version: canonical,
    acceptedVersions: args.versions,
    project: args.project,
    artifacts: artifacts.size,
    functionalIssues: funcIssues.length,
    executions: executions.length,
    findings: findings.length,
    byCheck: {
      COVERAGE: findings.filter(f => f.check === 'COVERAGE').length,
      VERSION: findings.filter(f => f.check === 'VERSION').length,
      EMPTY_EXEC: findings.filter(f => f.check === 'EMPTY_EXEC').length,
    },
  };

  if (args.json) {
    console.log(JSON.stringify({ pass: findings.length === 0, summary, findings }, null, 2));
  }
  else {
    const line = '─'.repeat(64);
    const vlabel = args.versions.length > 1 ? `${canonical} (+alias: ${args.versions.slice(1).join(', ')})` : canonical;
    console.log(`\n${line}\nXray Release Gate · ${args.project} · fixVersion "${vlabel}"\n${line}`);
    console.log(`Artefactos: ${summary.artifacts} · Issues funcionales: ${summary.functionalIssues} · ATR: ${summary.executions}`);
    for (const check of ['COVERAGE', 'VERSION', 'EMPTY_EXEC'] as const) {
      const fs = findings.filter(f => f.check === check);
      const icon = fs.length === 0 ? '✅' : '❌';
      console.log(`\n${icon} ${check} (${fs.length})`);
      for (const f of fs) { console.log(`   · ${f.key}: ${f.detail}`); }
    }
    console.log(`\n${line}`);
    console.log(findings.length === 0
      ? '✅ GATE PASS — release consistente.'
      : `❌ GATE FAIL — ${findings.length} inconsistencia(s). Resolver antes de cerrar la release.`);
    console.log(line);
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('Gate error:', (e as Error).message);
  process.exit(2);
});
