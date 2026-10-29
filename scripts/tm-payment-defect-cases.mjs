/**
 * Creates the three payment-method test cases derived from defects found by reading
 * the Carrier v2 code. None of them was observed failing in a live run — they come
 * from guards that are demonstrably missing, so the first execution may show one is
 * already fixed. That is a finding, not a broken case.
 *
 * Same proven pattern as the open-destination creator: adopt by `tcid:` label before
 * creating, never retry createTest (an ECONNRESET can land after the server committed),
 * add steps one call at a time (Xray drops inline steps).
 *
 * Usage:
 *   bun scripts/tm-payment-defect-cases.mjs --dry-run
 *   bun scripts/tm-payment-defect-cases.mjs --apply
 */

import { graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const PROJECT_KEY = 'TM';
const STORY = 'MG-19';
const FOLDER = '/Carrier/v2-front/AltaViaje';
const CAMPAIGN = 'atp-mg-altaviaje';
const LINK_TEST = '10334';

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

const L = (...t) => [CAMPAIGN, 'carrier', 'v2-front', 'alta-viaje', 'medios-de-pago', 'capa-ui', ...t];

const CASES = [
  {
    tcid: 'TS-ALTAVIAJE-TC176',
    summary: 'MG-19 | TC176: Validar que al clonar un viaje no queda seleccionado un medio de pago que dejó de estar habilitado',
    priority: 'Very High',
    labels: L('clonacion', 'negativo', 'pago'),
    pre: 'Viaje finalizado creado con un medio de pago que después se deshabilitó para ese carrier o ese colaborador '
      + '(por ejemplo, tarjeta habilitada al crear el viaje y hoy sin pasarela vinculada).',
    steps: [
      { a: 'Gestión de Viajes → Finalizados → Clonar el viaje modelo.', d: 'Viaje cuyo medio de pago ya no figura entre los habilitados.', r: '' },
      { a: 'Observar el selector de Forma de Pago.', d: '', r: 'Debería quedar el selector vacío o con un medio efectivamente habilitado, nunca con el medio dado de baja.' },
      { a: 'Intentar enviar el viaje.', d: '', r: 'Debería exigir elegir un medio de pago válido antes de permitir el envío.\n'
        + 'Debería no crearse el viaje con un medio de pago que el carrier ya no admite.' },
    ],
    ref: 'new-trip.component.ts:8815 — setValue(response.paymentMethod) sin verificar pertenencia a la lista; '
      + 'el control queda con un valor ausente del selector, el validador required pasa igual y el envío procede',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC177',
    summary: 'MG-19 | TC177: Validar que se respeta el medio de pago por defecto del carrier con un pasajero sin cuenta corriente',
    priority: 'High',
    labels: L('pago', 'parametros', 'borde'),
    pre: 'Carrier con un medio de pago por defecto configurado distinto del primero de la lista. '
      + 'Pasajero individuo SIN cuenta corriente.',
    steps: [
      { a: 'Configurar en el carrier un medio de pago por defecto que no sea el primero del selector.', d: 'Por ejemplo, por defecto tarjeta con efectivo primero en la lista.', r: '' },
      { a: 'Abrir Nuevo Viaje y seleccionar un pasajero sin cuenta corriente.', d: '', r: '' },
      { a: 'Observar el medio de pago preseleccionado.', d: '', r: 'Debería preseleccionarse el medio de pago configurado por defecto en el carrier.\n'
        + 'Debería no caer al primer medio de la lista solo por no tener cuenta corriente.' },
    ],
    ref: 'new-trip.component.ts:2993 — la rama del default del carrier está guardada por response.checkingAccount, '
      + 'así que un pasajero sin cuenta corriente cae al else final (paymentMethods[0])',
  },
  {
    tcid: 'TS-ALTAVIAJE-TC178',
    summary: 'MG-19 | TC178: Validar que el medio por defecto del tipo de servicio dispara el chequeo de límite de cuenta corriente',
    priority: 'Very High',
    labels: L('pago', 'cuenta-corriente', 'tipo-servicio', 'negativo'),
    pre: 'Tipo de servicio con medio de pago por defecto igual a cuenta corriente. '
      + 'Pasajero con cuenta corriente activa y saldo agotado, sin permiso de excederse.',
    steps: [
      { a: 'Abrir Nuevo Viaje y seleccionar el pasajero con el saldo agotado.', d: 'Saldo menor o igual a cero, sin permiso de excederse.', r: '' },
      { a: 'Elegir el tipo de servicio cuyo medio por defecto es cuenta corriente.', d: '', r: '' },
      { a: 'Observar la alerta de límite y el estado del botón de envío.', d: '', r: 'Debería mostrarse la alerta de límite excedido igual que al elegir cuenta corriente a mano.\n'
        + 'Debería quedar bloqueado el envío del viaje.\n'
        + 'Debería reiniciarse el bloque de propinas, como en cualquier otro cambio de medio de pago.' },
    ],
    ref: 'new-trip.component.ts:3278 — el default del tipo de servicio usa setValue() en vez de paymentMethodSelected(), '
      + 'de modo que no corren el probe de límite (ts:3121-3148) ni resetValuesTips()',
  },
];

const M_CREATE_TEST = `
  mutation CreateTest($jira: JSON!, $testType: UpdateTestTypeInput, $folderPath: String) {
    createTest(jira: $jira, testType: $testType, folderPath: $folderPath) {
      test { issueId jira(fields: ["key"]) } warnings } }`;
const M_ADD_STEP = `
  mutation AddTestStep($issueId: String!, $action: String, $data: String, $result: String) {
    addTestStep(issueId: $issueId, step: { action: $action, data: $data, result: $result }) { id } }`;

const description = c => [
  '*Origen:* defecto detectado por lectura de código, no por ejecución.',
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
  '* Ola 1 — medios de pago',
  '',
  '----',
  '_Este caso nace de una guarda ausente en el código, no de un fallo observado. La primera ejecución '
  + 'puede mostrar que ya está corregido: eso es un hallazgo, no un fallo del caso._',
].join('\n');

console.log(`\n=== Casos de defectos de medios de pago -> ${PROJECT_KEY} ${APPLY ? '' : '(DRY RUN)'} ===\n`);

const created = [];
for (const [i, c] of CASES.entries()) {
  const tag = `[${i + 1}/${CASES.length}] ${c.tcid.replace('TS-ALTAVIAJE-', '')}`;
  if (!APPLY) {
    console.log(`  ${tag} ${c.priority.padEnd(10)} ${c.steps.length} pasos`);
    console.log(`     ${c.summary.slice(0, 108)}`);
    console.log(`     ancla: ${c.ref.split('—')[0].trim()}\n`);
    continue;
  }

  const found = await jira(`/rest/api/3/search/jql?jql=${encodeURIComponent(
    `project = ${PROJECT_KEY} AND labels = "tcid:${c.tcid}"`,
  )}&fields=summary&maxResults=5`);
  if ((found.issues || []).length > 1) { throw new Error(`DUPLICADO: ${c.tcid}`); }

  let key, issueId;
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
    if (!key.startsWith(`${PROJECT_KEY}-`)) { throw new Error(`ABORTO: ${key} fuera de ${PROJECT_KEY}`); }
  }

  const live = await graphql(QUERIES.getTestsFullDataNoCoverage, { jql: `key = ${key}`, limit: 1, start: 0 });
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
  created.push({ tcid: c.tcid, key });
  console.log(`✔ ${tag} -> ${key} (${c.steps.length} pasos)`);
}

if (APPLY) {
  console.log(`\n${created.length} casos listos: ${created.map(c => c.key).join(' ')}`);
  console.log('membresía: bun scripts/tm-attach-membership.mjs --label medios-de-pago --plan TM-36 --exec TM-18\n');
}
