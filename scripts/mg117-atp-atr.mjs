/**
 * MG-117 (App Driver - migrar autocomplete al endpoint propio):
 * materializes the acceptance test plan (ATP), its 17 manual Xray Tests and the
 * acceptance test execution (ATR) in the TM project.
 *
 * Why a script instead of the `bun xray` CLI: on this machine `bun.cmd` truncates any
 * CLI argument that contains embedded newlines, and both the ATP and ATR bodies are
 * long multi-line wiki-markup documents. Everything that carries a body goes through
 * Jira REST v2 (wiki markup -> ADF server-side); everything that touches Xray-internal
 * state (steps, plan/execution membership, preconditions) goes through the Xray
 * GraphQL client already vendored in cli/xray/lib/graphql.ts.
 *
 * Xray gotchas encoded here:
 *   - createTest silently drops inline steps and folderPath -> steps are added one by
 *     one with addTestStep, using the numeric issueId.
 *   - Plan/Execution <-> Test membership is Xray-internal. A Jira issue link does NOT
 *     create test runs; only addTestsToTestPlan / addTestsToTestExecution do.
 *   - createTest/createTestPlan/createTestExecution take the description through Jira's
 *     ADF API, so bodies are written afterwards with a REST v2 PUT.
 *
 * Usage:
 *   bun scripts/mg117-atp-atr.mjs <phase> [--apply]
 *
 *   phases: tests | plan | exec | membership | links | bodies | comment | all
 *   Without --apply nothing is written (dry run). State is kept in
 *   .context/magiis-process/mg117-xray-state.json so phases are resumable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, MUTATIONS } from '../cli/xray/lib/graphql.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = resolve(ROOT, '.context/magiis-process');
const STATE_FILE = resolve(STATE_DIR, 'mg117-xray-state.json');

const PHASE = process.argv[2] ?? 'all';
const APPLY = process.argv.includes('--apply');

const STORY = 'MG-117';
const PROJECT = 'TM';
const EPIC_PLAN = 'TM-34'; // QA Master Test Plan
const EPIC_ARTIFACTS = 'TM-1'; // QA Test Artifacts
const EPIC_REPO = 'TM-20'; // QA Test Repository
const ENVIRONMENT = 'test';
const ASSIGNEE = '712020:3302f4bc-92ff-4619-b1e1-9721e5268e6f'; // Emanuel Restrepo

const LINK_TEST = 'Test';
const LINK_RELATES = 'Relates';

// ---------------------------------------------------------------- Jira REST v2/v3

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
  if (!r.ok) { throw new Error(`Jira ${path} -> ${r.status} ${(await r.text()).slice(0, 400)}`); }
  return r.status === 204 ? null : r.json();
};

/** Writes a wiki-markup body onto an issue. REST v2 converts it to ADF server-side. */
const setDescription = (key, body) =>
  jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: body } }) });

const setParent = (key, parentKey) =>
  jira(`/rest/api/2/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { parent: { key: parentKey } } }) });

const setAssignee = key =>
  jira(`/rest/api/3/issue/${key}/assignee`, { method: 'PUT', body: JSON.stringify({ accountId: ASSIGNEE }) });

const link = (type, inward, outward) =>
  jira('/rest/api/3/issueLink', {
    method: 'POST',
    body: JSON.stringify({ type: { name: type }, inwardIssue: { key: inward }, outwardIssue: { key: outward } }),
  });

// ---------------------------------------------------------------- state

const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {});
const saveState = (s) => {
  if (!existsSync(STATE_DIR)) { mkdirSync(STATE_DIR, { recursive: true }); }
  writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`, 'utf8');
};
const state = loadState();
state.tests ??= {};

// ---------------------------------------------------------------- test corpus

const PRECONDITION = {
  id: 'PRE',
  summary:
    'MG-117 | PRE: App Driver v2.6.15 en test, conductor logueado, viaje con origen definido y DevTools remoto conectado',
  definition: [
    '1. APK Magiis-Driver_test_2.6.15 instalada en un Android fisico.',
    '2. Conductor con credenciales validas del entorno test y sesion iniciada.',
    '3. Un viaje en edicion con ORIGEN ya definido: el sesgo por ubicacion se toma del origen del viaje.',
    '4. Depuracion USB activada. El dispositivo aparece en chrome://inspect y el WebView de la app abre con el panel Network.',
    '5. En Network: filtro "autocomplete" para el endpoint propio y filtro "maps.googleapis.com" para verificar el retiro de Google. Columna de tiempo visible para medir el debounce.',
    '6. Backend magiis-be v1.72.8 o superior desplegado en test (MG-118 Finalizada).',
  ].join('\n'),
};

const TESTS = [
  {
    id: 'TC1',
    gate: 'GO/NO-GO',
    covers: 'Escenario 7 (CA-27) - retiro de Google',
    summary:
      'MG-117 | TC1: Validar que el autocompletado consulta places/autocomplete y no registra ningun request a maps.googleapis.com',
    intent:
      'Es el caso que define si la migracion ocurrio. Mide la sustitucion de la fuente, no la calidad de las sugerencias.',
    steps: [
      ['Abrir la pantalla de busqueda de direccion del viaje', 'Panel Network limpio en chrome://inspect', 'El campo de direccion queda enfocado y el panel Network no registra requests de autocomplete'],
      ['Escribir un termino de direccion a ritmo normal', 'corrientes 1234', 'La lista de predicciones se despliega con resultados'],
      ['Filtrar el panel Network por "autocomplete"', '-', 'Hay al menos un GET a places/autocomplete con HTTP 200'],
      ['Filtrar el panel Network por "maps.googleapis.com"', '-', 'Cero requests. No hubo ninguna llamada directa a Google Places durante la busqueda'],
    ],
  },
  {
    id: 'TC2',
    gate: 'GO/NO-GO',
    covers: 'Escenario 5 corregido - sesgo por ubicacion',
    summary:
      'MG-117 | TC2: Validar que el request a places/autocomplete lleva address y las coordenadas del origen, y no lleva radius ni language',
    intent:
      'El AC del ticket pide enviar radius. El contrato real del endpoint NO lo recibe: el radio de 10 km lo aplica el backend. Este caso verifica el contrato real, no el texto del AC.',
    steps: [
      ['Con el viaje con origen ya definido, abrir el campo de destino', 'Origen fijado en CABA', 'El campo queda enfocado'],
      ['Escribir un termino de direccion', 'av corrientes', 'Se dispara la consulta al endpoint'],
      ['Abrir el request de autocomplete en Network y leer la query string', '-', 'Contiene address con el termino url-encodeado, y latitude + longitude con las coordenadas del origen del viaje'],
      ['Revisar la misma query string buscando radius y language', '-', 'NO aparece ningun parametro radius ni language'],
    ],
  },
  {
    id: 'TC3',
    gate: 'GO/NO-GO',
    covers: 'Escenario 4 - mapeo del DTO',
    summary:
      'MG-117 | TC3: Validar que la lista de predicciones se renderiza con mainText, secondaryText y shortName del DTO',
    intent: 'Verifica el mapeo al PredictionModel contra los nombres reales de campo del DTO del backend.',
    steps: [
      ['Buscar una direccion conocida', 'san martin 500', 'Se listan predicciones'],
      ['Leer la respuesta JSON del request en Network', '-', 'Cada elemento trae placeId, mainText, secondaryText, shortName, latitude, longitude, airport, iataCode y source'],
      ['Comparar la respuesta contra lo que muestra la lista', '-', 'El renglon principal de cada item es mainText y el secundario es secondaryText. No se muestran campos crudos, ni "undefined", ni renglones vacios'],
    ],
  },
  {
    id: 'TC4',
    gate: 'GO/NO-GO',
    covers: 'Escenario 4 - integracion con la resolucion del lugar',
    summary: 'MG-117 | TC4: Validar que al elegir una prediccion se resuelve la direccion y el flujo de viaje continua',
    intent: 'Cierra el circuito: la migracion del autocomplete no debe romper la resolucion posterior del lugar.',
    steps: [
      ['Buscar y tocar una prediccion con placeId no nulo', 'Una direccion de calle', 'La lista se cierra y el campo queda con la direccion elegida'],
      ['Observar Network', '-', 'Se dispara la resolucion del lugar (getPlace / getMagiisGeoCode) con el placeId elegido y responde HTTP 200'],
      ['Continuar el flujo del viaje', '-', 'El viaje toma la direccion con sus coordenadas. No hay error ni campo vacio'],
    ],
  },
  {
    id: 'TC5',
    gate: 'GO/NO-GO',
    covers: 'Escenario 1 (CA-04) - debounce ~300 ms',
    summary: 'MG-117 | TC5: Validar que el tecleo continuo genera una sola llamada, ~300 ms despues de la ultima tecla',
    intent:
      'Hoy el consumidor tiene debounceTime(1500). Este caso mide la ventana real y ademas verifica que el debounce recorte rafagas sin bloquear busquedas legitimas.',
    steps: [
      ['Limpiar el panel Network', '-', 'Cero requests de autocomplete'],
      ['Escribir un termino completo sin pausas mayores a 300 ms', 'corrientes', 'Aparecen las predicciones'],
      ['Contar los requests a places/autocomplete y leer sus timestamps', '-', 'Hay UNA sola llamada. Su inicio esta ~300 ms despues de la ultima pulsacion (tolerancia 250-400 ms)'],
      ['Repetir escribiendo con pausas mayores a 300 ms entre grupos de letras', 'cor / rien / tes', 'Se dispara una llamada por pausa: el debounce recorta rafagas pero no suprime busquedas intermedias legitimas'],
    ],
  },
  {
    id: 'TC6',
    gate: 'regresion',
    covers: 'Escenario 2 (CA-05) - distinctUntilChanged',
    summary: 'MG-117 | TC6: Validar que un termino identico al ya consultado no dispara una nueva llamada',
    intent:
      'distinctUntilChanged ya existe en el consumidor desde 2023: este caso es guarda de regresion, no verificacion de algo nuevo.',
    steps: [
      ['Escribir un termino y esperar las predicciones', 'ezeiza', 'Se registra exactamente una llamada'],
      ['Quitar el foco del campo y volver a enfocarlo, sin modificar el texto', '-', 'El texto sigue siendo el mismo'],
      ['Contar los requests a places/autocomplete', '-', 'Sigue habiendo una sola llamada: el termino sin cambios no re-consulta'],
      ['Escribir un caracter y borrarlo, volviendo al mismo texto', 'ezeizaa y luego ezeiza', 'Al volver al termino original no se emite una llamada adicional con ese mismo termino'],
    ],
  },
  {
    id: 'TC7',
    gate: 'GO/NO-GO',
    covers: 'Escenario 3 - minLength (particion por debajo del limite)',
    summary: 'MG-117 | TC7: Validar que con 2 caracteres no se consulta el endpoint',
    intent: 'Limite inferior. Protege el objetivo de costo: por debajo del minimo no debe salir ninguna consulta.',
    steps: [
      ['Limpiar Network y el campo de direccion', '-', 'Cero requests'],
      ['Escribir un solo caracter y esperar 1 segundo', 'e', 'Cero requests a places/autocomplete. La lista no se despliega'],
      ['Escribir el segundo caracter y esperar 1 segundo', 'ez', 'Cero requests a places/autocomplete. El gate de longitud minima no se cruzo'],
    ],
  },
  {
    id: 'TC8',
    gate: 'GO/NO-GO',
    covers: 'Escenario 3 + MG-118 CA-02 - minLength (limite exacto)',
    summary: 'MG-117 | TC8: Validar que con exactamente 3 caracteres si se consulta el endpoint',
    intent:
      'Boundary critico. El codigo actual usa el guard value.trim().length > MIN_STRING_SIZE con MIN_STRING_SIZE = 3, lo que exige 4 caracteres y rompe el soporte de codigos IATA. Debe ser >=. Es el mismo defecto de operador que App PAX ya corrigio.',
    steps: [
      ['Limpiar Network. Escribir dos caracteres', 'ez', 'Cero requests (control del limite inferior)'],
      ['Escribir el tercer caracter y esperar 1 segundo', 'eze', 'Se dispara EXACTAMENTE una llamada a places/autocomplete con address=eze'],
      ['Leer la respuesta', '-', 'Devuelve el aeropuerto de Ezeiza por codigo IATA exacto, con source=AIRPORT'],
    ],
  },
  {
    id: 'TC9',
    gate: 'normal',
    covers: 'MG-118 CA-03 - routing por longitud (4+)',
    summary: 'MG-117 | TC9: Validar que con 4 caracteres la respuesta combina aeropuertos por nombre y direcciones de la cache',
    intent: 'Limite superior del routing del backend: con 3 solo IATA exacto, con 4 o mas se suman nombre de aeropuerto y magiis_place.',
    steps: [
      ['Escribir cuatro caracteres de un nombre de aeropuerto', 'ezei', 'Una llamada a places/autocomplete'],
      ['Leer la respuesta', '-', 'Aparece el aeropuerto por coincidencia de nombre (source=AIRPORT) y queda primero en la lista combinada'],
      ['Escribir cuatro caracteres de una calle', 'corr', 'Las predicciones incluyen direcciones con source=CACHE o source=GOOGLE'],
    ],
  },
  {
    id: 'TC10',
    gate: 'normal',
    covers: 'Escenario 4 + MG-118 CA-06 - aeropuerto por IATA',
    summary: 'MG-117 | TC10: Validar que un codigo IATA de 3 letras devuelve el aeropuerto con su icono diferenciado',
    intent:
      'Verifica el campo booleano con su nombre serializado REAL. El ticket dice isAirport; el DTO expone airport (Lombok/Jackson). Si el cliente lee isAirport, el icono nunca aparece.',
    steps: [
      ['Escribir un codigo IATA valido', 'aep', 'Una llamada a places/autocomplete'],
      ['Leer la respuesta en Network', '-', 'La prediccion trae airport=true (el campo se llama airport, NO isAirport), iataCode con el codigo y source=AIRPORT'],
      ['Observar el renglon en la lista', '-', 'Se muestra con el icono de aeropuerto, visualmente distinto del de una direccion comun'],
    ],
  },
  {
    id: 'TC11',
    gate: 'informativo',
    covers: 'Borde no cubierto por ningun AC',
    summary: 'MG-117 | TC11: Validar que una prediccion de aeropuerto con placeId nulo se resuelve sin romper el flujo',
    intent:
      'El AC asume placeId siempre presente. El backend puede devolverlo nulo cuando source=AIRPORT. Sin este caso, el defecto solo aparece en produccion.',
    steps: [
      ['Buscar un aeropuerto por codigo IATA y leer la respuesta', 'eze', 'Al menos una prediccion con source=AIRPORT'],
      ['Confirmar en el JSON si placeId viene null', '-', 'Se registra el valor observado. El contrato admite placeId nulo en source=AIRPORT'],
      ['Tocar esa prediccion', '-', 'La app resuelve el lugar por nombre o usa latitude/longitude del propio DTO. No hay crash, ni request con placeId=null, ni campo vacio'],
    ],
  },
  {
    id: 'TC12',
    gate: 'informativo',
    covers: 'MG-118 CA-07 - la busqueda por codigo no aplica sesgo',
    summary: 'MG-117 | TC12: Validar que la busqueda por codigo IATA no aplica sesgo por ubicacion',
    intent: 'Separa dos reglas que el AC mezcla: el sesgo aplica a direcciones, no a codigos IATA.',
    steps: [
      ['Con un viaje cuyo origen este en CABA, buscar un codigo IATA', 'eze', 'Devuelve el aeropuerto de Ezeiza'],
      ['Cambiar el origen del viaje a una ubicacion lejana y repetir la busqueda', 'eze', 'Devuelve el mismo aeropuerto, en la misma posicion de la lista'],
      ['Comparar ambas respuestas', '-', 'El resultado por codigo IATA es identico: el sesgo por ubicacion no lo altera'],
    ],
  },
  {
    id: 'TC13',
    gate: 'GO/NO-GO',
    covers: 'Escenario 6 (CA-28 / CA-29) - sessionToken por sesion',
    summary: 'MG-117 | TC13: Validar que todas las llamadas de una sesion de busqueda comparten el mismo sessionToken',
    intent:
      'El sessionToken es lo que convierte N llamadas facturables de Google en una sola sesion. Sin el, el ahorro de costo del epic no se materializa aunque el endpoint propio responda.',
    steps: [
      ['Limpiar Network y abrir el campo de direccion', '-', 'Sesion de busqueda nueva'],
      ['Escribir progresivamente hasta obtener predicciones, generando al menos 3 llamadas', 'cor / corri / corrientes', 'Tres requests a places/autocomplete'],
      ['Leer el parametro sessionToken de cada request', '-', 'Los tres llevan el MISMO sessionToken y su formato es UUID'],
      ['Tocar una prediccion y observar la llamada de resolucion', '-', 'getPlace / getMagiisGeoCode viaja con ese mismo sessionToken'],
    ],
  },
  {
    id: 'TC14',
    gate: 'normal',
    covers: 'Escenario 6 (CA-30) - descarte del token',
    summary: 'MG-117 | TC14: Validar que tras seleccionar una prediccion la siguiente busqueda usa un sessionToken nuevo',
    intent: 'La otra mitad de la maquina de estados del token: si no se descarta, Google factura la sesion entera como una sola y los resultados se degradan.',
    steps: [
      ['Completar una busqueda y seleccionar una prediccion', '-', 'Se registra el sessionToken de esa sesion (token A)'],
      ['Abrir de nuevo el campo e iniciar otra busqueda', 'san martin', 'Nuevas llamadas a places/autocomplete'],
      ['Comparar el sessionToken de las nuevas llamadas contra el token A', '-', 'Es un UUID distinto: el token se descarto tras la seleccion'],
    ],
  },
  {
    id: 'TC15',
    gate: 'normal',
    covers: 'Riesgo fuera de AC - respuesta vacia',
    summary: 'MG-117 | TC15: Validar que un termino sin resultados muestra un estado vacio controlado',
    intent: 'El ticket no define el comportamiento ante cero resultados. Con cache-first, el vacio deja de ser un caso raro.',
    steps: [
      ['Escribir un termino sin coincidencias', 'zzzqqqxxx', 'Una llamada a places/autocomplete con HTTP 200 y arreglo vacio'],
      ['Observar la pantalla', '-', 'No se despliega lista, o se muestra el mensaje de sin resultados. No hay spinner colgado, ni error, ni renglones en blanco'],
      ['Corregir el termino a uno valido', 'corrientes', 'La lista se puebla normalmente: el estado vacio no dejo la pantalla trabada'],
    ],
  },
  {
    id: 'TC16',
    gate: 'GO/NO-GO',
    covers: 'Riesgo fuera de AC - degradacion del endpoint',
    summary: 'MG-117 | TC16: Validar que un error 5xx o un timeout del endpoint degrada de forma controlada y no cae a Google directo',
    intent:
      'La migracion introduce un punto unico de fallo que antes no existia. Un fallback silencioso a Google anularia el ahorro sin que nadie lo note.',
    steps: [
      ['En DevTools, bloquear la URL de places/autocomplete (Block request URL) o poner la red en offline', '-', 'Las siguientes consultas al endpoint fallan'],
      ['Escribir un termino valido', 'corrientes', 'La app no crashea. Muestra un estado de error o simplemente no ofrece predicciones'],
      ['Filtrar Network por maps.googleapis.com', '-', 'Cero requests. Ante el fallo del endpoint propio NO se reintenta contra Google directo'],
      ['Quitar el bloqueo y repetir la busqueda', 'corrientes', 'La app se recupera y vuelve a listar predicciones sin necesidad de reiniciarla'],
    ],
  },
  {
    id: 'TC17',
    gate: 'regresion',
    covers: 'Regresion de la pantalla de viaje',
    summary: 'MG-117 | TC17: Validar que el flujo de busqueda y edicion de direccion del conductor no presenta regresion',
    intent:
      'App PAX incorporo skipLoader para este endpoint. Si Driver no lo hace, el loader global parpadea en cada consulta y la pantalla se vuelve inusable aunque los ACs pasen.',
    steps: [
      ['Desde un viaje asignado, editar la direccion de destino usando el autocompletado', '-', 'La busqueda funciona y se puede seleccionar una direccion'],
      ['Guardar el cambio', '-', 'El viaje persiste la nueva direccion con sus coordenadas'],
      ['Observar el indicador de carga durante la busqueda', '-', 'El loader global no se dispara en cada pulsacion (skipLoader aplicado al endpoint de autocomplete). La pantalla no parpadea'],
      ['Recorrer el resto de la pantalla de viaje', '-', 'No hay regresion en mapa, tarifa ni navegacion'],
    ],
  },
];

// ---------------------------------------------------------------- bodies

const k = id => state.tests[id]?.key ?? `(${id} pendiente)`;
const ATP = () => state.atp?.key ?? '(ATP pendiente)';
const ATR = () => state.atr?.key ?? '(ATR pendiente)';

function atpBody() {
  const L = [];
  const A = (s = '') => L.push(s);

  A(`h2. ATP · ${STORY} — Autocomplete via endpoint propio (App Driver v2.6.15)`);
  A();
  A(`Plan de pruebas de aceptacion de *${STORY}* _App Driver — migrar autocomplete al endpoint propio_. `
    + '{{fixVersion}} *v2.6.15 App Driver* · Epica padre *MG-112* _Optimizacion de consumo de Google Maps Platform_ · '
    + 'Dependencia backend *MG-118* (Finalizada, v1.72.8).');
  A();
  A('h3. Objetivo');
  A();
  A('Verificar que el autocompletado de direcciones de la App Driver deja de consultar Google Places directamente '
    + 'y pasa a consumir el endpoint propio {{places/autocomplete}}, con control de frecuencia (debounce, '
    + 'distinctUntilChanged, longitud minima) y con {{sessionToken}} por sesion — que es lo que convierte el cambio '
    + 'en un ahorro real de costo y no solo en un cambio de origen de datos.');
  A();
  A('h3. Baseline verificado en codigo — 2026-08-11');
  A();
  A('{panel:title=La implementacion no esta publicada en GitLab}');
  A(`Re-verificacion sobre {{repo.magiis/magiis-mobile-driver-v2}} al ${'2026-08-11'}: cero ramas de ${STORY}, cero `
    + 'merge requests, cero coincidencias de {{places/autocomplete}}, {{getMagiisAutocomplete}} y {{sessionToken}} en todo el repo. '
    + 'La rama {{release/v2.6.15}} existe pero su HEAD ({{0fe45dbf}}) es el mismo commit que {{develop}}: no tiene commits propios. '
    + '{{google-places.service.ts}} no se toca desde {{c6f42dd8}}, del 2024-04-22.');
  A('{panel}');
  A();
  A('Estado real del cliente, medido en {{develop}}:');
  A();
  A('||Aspecto||Estado hoy||Referencia||');
  A('|Origen de las predicciones|Google directo: {{getPlacePredictions}}|{{google-places.service.ts:104}}|');
  A('|Endpoint propio|Ausente|0 coincidencias en el repo|');
  A('|{{radius}}|Se envia desde el cliente: {{radius: 10000}}|{{google-places.service.ts:64-71}}|');
  A('|{{sessionToken}}|Ausente|0 coincidencias en el repo|');
  A('|Debounce|*1500 ms*, no 300|{{travel-edit-search.ts:41}}|');
  A('|{{distinctUntilChanged}}|*Ya presente desde 2023* — no atribuible a esta historia|{{travel-edit-search.ts:41}}|');
  A('|Longitud minima|{{MIN_STRING_SIZE = 3}} con guard {{>}} ⇒ *minimo efectivo 4*|{{travel-edit-search.ts:27,42}}|');
  A('|Mapeo|Solo 4 campos de Google. Sin {{airport}}, {{iataCode}}, {{latitude}}/{{longitude}} ni {{source}}|{{mapPreditionToPlace}}|');
  A('|{{geocode()}}|*Ya migrado* al proxy propio ({{getMagiisGeoCode}})|{{google-places.service.ts:80}}|');
  A();
  A('h3. Contrato real del endpoint — verificado en Carrier v2 y App PAX');
  A();
  A('El texto de los criterios de aceptacion difiere del contrato que el backend expone. Este ATP prueba *el contrato real*.');
  A();
  A('*Request* ({{GET places/autocomplete}}): {{address}} (obligatorio) · {{latitude?}} · {{longitude?}} · {{sessionToken?}}. '
    + '*No recibe* {{radius}} ni {{language}} — el radio de 10 km lo aplica el backend.');
  A();
  A('*Response* (PredictionDTO): {{placeId}} _(nullable en {{source=AIRPORT}})_ · {{mainText}} · {{secondaryText}} · '
    + '{{shortName}} · {{latitude}} · {{longitude}} · *{{airport}}* _(no {{isAirport}} — Lombok/Jackson)_ · {{iataCode}} · '
    + '{{source}} ({{AIRPORT}} | {{CACHE}} | {{GOOGLE}}).');
  A();
  A('*Routing por longitud* (MG-118): menos de 3 caracteres devuelve vacio · exactamente 3 busca solo IATA exacto · '
    + '4 o mas suma aeropuertos por nombre y direcciones de {{magiis_place}}.');
  A();
  A('h3. Criterios de aceptacion cubiertos');
  A();
  A('||#||Criterio del ticket||Casos que lo cubren||Nota||');
  A(`|Esc. 1|Debounce ~300 ms (CA-04)|${k('TC5')}|Hoy son 1500 ms|`);
  A(`|Esc. 2|{{distinctUntilChanged}} (CA-05)|${k('TC6')}|Ya cumplido antes de esta historia: el caso es guarda de regresion|`);
  A(`|Esc. 3|minLength 3|${k('TC7')} · ${k('TC8')} · ${k('TC9')}|BVA sobre el limite. Hoy el operador {{>}} lo deja en 4|`);
  A(`|Esc. 4|Mapeo del DTO (contrato 7.3)|${k('TC3')} · ${k('TC4')} · ${k('TC10')} · ${k('TC11')}|Se prueba {{airport}}, no {{isAirport}}|`);
  A(`|Esc. 5|Sesgo por ubicacion|${k('TC2')} · ${k('TC12')}|Corregido: el request no lleva {{radius}}|`);
  A(`|Esc. 6|{{sessionToken}} (CA-28 / CA-30)|${k('TC13')} · ${k('TC14')}|-|`);
  A(`|Esc. 7|Transicion y retiro de Google (CA-27)|${k('TC1')} · ${k('TC16')}|-|`);
  A();
  A('Cobertura mas alla del criterio, que ningun AC menciona:');
  A();
  A('||Riesgo||Caso||Por que importa||');
  A(`|{{placeId}} nulo en predicciones de aeropuerto|${k('TC11')}|El AC asume {{placeId}} siempre presente|`);
  A(`|Respuesta vacia|${k('TC15')}|Con cache-first el vacio deja de ser un caso raro|`);
  A(`|5xx / timeout del endpoint propio|${k('TC16')}|La migracion introduce un punto unico de fallo nuevo|`);
  A(`|Loader global en cada pulsacion|${k('TC17')}|PAX incorporo {{skipLoader}}; Driver todavia no|`);
  A();
  A('h3. Alcance');
  A();
  A('*Dentro*: autocompletado de direcciones en la App Driver (busqueda y edicion de destino del viaje), control de '
    + 'frecuencia, contrato del request y de la respuesta, ciclo de vida del {{sessionToken}}, retiro de la llamada '
    + 'directa a Google y degradacion ante fallo del endpoint.');
  A();
  A('*Fuera*: la implementacion del backend {{places/autocomplete}} (MG-118, ya Finalizada y validada aparte) · '
    + 'las otras tres superficies de la epica — Carrier v2 (MG-114), Contractor (MG-115) y App PAX (MG-116) · '
    + 'la calidad intrinseca de las sugerencias de Google · el ahorro de costo medido en la consola de facturacion.');
  A();
  A('h3. Riesgos y limitaciones conocidas');
  A();
  A(`# *QA-${STORY}-001 (bloqueante)* — la implementacion no existe en GitLab. El APK `
    + '{{Magiis-Driver_test_2.6.15.apk}} adjuntado el 2026-08-08 no es reproducible desde el repositorio. Si muestra el '
    + 'flujo nuevo, se construyo desde codigo local no publicado, lo que ademas de funcional es un bloqueante de trazabilidad.');
  A(`# *QA-${STORY}-002* — el guard de longitud minima usa {{>}} en lugar de {{>=}}, con lo que el minimo efectivo es 4 `
    + 'y los codigos IATA de 3 letras nunca disparan una consulta. Es el mismo defecto que App PAX ya corrigio. Si la '
    + `migracion se implementa copiando el codigo actual, el defecto se arrastra. Lo cubre ${k('TC8')}.`);
  A(`# *QA-${STORY}-003* — el texto de los criterios de aceptacion contradice el contrato real en tres puntos `
    + '({{radius}}, {{isAirport}}, {{placeId}} no nulo). Un desarrollador que implemente lo que dice el ticket produce '
    + 'codigo incorrecto. Reportado en el comentario de shift-left, pendiente de confirmacion de PO/Dev.');
  A(`# *QA-${STORY}-004* — dos de los tres controles de frecuencia que el ticket pide agregar ya existen en el codigo `
    + 'desde 2023. El texto del alcance ("hoy la app no tiene ninguno") es falso, lo que distorsiona la estimacion.');
  A(`# *QA-${STORY}-005* — el ticket no define el comportamiento esperado ante cuota agotada, timeout o cero `
    + `resultados. ${k('TC15')} y ${k('TC16')} cubren el riesgo, pero su resultado esperado es un criterio propuesto por QA, no acordado.`);
  A();
  A('h3. Gap de cobertura');
  A();
  A('El corpus de TM no tiene *ningun* caso sobre autocompletado de direcciones en App Driver: todo lo existente esta '
    + 'organizado por pasarela de pago y por flujo de alta de viaje. Los 17 casos de este ATP son nuevos en su totalidad, '
    + 'sin reciclaje posible. Los dos unicos casos del corpus que rozan el tema (autocomplete en Carrier v2) pertenecen a '
    + 'otra superficie y a otro componente.');
  A();
  A('h3. Instrumentacion');
  A();
  A('Cuatro de los siete criterios no son observables en la interfaz: se verifican en el trafico de red. La App Driver '
    + 'es Ionic/Cordova y todo el trafico de autocompletado sale del WebView, asi que alcanza con *{{chrome://inspect}} + '
    + 'el panel Network del DevTools remoto* — sin proxy, sin certificado y sin instalar nada en el dispositivo.');
  A();
  A('||Que se mide||Como||');
  A('|Debounce|Columna de tiempo del request contra el instante de la ultima pulsacion|');
  A('|{{distinctUntilChanged}} y longitud minima|Conteo de requests con el filtro "autocomplete"|');
  A('|Contrato del request|Query string del request ({{address}}, {{latitude}}, {{longitude}}, {{sessionToken}})|');
  A('|Retiro de Google|Filtro "maps.googleapis.com" — debe quedar en cero|');
  A('|Degradacion|{{Block request URL}} sobre el endpoint, y modo offline|');
  A();
  A('h3. Entorno');
  A();
  A('App Driver *v2.6.15* (APK {{Magiis-Driver_test_2.6.15.apk}}) sobre Android fisico — registrar modelo y version de '
    + 'Android en la ejecucion · entorno *test* · backend magiis-be *v1.72.8* o superior · conductor con viaje en edicion '
    + `y origen definido. Precondicion compartida por los 17 casos: ${k('PRE')}.`);
  A();
  A(`_Ejecucion: ${ATR()}._`);

  return L.join('\n');
}

function atrBody() {
  const L = [];
  const A = (s = '') => L.push(s);
  const row = (n, id, txt) => A(`|${n}|${k(id)}|${txt}|${TESTS.find(t => t.id === id).gate}|`);

  A(`h2. ATR · ${STORY} — Smoke de validacion del endpoint propio (App Driver v2.6.15, Android)`);
  A();
  A(`Ejecucion de aceptacion del ATP *${ATP()}*, para validar la migracion del autocompletado de la App Driver al `
    + 'endpoint propio {{places/autocomplete}}.');
  A();
  A('{panel:title=Estado: BLOQUEADO — no ejecutable todavia}');
  A('*17 corridas creadas, todas en {{TO DO}}.* La ejecucion no puede empezar porque la implementacion no esta '
    + `publicada: al 2026-08-11 no existe rama ni merge request de ${STORY} en {{repo.magiis/magiis-mobile-driver-v2}}, `
    + '{{develop}} sigue llamando a Google directo y {{release/v2.6.15}} no tiene commits propios. El APK adjuntado el '
    + '2026-08-08 no es reproducible desde el repositorio.');
  A('{panel}');
  A();
  A('h3. Precondicion de desbloqueo');
  A();
  A(`# Existe rama y merge request de ${STORY} en {{magiis-mobile-driver-v2}}, con {{places/autocomplete}} en el diff.`);
  A('# El desarrollador confirma el SHA exacto desde el que se compilo el APK 2.6.15, y ese SHA esta en el repositorio.');
  A('# PO/Dev responden las contradicciones de contrato del comentario de shift-left ({{radius}}, {{airport}}, {{placeId}} nullable, minLength).');
  A();
  A('Mientras alguna de las tres no se cumpla, las corridas se mantienen en {{TO DO}}: marcarlas contra un binario no '
    + 'trazable produciria evidencia que no se puede reproducir.');
  A();
  A('h3. Smoke — 17 casos, en orden de ejecucion');
  A();
  A('Ordenado para fallar rapido: primero lo que la migracion tiene que arreglar, despues los bordes, al final la regresion.');
  A();
  A('||#||Test||Caso||Gate||');
  row(1, 'TC1', 'La busqueda consulta el endpoint propio y no queda ningun request a maps.googleapis.com');
  row(2, 'TC2', 'El request lleva address + coordenadas del origen, y no lleva radius ni language');
  row(3, 'TC8', 'Con exactamente 3 caracteres si se consulta — hoy falla por el operador {{>}}');
  row(4, 'TC7', 'Con 2 caracteres no se consulta');
  row(5, 'TC5', 'El tecleo continuo genera una sola llamada, ~300 ms despues de la ultima tecla');
  row(6, 'TC13', 'Todas las llamadas de la sesion comparten el mismo sessionToken');
  row(7, 'TC3', 'Las predicciones se renderizan con mainText, secondaryText y shortName del DTO');
  row(8, 'TC4', 'Elegir una prediccion resuelve la direccion y el flujo de viaje continua');
  row(9, 'TC16', 'Un 5xx o timeout degrada de forma controlada y no cae a Google directo');
  row(10, 'TC9', 'Con 4 caracteres la respuesta combina aeropuertos por nombre y direcciones de la cache');
  row(11, 'TC10', 'Un codigo IATA devuelve el aeropuerto con airport=true, iataCode e icono diferenciado');
  row(12, 'TC14', 'Tras seleccionar, la siguiente busqueda usa un sessionToken nuevo');
  row(13, 'TC15', 'Un termino sin resultados muestra un estado vacio controlado');
  row(14, 'TC6', 'Un termino identico al ya consultado no dispara una nueva llamada');
  row(15, 'TC11', 'Una prediccion de aeropuerto con placeId nulo se resuelve sin romper el flujo');
  row(16, 'TC12', 'La busqueda por codigo IATA no aplica sesgo por ubicacion');
  row(17, 'TC17', 'El flujo de busqueda y edicion de direccion no presenta regresion');
  A();
  A('_Los 17 casos son nuevos: el corpus de TM no tenia cobertura de autocompletado en App Driver._');
  A();
  A('h3. Criterio de GO / NO-GO');
  A();
  A(`*GO* si pasan los siete casos marcados {{GO/NO-GO}}: ${k('TC1')} · ${k('TC2')} · ${k('TC7')} · ${k('TC8')} · `
    + `${k('TC5')} · ${k('TC13')} · ${k('TC16')}. Cualquiera de esos en rojo es *NO-GO*: la migracion no cumple su proposito.`);
  A();
  A(`${k('TC6')} y ${k('TC17')} en rojo se evaluan como regresion y los decide el coordinador. ${k('TC11')} y `
    + `${k('TC12')} son informativos: alimentan la decision sobre el contrato, no bloquean la release.`);
  A();
  A('Dos matices que conviene fijar antes de ejecutar:');
  A();
  A(`* ${k('TC1')} y ${k('TC16')} juntos son el verdadero gate de la epica. Que el endpoint propio responda no sirve de `
    + 'nada si ante un fallo la app vuelve a Google en silencio: el costo se mantiene y nadie lo ve.');
  A(`* ${k('TC13')} es gate aunque el ticket lo trate como un escenario mas. Sin {{sessionToken}} compartido, Google `
    + 'factura cada pulsacion como sesion independiente y el ahorro que justifica MG-112 no ocurre.');
  A();
  A('h3. Verificaciones adicionales durante el smoke (no son casos aparte)');
  A();
  A('* *Contador de llamadas de una busqueda tipica*: registrar cuantos requests salen al tipear una direccion completa '
    + 'de punta a punta. Es el numero que hay que comparar contra el baseline previo a la migracion para poder afirmar el ahorro.');
  A('* *Nombre serializado del booleano*: confirmar en el JSON crudo si el campo llega como {{airport}} o {{isAirport}}. '
    + 'Si el cliente lee el nombre equivocado, el icono de aeropuerto no aparece y el sintoma parece cosmetico.');
  A('* *{{source}} de cada prediccion*: anotar la proporcion {{AIRPORT}} / {{CACHE}} / {{GOOGLE}} en busquedas reales. '
    + 'Si casi todo llega con {{source=GOOGLE}}, la cache no esta aportando y el ahorro es teorico.');
  A('* *Loader global*: observar si la pantalla parpadea en cada consulta (falta de {{skipLoader}}).');
  A('* *Latencia percibida*: comparar contra el flujo actual con Google directo. MG-118 fija un objetivo orientativo de '
    + '~150 ms server-side en hits de cache.');
  A();
  A('h3. Datos y entorno');
  A();
  A('App Driver *v2.6.15* ({{Magiis-Driver_test_2.6.15.apk}}) sobre Android fisico — registrar modelo y version de '
    + 'Android · entorno *test* · backend magiis-be *v1.72.8* o superior · conductor con un viaje en edicion y origen '
    + 'definido en CABA.');
  A();
  A('||Termino||Para que sirve||');
  A('|{{e}} / {{ez}}|Por debajo del minimo: no debe salir ninguna consulta|');
  A('|{{eze}}|Exactamente 3 — codigo IATA de Ezeiza. El caso que hoy falla|');
  A('|{{ezei}}|4 caracteres — aeropuerto por nombre|');
  A('|{{aep}}|Codigo IATA de Aeroparque — icono y {{iataCode}}|');
  A('|{{corrientes}} / {{av corrientes}} / {{corr}}|Direcciones de calle — cache y sesgo por cercania|');
  A('|{{san martin 500}}|Direccion con altura — mapeo de {{mainText}} / {{secondaryText}}|');
  A('|{{zzzqqqxxx}}|Sin coincidencias — estado vacio|');
  A();
  A('h3. Instrumentacion');
  A();
  A('*{{chrome://inspect}} + panel Network del DevTools remoto* sobre el WebView de la app. Sin proxy, sin certificado '
    + 'y sin instalar nada en el dispositivo: la app es Ionic/Cordova y todo el trafico de autocompletado sale del WebView. '
    + 'Filtros a dejar preparados: {{autocomplete}} (endpoint propio) y {{maps.googleapis.com}} (retiro de Google). '
    + 'Para la degradacion, {{Block request URL}} sobre el endpoint y el modo offline.');
  A();
  A('h3. Evidencia a capturar');
  A();
  A('* Captura del panel Network con el filtro {{maps.googleapis.com}} en cero durante una busqueda completa.');
  A('* Captura de la query string de un request de autocomplete, mostrando {{address}}, {{latitude}}, {{longitude}} y '
    + '{{sessionToken}}, y la ausencia de {{radius}}.');
  A('* Captura de la lista de requests con sus tiempos, para el debounce.');
  A('* Captura del JSON crudo de una prediccion de aeropuerto (nombre real del booleano y {{placeId}}).');
  A('* Captura de los tres requests de una sesion mostrando el mismo {{sessionToken}}, y del siguiente con uno distinto.');
  A('* Video del camino de degradacion completo con el endpoint bloqueado.');
  A('* Captura de la pantalla con 2 caracteres escritos y cero requests.');
  A();
  A(`_Plan: ${ATP()} · Historia: ${STORY}._`);

  return L.join('\n');
}

// ---------------------------------------------------------------- phases

async function phaseTests() {
  console.log('\n== fase tests ==');

  if (!state.tests.PRE) {
    console.log(`  precondition: ${PRECONDITION.summary.slice(0, 70)}...`);
    if (APPLY) {
      const r = await graphql(MUTATIONS.createPrecondition, {
        preconditionType: { name: 'Manual' },
        definition: PRECONDITION.definition,
        jira: { fields: { summary: PRECONDITION.summary, project: { key: PROJECT } } },
      });
      const p = r.createPrecondition.precondition;
      state.tests.PRE = { id: p.issueId, key: p.jira.key };
      saveState(state);
      await setParent(p.jira.key, EPIC_ARTIFACTS);
      await setAssignee(p.jira.key).catch(e => console.log(`    (assignee: ${e.message.slice(0, 80)})`));
      console.log(`    -> ${p.jira.key} (${p.issueId})`);
    }
  }
  else { console.log(`  precondition ya existe: ${state.tests.PRE.key}`); }

  for (const t of TESTS) {
    if (state.tests[t.id]) {
      console.log(`  ${t.id} ya existe: ${state.tests[t.id].key}`);
      continue;
    }
    console.log(`  ${t.id}: ${t.summary.slice(0, 78)}...`);
    if (!APPLY) { continue; }

    const r = await graphql(MUTATIONS.createTest, {
      testType: { name: 'Manual' },
      jira: { fields: { summary: t.summary, project: { key: PROJECT } } },
    });
    const test = r.createTest.test;
    state.tests[t.id] = { id: test.issueId, key: test.jira.key };
    saveState(state);

    for (const [action, data, result] of t.steps) {
      await graphql(MUTATIONS.addTestStep, {
        issueId: test.issueId,
        step: { action, data, result },
      });
    }

    await setDescription(test.jira.key, testBody(t));
    await setParent(test.jira.key, EPIC_REPO);
    await setAssignee(test.jira.key).catch(() => {});
    console.log(`    -> ${test.jira.key} (${test.issueId}) · ${t.steps.length} pasos`);
  }
}

function testBody(t) {
  const L = [];
  const A = (s = '') => L.push(s);
  A(`*Historia:* ${STORY} — App Driver, migrar autocomplete al endpoint propio`);
  A(`*Cubre:* ${t.covers}`);
  A(`*Gate en el smoke:* ${t.gate}`);
  A(`*Precondicion:* ${k('PRE')}`);
  A();
  A('h3. Por que existe este caso');
  A();
  A(t.intent);
  A();
  A('h3. Entorno');
  A();
  A('App Driver v2.6.15 sobre Android fisico · entorno {{test}} · backend magiis-be v1.72.8 o superior · '
    + 'chrome://inspect con el panel Network abierto sobre el WebView de la app.');
  A();
  A('_Los pasos ejecutables estan en la seccion Manual Test Steps de este Test._');
  return L.join('\n');
}

async function phasePlan() {
  console.log('\n== fase plan (ATP) ==');
  if (state.atp) { return console.log(`  ya existe: ${state.atp.key}`); }
  if (!APPLY) { return console.log('  (dry run) crearia el Test Plan en TM'); }
  const r = await graphql(MUTATIONS.createTestPlan, {
    jira: {
      fields: {
        summary: `ATP · ${STORY} — Autocomplete via endpoint propio (App Driver v2.6.15)`,
        project: { key: PROJECT },
      },
    },
  });
  const p = r.createTestPlan.testPlan;
  state.atp = { id: p.issueId, key: p.jira.key };
  saveState(state);
  await setParent(p.jira.key, EPIC_PLAN);
  await setAssignee(p.jira.key).catch(() => {});
  console.log(`  -> ${p.jira.key} (${p.issueId})`);
}

async function phaseExec() {
  console.log('\n== fase exec (ATR) ==');
  if (state.atr) { return console.log(`  ya existe: ${state.atr.key}`); }
  if (!APPLY) { return console.log('  (dry run) crearia el Test Execution en TM'); }
  const r = await graphql(MUTATIONS.createTestExecution, {
    jira: {
      fields: {
        summary: `ATR · ${STORY} — Smoke de validacion del endpoint propio (App Driver v2.6.15, Android)`,
        project: { key: PROJECT },
      },
    },
    testEnvironments: [ENVIRONMENT],
  });
  const e = r.createTestExecution.testExecution;
  state.atr = { id: e.issueId, key: e.jira.key };
  saveState(state);
  await setParent(e.jira.key, EPIC_ARTIFACTS);
  await setAssignee(e.jira.key).catch(() => {});
  console.log(`  -> ${e.jira.key} (${e.issueId}) · env ${ENVIRONMENT}`);
}

async function phaseMembership() {
  console.log('\n== fase membership ==');
  const ids = TESTS.map(t => state.tests[t.id]?.id).filter(Boolean);
  console.log(`  ${ids.length} tests · plan ${ATP()} · exec ${ATR()}`);
  if (!APPLY) { return; }

  const p = await graphql(MUTATIONS.addTestsToTestPlan, { issueId: state.atp.id, testIssueIds: ids });
  console.log(`  plan  += ${p.addTestsToTestPlan.addedTests?.length ?? 0}${p.addTestsToTestPlan.warning ? ` · ${p.addTestsToTestPlan.warning}` : ''}`);

  const e = await graphql(MUTATIONS.addTestsToTestExecution, { issueId: state.atr.id, testIssueIds: ids });
  console.log(`  exec  += ${e.addTestsToTestExecution.addedTests?.length ?? 0}${e.addTestsToTestExecution.warning ? ` · ${e.addTestsToTestExecution.warning}` : ''}`);

  if (state.tests.PRE) {
    let n = 0;
    for (const id of ids) {
      await graphql(MUTATIONS.addPreconditionsToTest, { issueId: id, preconditionIssueIds: [state.tests.PRE.id] });
      n++;
    }
    console.log(`  precondicion asociada a ${n} tests`);
  }
}

async function phaseLinks() {
  console.log('\n== fase links ==');
  const want = [
    [LINK_TEST, STORY, ATP()],
    [LINK_TEST, STORY, ATR()],
    [LINK_RELATES, ATP(), ATR()],
  ];
  for (const [type, a, b] of want) {
    console.log(`  ${a} --${type}--> ${b}`);
    if (APPLY) { await link(type, a, b).catch(e => console.log(`    ! ${e.message.slice(0, 160)}`)); }
  }
}

async function phaseBodies() {
  console.log('\n== fase bodies ==');
  const atp = atpBody();
  const atr = atrBody();
  writeFileSync(resolve(STATE_DIR, 'mg117-atp-body.txt'), atp, 'utf8');
  writeFileSync(resolve(STATE_DIR, 'mg117-atr-body.txt'), atr, 'utf8');
  console.log(`  ATP ${ATP()} · ${atp.length} chars`);
  console.log(`  ATR ${ATR()} · ${atr.length} chars`);
  if (!APPLY) { return console.log('  (dry run — cuerpos escritos a .context/magiis-process/)'); }
  await setDescription(state.atp.key, atp);
  await setDescription(state.atr.key, atr);
  console.log('  descripciones publicadas');
}

const PHASES = {
  tests: phaseTests,
  plan: phasePlan,
  exec: phaseExec,
  membership: phaseMembership,
  links: phaseLinks,
  bodies: phaseBodies,
};

const order = PHASE === 'all' ? Object.keys(PHASES) : [PHASE];
for (const p of order) {
  if (!PHASES[p]) {
    console.error(`fase desconocida: ${p} (validas: ${Object.keys(PHASES).join(' | ')} | all)`);
    process.exit(1);
  }
  await PHASES[p]();
}

saveState(state);
console.log(`\n${APPLY ? 'aplicado' : 'dry run'} · estado en ${STATE_FILE.replace(ROOT, '.')}`);
if (state.atp) { console.log(`  ATP ${JIRA}/browse/${state.atp.key}`); }
if (state.atr) { console.log(`  ATR ${JIRA}/browse/${state.atr.key}`); }
