/**
 * Release 2026-08-13 — restructures TM to the 3.5 release-analysis model:
 * ONE release Test Plan (TM-667 rewritten), Test Sets per feature/component,
 * ONE Test Execution per feature, and every Test linked to the ticket it covers.
 *
 * Doctrine 3.5 (team correction, 2026-08-11): tickets of the SAME change/feature do
 * NOT get one ATP each — they share a feature-level ATP and a single Test Execution
 * that validates all of them within the release. In this train the autocomplete
 * feature (epic MG-112) spans MG-116 (App PAX) + MG-117 (App Driver).
 *
 * Xray Cloud constraint: a Test Plan cannot contain Test Sets. Hierarchy is built
 * with DOUBLE membership (each Test joins its Set AND the Plan) plus Relates links
 * Plan<->Set for navigation — same pattern as TM-35 / scripts/atp-bulk-create.mjs.
 *
 * Usage:
 *   bun scripts/tm-release-testplan.mjs <phase> [--apply]
 *   phases: sets | membership | links | atr | plan | supersede | all
 *
 * Dry run by default. State in .context/magiis-process/tm-release-state.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, MUTATIONS } from '../cli/xray/lib/graphql.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = resolve(ROOT, '.context/magiis-process');
const STATE_FILE = resolve(STATE_DIR, 'tm-release-state.json');

const PHASE = process.argv[2] ?? 'all';
const APPLY = process.argv.includes('--apply');

const PROJECT = 'TM';
const PLAN = 'TM-667'; // becomes the single release Test Plan
const EPIC_ARTIFACTS = 'TM-1';
const ASSIGNEE = '712020:3302f4bc-92ff-4619-b1e1-9721e5268e6f'; // Emanuel Restrepo

// feature ATRs (kept, one per feature)
const ATR_AUTO = 'TM-668'; // autocomplete (PAX + Driver) — rewritten in phase `atr`
const ATR_STRIPE = 'TM-619';
const ATR_PERMS = 'TM-627';

// superseded per-ticket Test Plans
const OLD_PLANS = ['TM-618', 'TM-626'];

const DRIVER_TESTS = Array.from({ length: 17 }, (_, i) => `TM-${650 + i}`); // TM-650..666
const STRIPE_TESTS = ['TM-620', 'TM-621', 'TM-622', 'TM-71', 'TM-453', 'TM-67', 'TM-87', 'TM-81', 'TM-68'];
const PERMS_TESTS = ['TM-628', 'TM-629', 'TM-630', 'TM-631', 'TM-632', 'TM-633', 'TM-634', 'TM-639', 'TM-640', 'TM-641', 'TM-642', 'TM-648'];

const SETS = [
  {
    id: 'PAX',
    summary: 'TS · MG-116 — Autocomplete App PAX (v2.5.19)',
    ticket: 'MG-116',
    tests: [],
    atr: ATR_AUTO,
  },
  {
    id: 'DRIVER',
    summary: 'TS · MG-117 — Autocomplete App Driver (v2.6.15)',
    ticket: 'MG-117',
    tests: DRIVER_TESTS,
    atr: ATR_AUTO,
  },
  {
    id: 'STRIPE',
    summary: 'TS · MG-681 — Stripe Elements iOS (App PAX v2.5.19)',
    ticket: 'MG-681',
    tests: STRIPE_TESTS,
    atr: ATR_STRIPE,
  },
  {
    id: 'PERMS',
    summary: 'TS · MG-571 — Permisos de ubicacion iOS (App Driver v2.6.15)',
    ticket: 'MG-571',
    tests: PERMS_TESTS,
    atr: ATR_PERMS,
  },
];

// ---------------------------------------------------------------- Jira REST

const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH
  = `Basic ${
    Buffer.from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`).toString('base64')}`;

const jira = async (path, init = {}) => {
  const r = await fetch(`${JIRA}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!r.ok) { throw new Error(`Jira ${path} -> ${r.status} ${(await r.text()).slice(0, 300)}`); }
  return r.status === 204 ? null : r.json();
};

const setDescription = (key, body) =>
  jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: body } }) });
const setSummary = (key, summary) =>
  jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { summary } }) });
const setParent = (key, parentKey) =>
  jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { parent: { key: parentKey } } }) });
const setAssignee = key =>
  jira(`/rest/api/3/issue/${key}/assignee`, { method: 'PUT', body: JSON.stringify({ accountId: ASSIGNEE }) });
const link = (type, inward, outward) =>
  jira('/rest/api/3/issueLink', {
    method: 'POST',
    body: JSON.stringify({ type: { name: type }, inwardIssue: { key: inward }, outwardIssue: { key: outward } }),
  });

/** key -> numeric issue id (Xray issueId) for a batch of keys */
async function resolveIds(keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const r = await jira(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(`key in (${chunk.join(',')})`)}&fields=key&maxResults=50`,
    );
    for (const iss of r.issues) { out[iss.key] = iss.id; }
  }
  return out;
}

/** existing issuelinks of a batch of keys -> { key: [{type, inward, outward, linkId}] } */
async function fetchLinks(keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const r = await jira(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(`key in (${chunk.join(',')})`)}&fields=key,issuelinks&maxResults=50`,
    );
    for (const iss of r.issues) {
      out[iss.key] = (iss.fields.issuelinks ?? []).map(l => ({
        linkId: l.id,
        type: l.type.name,
        inward: l.inwardIssue?.key ?? null,
        outward: l.outwardIssue?.key ?? null,
      }));
    }
  }
  return out;
}

/** creates the link only if an equivalent one is not already there (checked from `existing`) */
async function ensureLink(existing, type, inward, outward) {
  const have = (existing[inward] ?? []).some(
    l => l.type === type && ((l.outward === outward) || (l.inward === outward)),
  ) || (existing[outward] ?? []).some(
    l => l.type === type && ((l.outward === inward) || (l.inward === inward)),
  );
  if (have) { return 'skip'; }
  if (APPLY) { await link(type, inward, outward); }
  return 'new';
}

// ---------------------------------------------------------------- state

const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {});
const saveState = (s) => {
  if (!existsSync(STATE_DIR)) { mkdirSync(STATE_DIR, { recursive: true }); }
  writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`, 'utf8');
};
const state = loadState();
state.sets ??= {};

const SK = id => state.sets[id]?.key ?? `(set ${id} pendiente)`;

// ---------------------------------------------------------------- bodies

function setBody(s) {
  const L = [];
  const A = (x = '') => L.push(x);
  A(`h2. ${s.summary.replace('TS · ', 'Test Set · ')}`);
  A();
  A(`Agrupa los casos del componente dentro del plan de release *${PLAN}*, cubriendo el ticket *${s.ticket}*. `
    + `Ejecución: ATR único de la feature, *${s.atr}*.`);
  A();
  if (s.id === 'PAX') {
    A('{panel:title=Sin casos todavía — estructura de la release}');
    A('MG-116 no tiene aún test cases propios. Los *17 casos de la superficie Driver* (TS · MG-117, '
      + 'TM-650 … TM-666) son portables a PAX con ajustes menores de superficie (pantalla de búsqueda PAX, '
      + 'directive de keyup, skipLoader ya incorporado). Es el gap más barato de cerrar de la release: '
      + 'misma feature, mismo backend MG-118, ACs casi idénticos.');
    A();
    A('A diferencia de Driver, *la implementación de MG-116 SÍ está mergeada y auditada APROBADA* '
      + '({{magiis-mobile-passenger-v2}}, 2026-08-05): cuando estos casos existan, son ejecutables de inmediato.');
    A('{panel}');
  }
  if (s.id === 'DRIVER') {
    A('17 casos manuales (TM-650 … TM-666) derivados por técnica: BVA sobre longitud mínima y ventana de '
      + 'debounce, particiones por {{source}}, transición de estados del {{sessionToken}}, error-guessing sobre '
      + 'degradación. Precondición compartida: TM-649.');
    A();
    A('{panel:title=Ejecución bloqueada}');
    A('El código de MG-117 no está publicado en GitLab (verificado 2026-08-11): sin rama, sin MR, '
      + '{{develop}} sigue llamando a Google directo y {{release/v2.6.15}} no tiene commits propios. '
      + 'Las corridas se mantienen en {{TO DO}} hasta que exista rama + MR y el dev confirme el SHA del APK.');
    A('{panel}');
  }
  if (s.id === 'STRIPE') {
    A('9 casos: 3 nuevos de la dimensión plataforma-iOS (TM-620, TM-621, TM-622) + 6 reciclados del corpus '
      + '(TM-67, TM-68, TM-71, TM-81, TM-87, TM-453 — campañas MG-181/182/197, conservan sus vínculos de origen). '
      + 'Valida el fix del bug MG-681 (whitelist de dominios Stripe en {{config.xml}}, commit {{4c368234}}).');
  }
  if (s.id === 'PERMS') {
    A('12 casos (TM-628 … TM-634, TM-639 … TM-642, TM-648) del retest del bug MG-571 — permisos de ubicación '
      + 'en iPad/iOS pre-home. *Ejecutados: 12/12 PASSED en dispositivo físico (2026-08-11).* Es la única feature '
      + 'de la release ya verde.');
  }
  A();
  A(`_Plan de release: ${PLAN} · Ticket: ${s.ticket} · ATR: ${s.atr}._`);
  return L.join('\n');
}

function atrAutoBody() {
  const L = [];
  const A = (x = '') => L.push(x);
  A('h2. ATR · Autocomplete endpoint propio — validación release (App PAX v2.5.19 + App Driver v2.6.15)');
  A();
  A('Ejecución única de la feature *Autocomplete → endpoint propio* (épica MG-112) dentro de la release '
    + `2026-08-13, bajo el plan *${PLAN}*. Valida juntos los dos tickets de la feature en este tren: `
    + '*MG-116* (App PAX) y *MG-117* (App Driver). Backend *MG-118* ya en producción (v1.72.8).');
  A();
  A('||Ticket||Superficie||Test Set||Casos||Estado||');
  A(`|MG-116|App PAX v2.5.19|${SK('PAX')}|0 — estructura creada, casos pendientes|⚪ sin cobertura aún|`);
  A(`|MG-117|App Driver v2.6.15|${SK('DRIVER')}|17 (TM-650 … TM-666)|🔴 BLOQUEADO — código no publicado|`);
  A();
  A('{panel:title=Estado: BLOQUEADO — no ejecutable todavía}');
  A('*17 corridas creadas (superficie Driver), todas en {{TO DO}}.* La pata PAX aún no tiene casos: cuando se '
    + 'creen (portables desde los 17 de Driver), se agregan a esta misma ejecución — un solo ATR valida los N '
    + 'tickets de la feature.');
  A();
  A('La ejecución Driver no puede empezar: al 2026-08-11 no existe rama ni merge request de MG-117 en '
    + '{{repo.magiis/magiis-mobile-driver-v2}}, {{develop}} sigue llamando a Google directo y {{release/v2.6.15}} '
    + 'no tiene commits propios. El APK adjuntado el 2026-08-08 no es reproducible desde el repositorio.');
  A('{panel}');
  A();
  A('h3. Precondición de desbloqueo (pata Driver)');
  A();
  A('# Existe rama y merge request de MG-117 en {{magiis-mobile-driver-v2}}, con {{places/autocomplete}} en el diff.');
  A('# El desarrollador confirma el SHA exacto desde el que se compiló el APK 2.6.15, y ese SHA está en el repositorio.');
  A('# PO/Dev responden las contradicciones de contrato del comentario de shift-left de MG-117 ({{radius}}, {{airport}}, {{placeId}} nullable, minLength).');
  A();
  A('h3. Criterio de GO / NO-GO de la feature');
  A();
  A('*GO* si pasan los siete bloqueantes de la pata Driver: TM-650 · TM-651 · TM-656 · TM-657 · TM-654 · '
    + 'TM-662 · TM-665 — y sus equivalentes PAX cuando existan. TM-650 + TM-665 juntos son el verdadero gate '
    + 'de MG-112: que el endpoint propio responda no sirve si ante un fallo la app vuelve a Google en silencio. '
    + 'TM-662 es bloqueante porque sin {{sessionToken}} compartido Google factura cada pulsación como sesión '
    + 'independiente y el ahorro que justifica la épica no ocurre.');
  A();
  A('h3. Instrumentación');
  A();
  A('*{{chrome://inspect}} + panel Network del DevTools remoto* sobre el WebView (ambas apps son Ionic/Cordova). '
    + 'Filtros: {{autocomplete}} y {{maps.googleapis.com}}. Para degradación: {{Block request URL}} + modo offline. '
    + 'Sin proxy, sin certificado, sin instalar nada en el dispositivo.');
  A();
  A('h3. Datos y entorno');
  A();
  A('Entorno *test* · backend magiis-be *v1.72.8+* · App Driver *v2.6.15* ({{Magiis-Driver_test_2.6.15.apk}}) y '
    + 'App PAX *v2.5.19* sobre dispositivos físicos (registrar modelo y OS) · conductor/pasajero con viaje en '
    + 'edición y origen definido. Términos de prueba: {{e}}/{{ez}} (bajo el mínimo) · {{eze}} (IATA exacto, el caso '
    + 'que hoy falla en Driver) · {{ezei}} (4 chars) · {{aep}} (ícono aeropuerto) · {{corrientes}}/{{av corrientes}} '
    + '(direcciones) · {{san martin 500}} (mapeo) · {{zzzqqqxxx}} (vacío).');
  A();
  A('h3. Evidencia a capturar');
  A();
  A('* Panel Network con {{maps.googleapis.com}} en cero durante una búsqueda completa (por superficie).');
  A('* Query string de un request ({{address}}, {{latitude}}, {{longitude}}, {{sessionToken}}; sin {{radius}}).');
  A('* Lista de requests con tiempos (debounce) · JSON crudo de una predicción de aeropuerto ({{airport}}, {{placeId}}).');
  A('* Tres requests de una sesión con el mismo {{sessionToken}} y el siguiente con uno distinto.');
  A('* Video del camino de degradación con el endpoint bloqueado.');
  A();
  A(`_Plan de release: ${PLAN} · Test Sets: ${SK('PAX')} · ${SK('DRIVER')} · Tickets: MG-116, MG-117._`);
  return L.join('\n');
}

function planBody() {
  const L = [];
  const A = (x = '') => L.push(x);
  A('h2. ATP · Release 2026-08-13 — v1.72.11 be/fe · v2.0.10 carrier-v2 · v2.5.19 App PAX · v2.6.15 App Driver');
  A();
  A('Test Plan *único* de la release (corte 2026-08-11 → salida 2026-08-13). Modelo 3.5: los tickets de una '
    + 'misma feature comparten un ATP a nivel feature y un Test Execution único; este plan agrupa lo de la '
    + 'release completa, con un *Test Set por feature/componente* y los test cases dentro de cada set.');
  A();
  A('h3. Features cubiertas — sets y ejecuciones');
  A();
  A('||Feature||Ticket(s)||Test Set||Casos||ATR único||Corridas||');
  A(`|Autocomplete endpoint propio (MG-112)|MG-116|${SK('PAX')}|0 — pendientes|${ATR_AUTO}|⚪ sin casos|`);
  A(`|Autocomplete endpoint propio (MG-112)|MG-117|${SK('DRIVER')}|17|${ATR_AUTO}|🔴 17 {{TO DO}} — BLOQUEADO|`);
  A(`|Stripe Elements iOS (fix del bug)|MG-681|${SK('STRIPE')}|9|${ATR_STRIPE}|🟡 9 {{TO DO}}|`);
  A(`|Permisos de ubicación iOS (retest)|MG-571|${SK('PERMS')}|12|${ATR_PERMS}|🟢 12 *PASSED* (2026-08-11)|`);
  A();
  A('La membresía del plan es la unión de los sets: *38 tests hoy*; crece cuando la pata PAX de autocomplete '
    + 'tenga casos. Cada test está linkeado ({{is tested by}}) al ticket que cubre.');
  A();
  A('h3. Alcance por versión — los 17 tickets del tren');
  A();
  A('||Versión||Ticket||Estado||Cobertura en este plan||');
  A('|v1.72.11 magiis-be|MG-39 · Nota PAX backend|UAT|—|');
  A('|v1.72.11 magiis-be|MG-589 · Deuda técnica LoggingAspect|UAT|—|');
  A('|v1.72.11 magiis-fe|MG-40 · Nota PAX frontend V1|UAT|—|');
  A('|v2.0.10 carrier-v2|MG-18 · Master Access|UAT|—|');
  A('|v2.0.10 carrier-v2|MG-111 · Carga Manifiesto|UAT|—|');
  A('|v2.0.10 carrier-v2|MG-678 · Nota PAX V2|TEST|—|');
  A('|v2.5.19 App PAX|MG-5 · Build apps|Finalizada|n/a (build)|');
  A('|v2.5.19 App PAX|MG-27 · Stripe 3DS PAX|Finalizada|heredada de TM-35 (campaña gateway)|');
  A(`|v2.5.19 App PAX|MG-116 · Autocomplete PAX|TEST|${SK('PAX')} — estructura, casos pendientes|`);
  A('|v2.5.19 App PAX|MG-552 · Pick up geolocalizado|TEST|—|');
  A('|v2.5.19 App PAX|MG-626 · EBIZ placeId|Finalizada|—|');
  A(`|v2.5.19 App PAX|MG-681 · Stripe Elements iOS|TEST|${SK('STRIPE')} — 9 casos|`);
  A('|v2.6.15 App Driver|MG-6 · Build apps|Finalizada|n/a (build)|');
  A('|v2.6.15 App Driver|MG-26 · Stripe 3DS Driver|Finalizada|heredada de TM-35 (campaña gateway)|');
  A(`|v2.6.15 App Driver|MG-117 · Autocomplete Driver|TEST|${SK('DRIVER')} — 17 casos|`);
  A('|v2.6.15 App Driver|MG-120 · Estado de espera se pega|Finalizada|—|');
  A(`|v2.6.15 App Driver|MG-571 · Permisos ubicación iPad|TEST|${SK('PERMS')} — 12 casos, PASSED|`);
  A();
  A('h3. Gap de cobertura — lo que este plan declara y no tapa');
  A();
  A('De 17 tickets, *solo 3 tienen cobertura propia* (38 casos) y 2 heredan de la campaña gateway. '
    + '*10 tickets se despachan sin un solo test case*: MG-39, MG-40, MG-589, MG-18, MG-111, MG-678, MG-116, '
    + 'MG-552, MG-626 y MG-120.');
  A();
  A('{panel:title=El gap más barato de cerrar: MG-116}');
  A('MG-116 es el gemelo exacto de MG-117 — misma feature, mismo backend MG-118, ACs casi idénticos. Los 17 '
    + `casos de ${SK('DRIVER')} son portables a PAX con ajustes menores. Y a diferencia de Driver, la `
    + 'implementación de PAX *ya está mergeada y auditada APROBADA*: sus corridas serían ejecutables de inmediato.');
  A('{panel}');
  A();
  A('h3. Riesgos y bloqueantes de la release');
  A();
  A('# 🔴 *MG-117 sin código publicado* (verificado 2026-08-11): sin rama, sin MR, {{develop}} llama a Google '
    + 'directo y {{release/v2.6.15}} no tiene commits propios. El APK del 2026-08-08 no es reproducible. Un GO '
    + 'que lo ignore certifica un ticket que nadie pudo probar.');
  A('# 🟠 *Contradicciones de contrato en los ACs de autocomplete* ({{radius}}, {{isAirport}} vs {{airport}}, '
    + '{{placeId}} nullable, minLength con {{>}}): detalladas en el comentario de shift-left de MG-117 '
    + '(2ª pasada, 2026-08-11). Implementar el texto literal produce código incorrecto.');
  A('# 🟠 *10 tickets sin cobertura*, incluidos tres en TEST (MG-678, MG-116, MG-552) que le tocan a QA en esta ventana.');
  A('# 🟡 Los 6 casos reciclados de MG-681 pertenecen también a la campaña gateway (TM-35) — membresía N:N esperada, no duplicar esfuerzo de ejecución.');
  A();
  A('h3. Criterio de GO / NO-GO de la release');
  A();
  A('||Feature||Gate||');
  A('|Permisos ubicación iOS (MG-571)|🟢 cumplido — 12/12 PASSED|');
  A(`|Stripe Elements iOS (MG-681)|pasan los 4 bloqueantes de ${ATR_STRIPE}: TM-620, TM-621, TM-71, TM-87|`);
  A(`|Autocomplete (MG-116 + MG-117)|pasan los 7 bloqueantes de ${ATR_AUTO}: TM-650, TM-651, TM-656, TM-657, TM-654, TM-662, TM-665 — hoy imposible: pata Driver bloqueada, pata PAX sin casos|`);
  A();
  A('Cualquier feature con un bloqueante en rojo → *NO-GO de esa feature*; la decisión de embarcarla igual es '
    + 'del coordinador de release, con este plan como evidencia.');
  A();
  A('h3. Entorno');
  A();
  A('Ambiente *test* · backend magiis-be v1.72.11 · carrier v2.0.10 · App PAX v2.5.19 y App Driver v2.6.15 en '
    + 'dispositivos físicos (registrar modelo y OS en cada corrida).');
  A();
  A('h3. Historial');
  A();
  A('Este plan reemplaza a los Test Plans por-ticket *TM-618* (MG-681) y *TM-626* (MG-571), convertidos en los '
    + `Test Sets ${SK('STRIPE')} y ${SK('PERMS')}. Aquellos quedan como registro histórico con banner de reemplazo; `
    + 'sus ejecuciones (TM-619, TM-627) siguen siendo los ATR únicos de sus features bajo este plan. '
    + `El cuerpo anterior de este issue (ATP por-ticket de MG-117) vive ahora repartido entre ${SK('DRIVER')} y ${ATR_AUTO}.`);
  A();
  A('_Épica QA: TM-34 (QA Master Test Plan) · Sets y ejecuciones: TM-1 (QA Test Artifacts) · Tests: TM-20 (QA Test Repository)._');
  return L.join('\n');
}

const supersedeBanner = (setKey, ticket) =>
  [
    '{panel:title=⛔ REEMPLAZADO — ver el plan de release|borderColor=#DE350B}',
    'Este Test Plan por-ticket fue absorbido por el modelo de release (doctrina 3.5): un solo Test Plan '
    + `*${PLAN}* con Test Sets por feature. La cobertura de *${ticket}* vive ahora en el Test Set *${setKey}* `
    + 'y su ejecución sigue en el ATR de la feature. Este issue queda como registro histórico: no agregar '
    + 'tests ni corridas acá.',
    '{panel}',
    '',
  ].join('\n');

// ---------------------------------------------------------------- phases

async function phaseSets() {
  console.log('\n== fase sets ==');
  for (const s of SETS) {
    if (state.sets[s.id]) {
      console.log(`  ${s.id} ya existe: ${state.sets[s.id].key}`);
      continue;
    }
    console.log(`  ${s.id}: ${s.summary}`);
    if (!APPLY) { continue; }
    const r = await graphql(MUTATIONS.createTestSet, {
      jira: { fields: { summary: s.summary, project: { key: PROJECT } } },
    });
    const ts = r.createTestSet.testSet;
    state.sets[s.id] = { key: ts.jira.key, id: ts.issueId };
    saveState(state);
    await setParent(ts.jira.key, EPIC_ARTIFACTS);
    await setAssignee(ts.jira.key).catch(() => {});
    console.log(`    -> ${ts.jira.key} (${ts.issueId})`);
  }
  // set bodies (after keys exist so cross-references resolve)
  for (const s of SETS) {
    const body = setBody(s);
    writeFileSync(resolve(STATE_DIR, `tm-release-set-${s.id.toLowerCase()}-body.txt`), body, 'utf8');
    if (APPLY && state.sets[s.id]) { await setDescription(state.sets[s.id].key, body); }
  }
  if (APPLY) { console.log('  cuerpos publicados'); }
}

async function phaseMembership() {
  console.log('\n== fase membership ==');
  const allTestKeys = [...DRIVER_TESTS, ...STRIPE_TESTS, ...PERMS_TESTS];
  const ids = await resolveIds(allTestKeys);
  const missing = allTestKeys.filter(k => !ids[k]);
  if (missing.length) { throw new Error(`sin issueId: ${missing.join(', ')}`); }

  for (const s of SETS) {
    if (!s.tests.length) {
      console.log(`  ${SK(s.id)}: (vacío por diseño)`);
      continue;
    }
    console.log(`  ${SK(s.id)}: +${s.tests.length} tests`);
    if (!APPLY) { continue; }
    const r = await graphql(MUTATIONS.addTestsToTestSet, {
      issueId: state.sets[s.id].id,
      testIssueIds: s.tests.map(k => ids[k]),
    });
    console.log(`    added=${r.addTestsToTestSet.addedTests?.length ?? 0}${r.addTestsToTestSet.warning ? ` · ${r.addTestsToTestSet.warning}` : ''}`);
  }

  // plan: driver tests are already members; add the other 21
  const planAdd = [...STRIPE_TESTS, ...PERMS_TESTS];
  const planIds = await resolveIds([PLAN]);
  console.log(`  plan ${PLAN}: +${planAdd.length} tests (los 17 Driver ya están)`);
  if (APPLY) {
    const r = await graphql(MUTATIONS.addTestsToTestPlan, {
      issueId: planIds[PLAN],
      testIssueIds: planAdd.map(k => ids[k]),
    });
    console.log(`    added=${r.addTestsToTestPlan.addedTests?.length ?? 0}${r.addTestsToTestPlan.warning ? ` · ${r.addTestsToTestPlan.warning}` : ''}`);
  }
}

async function phaseLinks() {
  console.log('\n== fase links ==');
  const allTests = [...DRIVER_TESTS, ...STRIPE_TESTS, ...PERMS_TESTS];
  const setKeys = SETS.map(s => SK(s.id)).filter(k => /^TM-\d+$/.test(k));
  if (setKeys.length < SETS.length && APPLY) { throw new Error('faltan sets: correr la fase `sets --apply` primero'); }
  const probe = [PLAN, ATR_AUTO, ATR_STRIPE, ATR_PERMS, 'MG-116', 'MG-117', 'MG-681', 'MG-571', ...setKeys, ...allTests];
  const existing = await fetchLinks(probe);

  // 1. plan <-> sets, plan <-> ATRs
  const wants = [];
  for (const s of SETS) { wants.push(['Relates', PLAN, SK(s.id)]); }
  for (const atr of [ATR_STRIPE, ATR_PERMS]) { wants.push(['Relates', PLAN, atr]); } // ATR_AUTO ya está
  // 2. stories -> su set y -> su ATR de feature
  for (const s of SETS) { wants.push(['Test', s.ticket, SK(s.id)]); }
  wants.push(['Test', 'MG-116', ATR_AUTO]);
  wants.push(['Test', 'MG-571', ATR_PERMS]); // MG-117->TM-668 y MG-681->TM-619 ya existen
  // 3. cada test -> el ticket que cubre (doctrina 3.5)
  for (const t of DRIVER_TESTS) { wants.push(['Test', 'MG-117', t]); }
  for (const t of STRIPE_TESTS) { wants.push(['Test', 'MG-681', t]); }
  for (const t of PERMS_TESTS) { wants.push(['Test', 'MG-571', t]); }

  let created = 0; let skipped = 0;
  for (const [type, a, b] of wants) {
    const res = await ensureLink(existing, type, a, b);
    if (res === 'new') { created++; }
    else { skipped++; }
  }
  console.log(`  links: ${created} nuevos · ${skipped} ya existían${APPLY ? '' : ' (dry run: nada creado)'}`);

  // 4. retirar el link Test MG-117 -> TM-667 (modelo viejo)
  const stale = (existing['MG-117'] ?? []).find(l => l.type === 'Test' && l.outward === PLAN);
  if (stale) {
    console.log(`  retirar link viejo MG-117 --Test--> ${PLAN} (id ${stale.linkId})`);
    if (APPLY) { await jira(`/rest/api/3/issueLink/${stale.linkId}`, { method: 'DELETE' }); }
  }
  else { console.log(`  link viejo MG-117 --Test--> ${PLAN}: no está (ok)`); }
}

async function phaseAtr() {
  console.log('\n== fase atr (TM-668 → ATR de feature) ==');
  const summary = 'ATR · Autocomplete endpoint propio — validación release (App PAX v2.5.19 + App Driver v2.6.15)';
  const body = atrAutoBody();
  writeFileSync(resolve(STATE_DIR, 'tm-release-atr-auto-body.txt'), body, 'utf8');
  console.log(`  ${ATR_AUTO}: "${summary}" · ${body.length} chars`);
  if (!APPLY) { return; }
  await setSummary(ATR_AUTO, summary);
  await setDescription(ATR_AUTO, body);
  console.log('  publicado');
}

async function phasePlan() {
  console.log('\n== fase plan (TM-667 → plan de release) ==');
  const summary = 'ATP · Release 2026-08-13 — v1.72.11 be/fe · v2.0.10 carrier-v2 · v2.5.19 App PAX · v2.6.15 App Driver';
  const body = planBody();
  writeFileSync(resolve(STATE_DIR, 'tm-release-plan-body.txt'), body, 'utf8');
  console.log(`  ${PLAN}: "${summary}" · ${body.length} chars`);
  if (!APPLY) { return; }
  await setSummary(PLAN, summary);
  await setDescription(PLAN, body);
  console.log('  publicado');
}

async function phaseSupersede() {
  console.log('\n== fase supersede ==');
  const map = { 'TM-618': ['STRIPE', 'MG-681'], 'TM-626': ['PERMS', 'MG-571'] };
  for (const key of OLD_PLANS) {
    const [setId, ticket] = map[key];
    const v = await jira(`/rest/api/2/issue/${key}?fields=description`);
    const desc = v.fields.description ?? '';
    if (desc.includes('REEMPLAZADO')) {
      console.log(`  ${key}: banner ya presente`);
      continue;
    }
    console.log(`  ${key}: prepend banner (→ ${SK(setId)})`);
    if (APPLY) { await setDescription(key, supersedeBanner(SK(setId), ticket) + desc); }
  }
  console.log('  (transición de cierre NO incluida — se previsualiza y confirma aparte)');
}

const PHASES = { sets: phaseSets, membership: phaseMembership, links: phaseLinks, atr: phaseAtr, plan: phasePlan, supersede: phaseSupersede };
const order = PHASE === 'all' ? Object.keys(PHASES) : [PHASE];
for (const p of order) {
  if (!PHASES[p]) {
    console.error(`fase desconocida: ${p} (válidas: ${Object.keys(PHASES).join(' | ')} | all)`);
    process.exit(1);
  }
  await PHASES[p]();
}
saveState(state);
console.log(`\n${APPLY ? 'aplicado' : 'dry run'} · estado en ${STATE_FILE.replace(ROOT, '.')}`);
console.log(`  Plan   ${JIRA}/browse/${PLAN}`);
for (const s of SETS) { console.log(`  Set    ${SK(s.id)}  (${s.ticket})`); }
console.log(`  ATRs   ${ATR_AUTO} (autocomplete) · ${ATR_STRIPE} (MG-681) · ${ATR_PERMS} (MG-571)`);
