/**
 * Creates the automation-scope ATR for the Alta de Viaje campaign in TM.
 *
 * This ATR is the hand-off artifact: whoever writes the Playwright/KATA specs opens
 * it and sees exactly which cases are in scope, in the order they should be built.
 * The order is driven by DEPENDENCY, not by ROI — without a spec that can create a
 * trip end-to-end, nothing else can run.
 *
 * Usage:
 *   bun scripts/tm-automation-atr.mjs --dry-run
 *   bun scripts/tm-automation-atr.mjs --apply
 */

import { fetchAllAttachedTestIds, graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const PROJECT_KEY = 'TM';
const PARENT = 'TM-1'; // QA Test Artifacts
const ATP = 'TM-36';
const ENV = 'test';
const CAMPAIGN = 'atp-mg-altaviaje';
const SUMMARY = 'ATR · Alta de Viaje — AUTOMATIZACIÓN (Ola 1: medios de pago)';

const APPLY = process.argv.includes('--apply');
const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH = `Basic ${Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString('base64')}`;
const ASSIGNEE = process.env.ASSIGNEE_ACCOUNT_ID || '';

const jira = async (p, init = {}) => {
  const r = await fetch(`${JIRA}${p}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!r.ok) { throw new Error(`Jira ${init.method || 'GET'} ${p} -> ${r.status} ${(await r.text()).slice(0, 250)}`); }
  return r.status === 204 ? null : r.json();
};

const RETRYABLE = /re-indexed|ECONNRESET|ETIMEDOUT|socket hang up|\b5\d\d\b|\b429\b/i;
async function withRetry(fn, what, max = 8) {
  let d = 2000;
  for (let a = 1; ; a++) {
    try { return await fn(); }
    catch (e) {
      if (a >= max || !RETRYABLE.test(String(e.message))) { throw e; }
      console.log(`   ↻ ${a}/${max} ${what}`);
      await new Promise(r => setTimeout(r, d)); d = Math.min(d * 2, 30000);
    }
  }
}

// --- the automation scope, spec by spec, in build order --------------------
const SPECS = [
  // --- OLA 1 — medios de pago (decisión de la meet de líderes, 2026-08-10) ---
  { ola: 1, spec: 'forma-de-pago.disponibilidad.spec.ts', why: 'Las cinco capas que componen el selector: config del carrier por canal, flags del colaborador, gateway, '
    + 'estado de cuenta corriente y el re-chequeo del front. Parametrizado por la matriz pairwise — no crea viajes, '
    + 'solo abre la pantalla y lee qué medios se ofrecen.', tcs: ['TC061', 'TC118'] },
  { ola: 1, spec: 'forma-de-pago.preseleccion.spec.ts', why: 'Los cuatro defaults que compiten: clon > tarjeta recién agregada > default del carrier > primero de la lista. '
    + 'Incluye dos defectos hallados por lectura de código.', tcs: ['TC117', 'TC062', 'TC177', 'TC178'] },
  { ola: 1, spec: 'cuenta-corriente.limite.spec.ts', why: 'Saldo agotado con y sin permiso de excederse. Ojo: la opción NO se oculta — lo que se bloquea es el envío.', tcs: ['TC010', 'TC044'] },
  { ola: 1, spec: 'tarjeta.alta-y-validacion.spec.ts', why: 'Alta de tarjeta, tokenización y los errores de validación que bloquean el envío.', tcs: ['TC119', 'TC120', 'TC121'] },
  { ola: 1, spec: 'alta-con-medio-de-pago.e2e.spec.ts', why: 'La creación de punta a punta parametrizada por medio de pago. Absorbe el espinazo completo — cliente, tipo de '
    + 'servicio, pasajero, modos, origen, destino y envío — porque no se puede validar un medio sin crear un viaje. '
    + 'Un solo spec cubre el pago y toda la columna vertebral de la pantalla.', tcs: ['TC116', 'TC068', 'TC080', 'TC074', 'TC083', 'TC089', 'TC092', 'TC146', 'TC157'] },
  { ola: 1, spec: 'pago-cruzado.propinas-multitrip.spec.ts', why: 'Las interacciones cruzadas verificadas en código: efectivo no renderiza propinas, tarjeta nueva oculta '
    + 'multi-trip, y el clon arrastra un medio que puede haber dejado de estar habilitado.', tcs: ['TC140', 'TC141', 'TC142', 'TC064', 'TC176'] },

  // --- OLA 2 — lo desplazado por el cambio de prioridad ---
  { ola: 2, spec: 'nuevo-viaje.cupo.spec.ts', why: 'El ciclo del cupo por colaborador: consumo → bloqueo con USAGE_LIMIT_EXCEEDED → liberación al cancelar. '
    + 'Los tres son criticidad Crítica. SALIÓ de la Ola 1 por la decisión de priorizar medios de pago.', tcs: ['TC001', 'TC011', 'TC050'] },
  { ola: 2, spec: 'nuevo-viaje.destino-abierto.spec.ts', why: 'Los dos casos de mayor ROI de toda la campaña (16,67) están acá. Módulo autocontenido: switch, campos que '
    + 'aparecen y desaparecen, y la cotización con distancia cero.', tcs: ['TC164', 'TC167', 'TC168', 'TC161', 'TC165', 'TC170', 'TC171'] },
  { ola: 2, spec: 'asignacion-manual.candidatos.spec.ts', why: 'Despacho, asignación manual y candidatos. Rescata los 5 casos de criticidad Crítica que el ROI aislado '
    + 'mandaba a Deferred: automatizada la pantalla, las aserciones de chofer bloqueado cuestan casi nada.', tcs: ['TC035', 'TC036', 'TC037', 'TC043', 'TC045', 'TC046', 'TC018', 'TC022', 'TC026', 'TC027', 'TC158', 'TC159', 'TC160'] },
  { ola: 2, spec: 'nuevo-viaje.clonacion.spec.ts', why: 'Clonación de finalizados y cancelados vía ?travelId=, y los rechazos por configuración que cambió después '
    + 'de crear el modelo.', tcs: ['TC003', 'TC004', 'TC005', 'TC013'] },
  { ola: 2, spec: 'nuevo-viaje.configuracion.spec.ts', why: 'Restricciones que la configuración del carrier y del tipo de servicio imponen sobre el formulario.', tcs: ['TC059', 'TC063', 'TC031'] },
];

// --- resolve tcid -> TM key ------------------------------------------------
const byTc = new Map();
for (let start = 0; start < 500; start += 100) {
  const r = await withRetry(() => graphql(QUERIES.getTestsFullDataNoCoverage, { jql: `project = ${PROJECT_KEY} AND labels = "${CAMPAIGN}"`, limit: 100, start }), `getTests ${start}`);
  const res = r?.getTests?.results ?? [];
  for (const t of res) {
    const lbl = (t.jira?.labels ?? []).find(l => l.startsWith('tcid:'));
    if (lbl) { byTc.set(lbl.replace('tcid:TS-ALTAVIAJE-', ''), { key: t.jira.key, issueId: t.issueId, summary: t.jira.summary }); }
  }
  if (res.length < 100) { break; }
}
console.log(`\n=== ATR de automatización ${APPLY ? '' : '(DRY RUN)'} ===`);
console.log(`índice de la campaña: ${byTc.size} tests\n`);

const missing = SPECS.flatMap(s => s.tcs).filter(t => !byTc.has(t));
if (missing.length) { throw new Error(`casos sin resolver en TM: ${missing.join(' ')}`); }

const scope = [];
for (const s of SPECS) {
  console.log(`Ola ${s.ola} · ${s.spec}  (${s.tcs.length})`);
  for (const tc of s.tcs) {
    const t = byTc.get(tc);
    console.log(`   ${t.key.padEnd(8)} ${tc}`);
    scope.push({ ...t, tc, ...s });
  }
}
console.log(`\ntotal en alcance: ${scope.length} casos · ${SPECS.length} specs`);

// --- ATR description: everything the spec author needs that Jira can't infer
const D = [];

D.push('h2. Alcance de automatización — Alta de Viaje (Carrier v2)');
D.push('');
D.push(`Este Test Execution es el *backlog de automatización*: ${scope.length} casos en ${SPECS.length} specs.`);
D.push('');
D.push('{panel:title=Cambio de prioridad — 2026-08-10}');
D.push('Por decisión de la meet de líderes, la *Ola 1 pasa a ser medios de pago*.');
D.push('');
D.push('*Qué salió de la Ola 1:* el spec de cupo ({{nuevo-viaje.cupo.spec.ts}}) se mueve a la Ola 2. '
  + 'Si alguien ya venía trabajando contra la versión anterior de este plan, ese es el único desplazamiento.');
D.push('');
D.push('*Qué NO salió:* el espinazo del alta (cliente, tipo de servicio, pasajero, modos, origen, destino, envío) '
  + 'sigue en la Ola 1, pero ahora *absorbido dentro del spec E2E de medios de pago* — no se puede validar un medio '
  + 'de pago sin crear un viaje, así que parametrizar la creación por medio de pago cubre las dos cosas de una vez.');
D.push('{panel}');
D.push('');
D.push('h3. 💳 Por qué el medio de pago no se puede probar aislado');
D.push('');
D.push('El selector no se calcula en el front: se compone en *cinco capas apiladas*, y cada una puede quitar opciones.');
D.push('');
D.push('||#||Capa||Dónde||');
D.push('|1|Config del carrier por canal ({{CARRIER}} vs {{CONTRACTOR}})|{{CarrierPaymentMethodConfigService.java:79-91}}|');
D.push('|2|Flags del colaborador de contractor|{{CarrierPaymentMethodConfigService.java:98-105}}|');
D.push('|3|Gateway — QR exige {{appCode == "MERCADOPAGO"}}; sin gateway no hay tarjeta|{{CarrierAccountController.java:2480-2497}}|');
D.push('|4|Estado de la cuenta corriente|{{CarrierAccountController.java:2500-2529}}|');
D.push('|5|Re-chequeo del gateway en el front|{{new-trip.component.ts:3151}}|');
D.push('');
D.push('Por eso los specs van *parametrizados por una matriz pairwise*, no con casos sueltos.');
D.push('');
D.push('h3. 🔢 La matriz — pairwise sobre 6 factores');
D.push('');
D.push('Generada y verificada por {{bun scripts/tm-payment-matrix.mjs}}.');
D.push('');
D.push('||Factor||Valores||');
D.push('|Medio de pago|CASH · CHECKING_ACCOUNT · CREDIT_CARD · NEW_CREDIT_CARD · tarjeta guardada · QR|');
D.push('|Tipo de pagador|individuo · colaborador de contractor|');
D.push('|Gateway|ninguno · MercadoPago · otro (MGW/Ebiz)|');
D.push('|Cuenta corriente|inexistente · inactiva · activa con saldo · saldo ≤ 0 duro · saldo ≤ 0 con permiso|');
D.push('|Tarjetas guardadas|0 · ≥1 válida · ≥1 inválida|');
D.push('|Modo de entrada|nuevo · clonado|');
D.push('');
D.push('*Reducción aplicada:* 1080 combinaciones del cruce completo → 476 podadas por restricción → '
  + '604 legales → *31 filas* que cubren los 167 pares alcanzables. *94,9% de reducción.* '
  + 'El generador asserta que ninguna fila viola una restricción y que no queda ningún par sin cubrir.');
D.push('');
D.push('*Solo ~18 de las 31 filas llegan a crear un viaje.* El resto abre la pantalla y lee el selector.');
D.push('');
D.push('h3. 🚫 Combinaciones imposibles — no generar filas con esto');
D.push('');
D.push('* Sin gateway ⟹ no hay tarjeta (guardada, nueva ni «a bordo») ni QR.');
D.push('* Gateway distinto de MercadoPago ⟹ no hay QR.');
D.push('* Cuenta corriente inexistente o inactiva ⟹ no se ofrece cuenta corriente.');
D.push('* Pagador individuo ⟹ los flags de colaborador nunca restan, y *el cupo es inalcanzable*.');
D.push('* Flag {{transferEnabled}} apagado en el colaborador ⟹ no hay tarjeta. Sí: el flag se llama '
  + '{{transfer}} y gatea *crédito*. No es un error de lectura.');
D.push('* Saldo ≤ 0 sin permiso ⟹ *la opción sigue visible*; lo que se bloquea es el envío. '
  + 'No modelarlo como «opción oculta».');
D.push('* {{NEW_CREDIT_CARD}} ⟹ multi-trip oculto · {{CASH}} ⟹ el bloque de propinas no se renderiza.');
D.push('* {{TRANSFER}} y {{DEBIT_CARD}} *no existen* en esta pantalla: están en el enum del backend '
  + 'pero ninguna rama del front los construye.');
D.push('');
D.push('_Independientes del medio de pago (no hace falta cruzarlos): cupo, destino abierto, costo fijo, '
  + 'otros costos, tarifador y point-to-point._');
D.push('');
D.push('h3. 🚧 Prerrequisitos del framework — nada corre sin esto');
D.push('');
D.push('||#||Bloqueo||Por qué importa||');
D.push('|1|{{XRAY_PROJECT_KEY=MX}} en {{.env}}, usado por {{tests/utils/jiraSync.ts}}|Los resultados se importarían al *proyecto equivocado*. Ya pasó una vez: 32 issues creados en MX. Forzar {{TM}} y agregar una guarda que aborte si no coincide|');
D.push('|2|No existe el entorno {{test}} en {{config/variables.ts}} — solo {{local}} y {{staging}}|{{TEST_ENV=test}} lanza {{Unknown TEST_ENV}}: ningún spec puede apuntar a apps-test|');
D.push('|3|{{.env}} trae {{USER_CARRIER}} / {{PASS_CARRIER}}, que {{variables.ts}} nunca lee|El login falla aunque el entorno esté definido. Ojo: la contraseña de test difiere de la de UAT|');
D.push('|4|{{ui-auth.setup.ts}} espera {{access_token}}; MAGIIS devuelve {{token}}|Rompe la dependencia {{ui-setup}} del proyecto {{e2e}}, de donde cuelgan los specs|');
D.push('');
D.push('h3. 🧱 Convenciones KATA');
D.push('');
D.push('* El decorador lleva la *key real de Jira*: {{@atc(\'TM-605\')}}, no el identificador de suite.');
D.push('* El título del test también lleva la key — la vía JUnit mapea por título, la del decorador por id.');
D.push('* La cadena reutilizable (abrir, elegir cliente, completar el formulario) va en un *módulo Steps*, no en un ATC. Un ATC nunca llama a otro ATC.');
D.push('* Cada componente nuevo se registra en {{tests/components/UiFixture.ts}} como campo {{readonly}}.');
D.push('* Locators inline en el ATC. La pantalla *no tiene* {{data-testid}}: se depende de estructura y texto, y eso rota.');
D.push('');
// --- taxonomía de flujos: clasificados por hasta dónde llega cada uno --------
const ALCANCE = {
  'alta-con-medio-de-pago.spec.ts': 'e2e',
  'alta-con-medio-de-pago.e2e.spec.ts': 'e2e',
  'asignacion-manual.candidatos.spec.ts': 'e2e',
  'pago-cruzado.propinas-multitrip.spec.ts': 'e2e',
  'nuevo-viaje.clonacion.spec.ts': 'e2e',
  'nuevo-viaje.cupo.spec.ts': 'e2e',
  'nuevo-viaje.destino-abierto.spec.ts': 'parcial',
  'tarjeta.alta-y-validacion.spec.ts': 'parcial',
  'forma-de-pago.preseleccion.spec.ts': 'ui',
  'nuevo-viaje.configuracion.spec.ts': 'ui',
  'forma-de-pago.disponibilidad.spec.ts': 'ui',
  'cuenta-corriente.limite.spec.ts': 'ui',
};
const TIPOS = [
  ['e2e', 'E2E completo', 'Termina con un viaje creado. Carga todo el costo de datos y es lo primero que se rompe cuando rotan los selectores.'],
  ['parcial', 'E2E parcial', 'Llega a cotizar o tokenizar, pero no siempre envía.'],
  ['ui', 'Estado de UI', 'No cotiza ni envía: valida cómo se compone y cómo reacciona la pantalla. Baratos y estables.'],
];

D.push('h3. 🧭 Cuántos flujos y de qué tipo');
D.push('');
D.push(`*${SPECS.length} flujos · ${scope.length} casos.* Clasificados por hasta dónde llega cada uno, `
  + 'que es lo que determina su costo de datos y su fragilidad:');
D.push('');
D.push('||Tipo||Flujos||Casos||Qué significa||');
for (const [k, nombre, que] of TIPOS) {
  const ss = SPECS.filter(s => ALCANCE[s.spec] === k);
  const c = ss.reduce((a, s) => a + s.tcs.length, 0);
  D.push(`|*${nombre}*|${ss.length}|*${c}*|${que}|`);
}
D.push('');
D.push('||Flujo||Tipo||Casos||Ola||');
for (const [k, nombre] of TIPOS.map(t => [t[0], t[1]])) {
  for (const s of SPECS.filter(x => ALCANCE[x.spec] === k).sort((a, b) => b.tcs.length - a.tcs.length)) {
    D.push(`|{{${s.spec}}}|${nombre}|${s.tcs.length}|${s.ola}|`);
  }
}
D.push('');
D.push('_Cada caso trae en su descripción: historia de usuario, caso de uso, precondiciones, '
  + 'paso a paso con datos, resultado esperado y el *Gherkin* derivado de todo eso. '
  + 'El Gherkin es la especificación para programar — este framework no lo ejecuta: '
  + 'los specs son TypeScript con {{@atc(\'TM-xxx\')}} y los resultados suben mapeando por ese id._');
D.push('');

D.push('h3. 📦 Orden de trabajo');
D.push('');
for (const s of SPECS) {
  D.push(`h4. Ola ${s.ola} · {{${s.spec}}} — ${s.tcs.length} casos`);
  D.push('');
  D.push(s.why);
  D.push('');
  D.push('||Test||Caso||');
  for (const tc of s.tcs) {
    const t = byTc.get(tc);
    D.push(`|${t.key}|${String(t.summary).replace(/^MG-19 \| /, '')}|`);
  }
  D.push('');
}
D.push('h3. 🕳️ Un hueco que esta pantalla no puede tapar');
D.push('');
D.push('{{LIMIT_EXCEEDED}} es alcanzable en el backend (cuenta corriente con saldo ≤ 0 y sin permiso de excederse, '
  + '{{TravelService.java:8300}}), pero *el front bloquea el envío antes* de llegar a la API ({{new-trip.component.html:1256}}). '
  + 'Desde la UI solo se puede verificar el bloqueo; el código de error del backend exige un test de *capa API*. '
  + 'Queda declarado como gap, no descartado en silencio.');
D.push('');
D.push('h3. ⛔ Fuera de alcance — no intentar automatizar desde esta pantalla');
D.push('');
D.push('* *Captura del hold y montos {{CC_HOLD_*}}.* La creación devuelve HTTP 200 con un flag y manda el viaje a '
  + '{{NO_AUTH}} ({{TravelController.java:1249-1253}}): la UI ve un éxito. No hay nada que assertar acá.');
D.push('* *Desafío 3DS.* Sin referencia alguna en {{new-trip.component.ts}}.');
D.push('* *Webhooks de la pasarela* y todos los estados {{PAYMENT_*}}.');
D.push('* *Cobro desde la app driver* y {{DRIVER_ALLOW_*_PAYMENT}} — otro actor, otra pantalla.');
D.push('* *Revalidación de tarjeta en el despacho* de viajes programados ({{TravelProgrammedService.java:201}}).');
D.push('* *El precio final del viaje.* Lo define la app driver al finalizar ({{TravelService.java:9640}}).');
D.push('* *Agregar destinos durante el viaje.* No existe API de carrier; el destino real se registra al cerrar.');
D.push('* *El viaje de calle.* Otra entidad ({{startStreetTravel}}), estado inicial distinto, pasajero por defecto '
  + 'y CASH forzado. Solo comparte el flag {{openTrip}}: cubrir uno no cubre al otro.');
D.push('');
D.push('----');
D.push('');
D.push(`* *ATP:* ${ATP} · *Ronda manual completa:* TM-18 (169 casos)`);
D.push('* *Historia:* MG-19 — Carrier v2 · Migrar pantalla Nuevo Viaje');
D.push('* *Ambiente:* {{test}} (apps-test)');
D.push('* *Repositorio Xray:* {{/Carrier/v2-front/AltaViaje}}');
D.push('');
D.push('_Los 7 casos de Destino Abierto se diseñaron leyendo el código, no ejecutándolos. El primer run puede revelar diferencias: eso es un hallazgo, no un fallo del spec._');
const DESCRIPTION = D.join('\n');

if (!APPLY) {
  console.log(`\n(dry) crearía "${SUMMARY}" con ${scope.length} tests · descripción de ${DESCRIPTION.length} chars`);
  process.exit(0);
}

// --- resolve the ATR --------------------------------------------------------
// TARGET is pinned: the wave reformulation renames the ATR, so a find-by-summary
// would miss the existing issue and silently create a duplicate campaign.
const TARGET = process.env.ATR_KEY || 'TM-617';
let key = null;
try {
  const existing = await jira(`/rest/api/3/issue/${TARGET}?fields=summary,issuetype`);
  if (existing.fields.issuetype.name !== 'Test Execution') {
    throw new Error(`${TARGET} no es un Test Execution sino ${existing.fields.issuetype.name}`);
  }
  key = existing.key;
  if (existing.fields.summary !== SUMMARY) {
    await jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { summary: SUMMARY } }) });
    console.log(`\n= ATR ${key} renombrado`);
    console.log(`    antes: ${existing.fields.summary}`);
    console.log(`    ahora: ${SUMMARY}`);
  }
  else {
    console.log(`\n= ATR ${key} ya tenía el nombre correcto`);
  }
}
catch (e) {
  if (!/-> 404/.test(String(e.message))) { throw e; }
  console.log(`\n(${TARGET} no existe — se creará uno nuevo)`);
}

if (!key) {
  const M = `mutation CreateTestExecution($jira: JSON!, $testEnvironments: [String]) {
    createTestExecution(jira: $jira, testEnvironments: $testEnvironments) {
      testExecution { issueId jira(fields: ["key"]) } warnings } }`;
  const r = await withRetry(() => graphql(M, {
    jira: { fields: { project: { key: PROJECT_KEY }, summary: SUMMARY, parent: { key: PARENT }, ...(ASSIGNEE ? { assignee: { id: ASSIGNEE } } : {}) } },
    testEnvironments: [ENV],
  }), 'createTestExecution');
  key = r.createTestExecution.testExecution.jira.key;
  if (!key.startsWith(`${PROJECT_KEY}-`)) { throw new Error(`ABORTO: ${key} fuera de ${PROJECT_KEY}`); }
  console.log(`\n✔ ATR creado: ${key}`);
}
else {
  console.log(`\n= ATR ya existía: ${key}`);
}

await jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: DESCRIPTION } }) });
console.log('✔ descripción escrita');

const atrId = (await jira(`/rest/api/3/issue/${key}?fields=summary`)).id;
const M_ADD = `mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String]!) {
  addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) { warning } }`;
const current = new Set(await withRetry(() => fetchAllAttachedTestIds(
  QUERIES.getTestExecutionTestsPage,
  'getTestExecution',
  atrId,
), 'read exec'));
const toAdd = scope.map(s => s.issueId).filter(i => !current.has(i));
if (toAdd.length) {
  await withRetry(() => graphql(M_ADD, { issueId: atrId, testIssueIds: toAdd }), 'addTests');
  console.log(`✔ +${toAdd.length} tests`);
}
const total = (await withRetry(() => fetchAllAttachedTestIds(
  QUERIES.getTestExecutionTestsPage,
  'getTestExecution',
  atrId,
), 'verify')).length;
console.log(`\n${key} — ${total} tests (esperado ${scope.length})`);
console.log(`${JIRA}/browse/${key}\n`);
