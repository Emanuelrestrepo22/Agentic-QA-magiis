/**
 * Creates the "Destino Abierto" (open-destination) test cases in project TM and
 * attaches them to the Alta de Viaje ATP / ATR.
 *
 * Every expected result below is grounded in code that was read, not inferred:
 *   FE v2  magiis-fe-carrier-v2 origin/develop
 *          src/app/pages/carrier/trips/new-trip/new-trip.component.{ts,html}
 *   BE     magiis-be release/v1.72.6
 *          services/TravelService.java · entities/travels/Travel.java
 *
 * Key facts that shaped the design:
 *   - There is NO configurable "allows open destination" flag on CarrierServiceType.
 *     The real gate is `canUseOpenDestination = !isDelivery && !isOneShotSelected`.
 *   - `openTrip` is DERIVED in the backend (origin == destination && no waypoints),
 *     never sent as a flag. `destination` is @NonNull in TravelCreateRequestDTO, so
 *     the front sends the origin as the destination.
 *   - Fare at creation is computed with distance 0: calculateDistanceTimeProxy()
 *     short-circuits Google when travel.getOpenTrip() is true.
 *   - The final price is set by the driver app on finalize — NOT testable here.
 *   - "Viaje de calle" is a DIFFERENT entity (startStreetTravel endpoint) that merely
 *     shares the openTrip flag — covering one does not cover the other.
 *
 * Usage:
 *   bun scripts/tm-open-destination-cases.mjs --dry-run
 *   bun scripts/tm-open-destination-cases.mjs --apply
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOURNAL = resolve(ROOT, '.context/magiis-process/tm-open-destination-progress.jsonl');

// --- targets (verified live 2026-08-10) ------------------------------------
const PROJECT_KEY = 'TM';
const ATP = 'TM-36'; // ATP · Carrier v2 — Alta de Viaje (MG-19)
const ATR = 'TM-18'; // ATR · Alta de Viaje — Carrier v2 (Ronda 1)
const STORY = 'MG-19'; // the Story stayed in MG after the Xray move
const FOLDER = '/Carrier/v2-front/AltaViaje';
const CAMPAIGN = 'atp-mg-altaviaje';
const LINK_TEST = '10334';

const JIRA_URL = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH = `Basic ${Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString('base64')}`;
const ASSIGNEE = process.env.ASSIGNEE_ACCOUNT_ID || '';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const L = (...t) => [CAMPAIGN, 'carrier', 'v2-front', 'alta-viaje', 'destino-abierto', ...t];

// --- the cases -------------------------------------------------------------
const CASES = [
  {
    tcid: 'TS-ALTAVIAJE-TC161',
    summary: 'MG-19 | TC161: Validar que «Destino Abierto» ofrece el switch deshabilitado mientras no haya un cliente seleccionado',
    priority: 'Medium',
    labels: L('componente', 'capa-ui', 'smoke'),
    pre: 'Nuevo Viaje recién abierto, sin cliente seleccionado. Tipo de servicio distinto de mensajería.',
    steps: [
      { a: 'Abrir Nuevo Viaje sin seleccionar cliente.', d: '', r: '' },
      { a: 'Observar el switch «Destino Abierto» en la primera fila de destino.', d: '', r: 'Debería mostrarse el switch en la primera fila de destino y estar deshabilitado mientras no haya cliente seleccionado.' },
    ],
    ref: 'new-trip.component.html:673-689 — *ngIf="i === 0 && canUseOpenDestination", [disabled]="idClient == 0"',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC162',
    summary: 'MG-19 | TC162: Validar que «Destino Abierto» habilita el switch al seleccionar un cliente',
    priority: 'Medium',
    labels: L('componente', 'capa-ui'),
    pre: 'Nuevo Viaje abierto. Tipo de servicio distinto de mensajería y sin acuerdo OneShot seleccionado.',
    steps: [
      { a: 'Seleccionar un cliente desde el buscador.', d: 'Cliente con al menos un tipo de servicio habilitado.', r: '' },
      { a: 'Observar el switch «Destino Abierto».', d: '', r: 'Debería quedar habilitado el switch una vez que hay un cliente seleccionado.' },
    ],
    ref: 'new-trip.component.html:673-689',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC163',
    summary: 'MG-19 | TC163: Validar que «Destino Abierto» no se ofrece cuando el tipo de servicio es de mensajería',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'negativo', 'tipo-servicio'),
    pre: 'Cliente seleccionado. Tipo de servicio de tipo COURIER (Mensajería).',
    steps: [
      { a: 'Seleccionar un cliente.', d: '', r: '' },
      { a: 'Elegir un tipo de servicio de mensajería.', d: 'Tipo de servicio con type = COURIER.', r: '' },
      { a: 'Observar la primera fila de destino.', d: '', r: 'Debería no ofrecerse el switch «Destino Abierto», porque el modo no aplica a viajes que necesitan una dirección de entrega concreta.' },
    ],
    ref: 'new-trip.component.ts:166-169 canUseOpenDestination = !isDelivery && !isOneShotSelected; :3300-3306 isDelivery se deriva de type == COURIER',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC164',
    summary: 'MG-19 | TC164: Validar que «Destino Abierto» oculta el campo de destino y muestra su etiqueta al activarse',
    priority: 'Very High',
    labels: L('componente', 'capa-ui', 'smoke'),
    pre: 'Cliente seleccionado y tipo de servicio compatible.',
    steps: [
      { a: 'Activar el switch «Destino Abierto».', d: '', r: '' },
      { a: 'Observar la fila de destino y los botones de la sección Ruta.', d: '', r: 'Debería ocultarse por completo el campo de destino, no quedar visible y deshabilitado.\nDebería mostrarse la etiqueta «Destino Abierto» a la altura del pin.\nDebería ocultarse el botón de agregar parada y el de agregar destino de regreso.' },
    ],
    ref: 'new-trip.component.ts:184-186 showsDestinationField; html:720 y :731 ocultan agregar parada / destino de regreso; html:789-808 etiqueta',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC165',
    summary: 'MG-19 | TC165: Validar que «Destino Abierto» limpia las paradas, el destino de regreso y apaga ida y vuelta al activarse',
    priority: 'Very High',
    labels: L('componente', 'capa-ui', 'paradas', 'borde'),
    pre: 'Viaje en edición con origen, dos paradas cargadas, ida y vuelta activo y destino de regreso definido.',
    steps: [
      { a: 'Cargar origen, dos paradas intermedias y activar ida y vuelta con destino de regreso.', d: 'Dos waypoints válidos.', r: '' },
      { a: 'Activar el switch «Destino Abierto».', d: '', r: '' },
      { a: 'Revisar la sección Ruta.', d: '', r: 'Debería eliminar todas las paradas cargadas y dejar una sola fila de destino, ya reseteada.\nDebería apagar ida y vuelta y limpiar el destino de regreso, incluidos sus marcadores, notas y piso o departamento.' },
    ],
    ref: 'new-trip.component.ts:194-216 toggleOpenDestination(on)',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC166',
    summary: 'MG-19 | TC166: Validar que «Destino Abierto» descarta la simulación de vehículos vigente al activarse',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'precio', 'borde'),
    pre: 'Viaje con origen y destino resueltos y una cotización de vehículos ya realizada en pantalla.',
    steps: [
      { a: 'Cotizar el viaje para que se muestren las opciones de vehículo con su precio.', d: '', r: '' },
      { a: 'Activar el switch «Destino Abierto».', d: '', r: '' },
      { a: 'Observar el bloque de selección de vehículo.', d: '', r: 'Debería descartarse la simulación vigente y dejar de mostrarse las opciones de vehículo, obligando a cotizar de nuevo.' },
    ],
    ref: 'new-trip.component.ts:194-216 — this.showVehicleTypesOptions = false',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC167',
    summary: 'MG-19 | TC167: Validar que sin «Destino Abierto» y con el destino vacío no se ofrece cotizar el viaje',
    priority: 'Very High',
    labels: L('componente', 'capa-ui', 'negativo', 'smoke'),
    pre: 'Cliente y tipo de servicio elegidos. Origen resuelto. Destino vacío. Switch «Destino Abierto» apagado.',
    steps: [
      { a: 'Cargar solo el origen y dejar el destino vacío, con el modo apagado.', d: '', r: '' },
      { a: 'Buscar la acción de seleccionar vehículo o cotizar.', d: '', r: 'Debería no ofrecerse la acción de cotizar: el flujo simplemente no habilita el paso, sin mostrar un mensaje de error.' },
    ],
    ref: 'new-trip.component.ts:128-138 canSelectVehicle — exige último destino con latitud y longitud si el modo está apagado',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC168',
    summary: 'MG-19 | TC168: Validar que «Destino Abierto» habilita la cotización con el origen como único dato de ruta',
    priority: 'Very High',
    labels: L('componente', 'capa-ui', 'smoke', 'precio'),
    pre: 'Cliente y tipo de servicio compatibles. Origen resuelto con coordenadas. Destino Abierto activo.',
    steps: [
      { a: 'Activar «Destino Abierto» y cargar únicamente el origen.', d: 'Origen con latitud y longitud resueltas.', r: '' },
      { a: 'Buscar la acción de seleccionar vehículo.', d: '', r: 'Debería habilitarse la cotización con el origen como único dato de ruta, sin exigir un destino.' },
    ],
    ref: 'new-trip.component.ts:128-138 — if (this.isOpenDestinationTrip) return true',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC169',
    summary: 'MG-19 | TC169: Validar que «Destino Abierto» sigue exigiendo el origen para poder cotizar',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'negativo', 'borde'),
    pre: 'Destino Abierto activo. Origen sin resolver.',
    steps: [
      { a: 'Activar «Destino Abierto» sin cargar el origen.', d: '', r: '' },
      { a: 'Buscar la acción de seleccionar vehículo.', d: '', r: 'Debería seguir sin ofrecerse la cotización: el modo reemplaza al destino, nunca al origen.' },
    ],
    ref: 'new-trip.component.ts:128-131 — return false si el origen no tiene latitud y longitud',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC170',
    summary: 'MG-19 | TC170: Validar que la cotización con «Destino Abierto» se calcula con distancia cero',
    priority: 'Very High',
    labels: L('capa-ui-api', 'precio', 'tarifador'),
    pre: 'Destino Abierto activo con origen resuelto. Tipo de servicio con tarifador configurado.',
    steps: [
      { a: 'Activar «Destino Abierto» y resolver el origen.', d: '', r: '' },
      { a: 'Cotizar el viaje.', d: '', r: 'Debería mostrarse la cotización con distancia cero y el precio resultante de la base del tarifador, sin ruta calculada.\nTraza técnica: el backend cortocircuita la llamada a Google cuando el viaje es de destino abierto y devuelve distancia y duración en cero.' },
    ],
    ref: 'TravelService.java:896-901 y :948-951 calculateDistanceTimeProxy / calculateDistanceTime devuelven DistanceTimeData vacío si travel.getOpenTrip()',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC171',
    summary: 'MG-19 | TC171: Validar que cambiar a un tipo de servicio de mensajería apaga «Destino Abierto» y vuelve a exigir destino',
    priority: 'Very High',
    labels: L('componente', 'capa-ui', 'tipo-servicio', 'estado'),
    pre: 'Destino Abierto activo sobre un tipo de servicio compatible.',
    steps: [
      { a: 'Activar «Destino Abierto» con un tipo de servicio compatible.', d: '', r: '' },
      { a: 'Cambiar el tipo de servicio a uno de mensajería.', d: 'Tipo de servicio con type = COURIER.', r: '' },
      { a: 'Observar el switch y el campo de destino.', d: '', r: 'Debería apagarse el modo automáticamente, sin intervención del operador.\nDebería reaparecer el campo de destino y volver a exigirse para poder cotizar.' },
    ],
    ref: 'new-trip.component.ts:218-222 syncOpenDestinationWithTripType(), invocado en :3306 y :3384',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC172',
    summary: 'MG-19 | TC172: Validar que no se puede activar «Destino Abierto» sobre un tipo de servicio incompatible',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'negativo'),
    pre: 'Cliente seleccionado con un tipo de servicio de mensajería o con acuerdo OneShot seleccionado.',
    steps: [
      { a: 'Intentar activar «Destino Abierto» con un tipo de servicio incompatible.', d: '', r: '' },
      { a: 'Observar el estado del switch.', d: '', r: 'Debería quedar el switch apagado y el modo sin activarse, sin mostrar mensaje de error.' },
    ],
    ref: 'new-trip.component.ts:194-216 — const next = on && this.canUseOpenDestination',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC173',
    summary: 'MG-19 | TC173: Validar que el error de origen igual a destino se aplica sin el modo y se exceptúa con «Destino Abierto»',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'negativo', 'decision-table'),
    pre: 'Viaje sin renta. Un mismo lugar disponible para cargar como origen y como destino.',
    steps: [
      { a: 'Con el modo apagado, cargar el mismo lugar como origen y como destino y cotizar.', d: 'Mismo placeId en origen y destino.', r: '' },
      { a: 'Activar «Destino Abierto» y repetir la cotización solo con el origen.', d: '', r: 'Debería mostrarse el mensaje de ruta inválida cuando el modo está apagado y origen y destino coinciden.\nDebería no mostrarse ese mensaje con el modo activo, porque el destino abierto es justamente el caso donde origen y destino coinciden.' },
    ],
    ref: 'new-trip.component.ts:2500-2514 — el guard excluye !this.isOpenDestinationTrip y !this.isRental',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC174',
    summary: 'MG-19 | TC174: Validar que «Destino Abierto» informa la retención de tarjeta y la distancia teórica solo cuando el carrier las configuró',
    priority: 'Medium',
    labels: L('componente', 'capa-ui', 'parametros', 'borde'),
    pre: 'Dos carriers: uno con monto de retención y distancia teórica configurados en mayor que cero, otro con ambos en cero.',
    steps: [
      { a: 'Activar «Destino Abierto» en el carrier que tiene los parámetros configurados.', d: 'CC_HOLD_AMOUNT_OPEN_DESTINATION > 0 y TOTAL_DISTANCE_OPEN_TRIP > 0.', r: '' },
      { a: 'Repetir en el carrier que los tiene en cero.', d: 'Ambos parámetros en cero.', r: '' },
      { a: 'Comparar el cartel informativo en ambos casos.', d: '', r: 'Debería mostrarse el monto de retención de tarjeta y la distancia teórica solo cuando el carrier los tiene configurados en mayor que cero.\nDebería omitirse cada dato cuando su parámetro está en cero, sin que eso constituya un error.' },
    ],
    ref: 'new-trip.component.html:789-808 y ts:171-173 showsTheoreticalDistance; parámetros leídos en ts:1153-1154',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC175',
    summary: 'MG-19 | TC175: Validar que apagar «Destino Abierto» restituye el campo de destino y vuelve a exigirlo',
    priority: 'High',
    labels: L('componente', 'capa-ui', 'estado'),
    pre: 'Destino Abierto activo con origen resuelto.',
    steps: [
      { a: 'Apagar el switch «Destino Abierto».', d: '', r: '' },
      { a: 'Observar la sección Ruta y buscar la acción de cotizar.', d: '', r: 'Debería reaparecer el campo de destino vacío junto con los botones de agregar parada y destino de regreso.\nDebería volver a exigirse un destino resuelto para habilitar la cotización.' },
    ],
    ref: 'new-trip.component.ts:184-186 showsDestinationField; :128-138 canSelectVehicle',
  },
];

// ---------------------------------------------------------------------------
const M_CREATE_TEST = `
  mutation CreateTest($jira: JSON!, $testType: UpdateTestTypeInput, $folderPath: String) {
    createTest(jira: $jira, testType: $testType, folderPath: $folderPath) {
      test { issueId jira(fields: ["key"]) }
      warnings
    }
  }`;
const M_ADD_STEP = `
  mutation AddTestStep($issueId: String!, $action: String, $data: String, $result: String) {
    addTestStep(issueId: $issueId, step: { action: $action, data: $data, result: $result }) { id }
  }`;
const M_ADD_TO_PLAN = `
  mutation AddTestsToTestPlan($issueId: String!, $testIssueIds: [String]!) {
    addTestsToTestPlan(issueId: $issueId, testIssueIds: $testIssueIds) { warning }
  }`;
const M_ADD_TO_EXEC = `
  mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String]!) {
    addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) { warning }
  }`;
const M_ADD_TO_FOLDER = `
  mutation AddTestsToFolder($projectId: String, $path: String!, $testIssueIds: [String]!) {
    addTestsToFolder(projectId: $projectId, path: $path, testIssueIds: $testIssueIds) {
      folder { path testsCount } warnings
    }
  }`;

async function jira(path, init = {}) {
  const res = await fetch(`${JIRA_URL}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) { throw new Error(`Jira ${init.method || 'GET'} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`); }
  return res.status === 204 ? null : res.json();
}

function description(c) {
  return [
    '*Modo:* Destino Abierto (open trip)',
    '',
    'h3. Precondiciones',
    c.pre,
    '',
    'h3. Respaldo en código',
    `{{${c.ref}}}`,
    '',
    'h3. Trazabilidad',
    `* Historia: ${STORY}`,
    `* Identificador de suite: {{${c.tcid}}}`,
    `* ATP: ${ATP} · ATR: ${ATR}`,
    '',
    '----',
    '_Diseñado sobre comportamiento leído del código, no inferido. El precio final del viaje '
    + 'lo define la app driver al finalizar y NO es verificable desde esta pantalla; el «viaje de calle» '
    + 'es una entidad distinta (endpoint startStreetTravel) que solo comparte el flag openTrip._',
  ].join('\n');
}

const journal = (o) => { if (APPLY) { appendFileSync(JOURNAL, `${JSON.stringify(o)}\n`, 'utf8'); } };
const done = new Map();
if (existsSync(JOURNAL)) {
  for (const l of readFileSync(JOURNAL, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) { continue; }
    try { const e = JSON.parse(l); if (e.tcid && e.key) { done.set(e.tcid, e); } }
    catch { /* ignore */ }
  }
}

console.log(`\n=== Destino Abierto -> ${PROJECT_KEY} ${APPLY ? '' : '(DRY RUN)'} ===`);
console.log(`casos: ${CASES.length} · ATP ${ATP} · ATR ${ATR}\n`);

const created = [];
for (const [i, c] of CASES.entries()) {
  const tag = `[${i + 1}/${CASES.length}] ${c.tcid.replace('TS-ALTAVIAJE-', '')}`;
  if (done.has(c.tcid)) { console.log(`= ${tag} ya existe -> ${done.get(c.tcid).key}`); created.push(done.get(c.tcid)); continue; }

  if (!APPLY) {
    console.log(`  ${tag} ${c.priority.padEnd(9)} ${c.steps.length} pasos`);
    console.log(`     ${c.summary.slice(0, 110)}`);
    continue;
  }

  // never duplicate: adopt by tcid label
  const found = await jira(`/rest/api/3/search/jql?jql=${encodeURIComponent(
    `project = ${PROJECT_KEY} AND labels = "tcid:${c.tcid}"`,
  )}&fields=summary&maxResults=5`);
  let key, issueId;
  if ((found.issues || []).length > 1) { throw new Error(`DUPLICADO: ${c.tcid}`); }
  if ((found.issues || []).length === 1) {
    key = found.issues[0].key; issueId = found.issues[0].id;
    console.log(`↩ ${tag} adoptado ${key}`);
  }
  else {
    const r = await graphql(M_CREATE_TEST, {
      jira: {
        fields: {
          project: { key: PROJECT_KEY },
          summary: c.summary,
          labels: [...c.labels, `tcid:${c.tcid}`],
          priority: { name: c.priority },
          ...(ASSIGNEE ? { assignee: { id: ASSIGNEE } } : {}),
        },
      },
      testType: { name: 'Manual' },
      folderPath: FOLDER,
    });
    key = r.createTest.test.jira.key;
    issueId = r.createTest.test.issueId;
    if (!key.startsWith(`${PROJECT_KEY}-`)) { throw new Error(`ABORTO: key ${key} fuera de ${PROJECT_KEY}`); }
    journal({ tcid: c.tcid, key, issueId, created: true });
  }

  const live = await graphql(QUERIES.getTests, { jql: `key = ${key}`, limit: 1 });
  const already = live?.getTests?.results?.[0]?.steps?.length ?? 0;
  for (let s = already; s < c.steps.length; s++) {
    await graphql(M_ADD_STEP, { issueId, action: c.steps[s].a, data: c.steps[s].d || '', result: c.steps[s].r || '' });
  }
  await jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: description(c) } }) });

  const links = (await jira(`/rest/api/3/issue/${key}?fields=issuelinks`)).fields.issuelinks || [];
  if (!links.some(l => l.type.id === LINK_TEST && (l.outwardIssue || l.inwardIssue)?.key === STORY)) {
    await jira('/rest/api/3/issueLink', {
      method: 'POST',
      body: JSON.stringify({ type: { id: LINK_TEST }, outwardIssue: { key }, inwardIssue: { key: STORY } }),
    });
  }
  journal({ tcid: c.tcid, key, issueId, created: true, steps: c.steps.length, desc: true, linkStory: true });
  created.push({ tcid: c.tcid, key, issueId });
  console.log(`✔ ${tag} -> ${key} (${c.steps.length} pasos)`);
}

if (APPLY && created.length) {
  const ids = created.map(c => c.issueId);
  const projectId = (await graphql(QUERIES.getProjectSettings, { projectIdOrKey: PROJECT_KEY })).getProjectSettings.projectId;
  await graphql(M_ADD_TO_FOLDER, { projectId, path: FOLDER, testIssueIds: ids });
  const atpId = (await jira(`/rest/api/3/issue/${ATP}?fields=summary`)).id;
  const atrId = (await jira(`/rest/api/3/issue/${ATR}?fields=summary`)).id;
  await graphql(M_ADD_TO_PLAN, { issueId: atpId, testIssueIds: ids });
  await graphql(M_ADD_TO_EXEC, { issueId: atrId, testIssueIds: ids });
  console.log(`\n✔ ${ids.length} tests en carpeta, en el ATP ${ATP} y en el ATR ${ATR}`);
  console.log(created.map(c => c.key).join(' '));
}

console.log('');
