/**
 * Completes the documentation of the automation-scope tests so they can actually be
 * coded against: adds the Gherkin scenario, and back-fills "Caso de uso" / "Historia
 * de usuario" on the cases whose generator omitted them.
 *
 * The Gherkin is DERIVED from what each test already says — preconditions become the
 * Given, the action steps become the When, the expected results become the Then. It is
 * a faithful transcription, never invention: a made-up scenario would hand the
 * developer a specification nobody validated.
 *
 * Tests stay `Manual` on purpose. This framework does not execute Gherkin (the specs
 * are TypeScript with @atc('TM-xxx') and results map by that id), so converting to
 * Cucumber would cost the manual steps — which the Ronda 1 execution still needs —
 * without buying any execution.
 *
 * Idempotent: a section that already exists is never duplicated nor overwritten.
 *
 * Usage:
 *   bun scripts/tm-enrich-docs.mjs --exec TM-617 --dry-run
 *   bun scripts/tm-enrich-docs.mjs --exec TM-617 --apply
 */

import { fetchAllAttachedTestIds, graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APPLY = args.includes('--apply');
const EXEC = flag('exec', 'TM-617');
const CAMPAIGN = 'atp-mg-altaviaje';

const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH = `Basic ${Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString('base64')}`;
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
  if (!r.ok) { throw new Error(`Jira ${init.method || 'GET'} ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`); }
  return r.status === 204 ? null : r.json();
};

const HISTORIA = 'Como operador de carrier quiero dar de alta un viaje —incluido el alta por clonación de '
  + 'viajes finalizados y cancelados— y asignarle un chofer, para que la configuración vigente del carrier '
  + 'y del tipo de servicio se respete en todo el flujo.';

/** Los casos que mis generadores crearon sin «Caso de uso». */
const CASO_DE_USO = {
  TC161: 'Destino Abierto · habilitación del switch',
  TC162: 'Destino Abierto · habilitación del switch',
  TC164: 'Destino Abierto · activación del modo',
  TC165: 'Destino Abierto · limpieza del formulario',
  TC167: 'Destino Abierto · puerta de cotización',
  TC168: 'Destino Abierto · puerta de cotización',
  TC170: 'Destino Abierto · cotización con distancia cero',
  TC171: 'Destino Abierto · compatibilidad con el tipo de servicio',
  TC176: 'Medios de pago · clonación',
  TC177: 'Medios de pago · preselección',
  TC178: 'Medios de pago · preselección',
};

/** Casos gobernados por la matriz pairwise → llevan Scenario Outline, no Scenario. */
const PAIRWISE = new Set(['TC061', 'TC118']);

// Verbos que describen observación, no acción: alimentan el Then, no el When.
const OBSERVA = /^(?:observar|verificar|revisar|comparar|confirmar|buscar la acción|buscar la accion)/i;

const tcOf = labels => (labels || []).find(l => l.startsWith('tcid:'))?.replace('tcid:TS-ALTAVIAJE-', '') ?? null;

const seccion = (desc, titulo) => {
  const m = desc.match(new RegExp(`^h3\\. ${titulo}\\s*\\n([\\s\\S]*?)(?=\\n\\s*h3\\.|\\n----|$)`, 'm'));
  return m ? m[1].trim() : '';
};

/** Given ← precondiciones · When ← acciones · Then ← resultados esperados. */
function gherkin(test, tc) {
  const desc = test.__desc;
  const pre = seccion(desc, 'Precondiciones');
  const steps = test.steps || [];

  const givens = pre.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
  const whens = [];
  const thens = [];

  for (const s of steps) {
    const a = (s.action || '').trim();
    const d = (s.data || '').trim();
    const r = (s.result || '').trim();
    if (a && !OBSERVA.test(a)) {
      whens.push(a.replace(/\.$/, ''));
      if (d) { whens.push(`con los datos: ${d.replace(/\.$/, '')}`); }
    }
    // Se conserva el "Debería" del resultado esperado: quitarlo deja un infinitivo
    // suelto ("Then mostrarse la alerta") que se lee peor y se aleja del texto del caso.
    for (const line of r.split('\n').map(x => x.trim()).filter(Boolean)) {
      thens.push(line.replace(/\.$/, ''));
    }
  }
  if (!whens.length && steps.length) { whens.push((steps[0].action || '').trim().replace(/\.$/, '')); }

  const L = [];
  const outline = PAIRWISE.has(tc);
  L.push(`Feature: ${test.jira.summary.replace(/^MG-19 \| TC\d+: /, '')}`);
  L.push('');
  L.push(`  ${outline ? 'Scenario Outline' : 'Scenario'}: ${test.jira.key}`);
  givens.forEach((g, i) => L.push(`    ${i === 0 ? 'Given' : 'And'} ${g.replace(/\.$/, '')}`));
  if (!givens.length) { L.push('    Given la pantalla de Nuevo Viaje abierta con el carrier preparado'); }
  whens.forEach((w, i) => L.push(`    ${i === 0 ? 'When' : 'And'} ${w}`));
  thens.forEach((t, i) => L.push(`    ${i === 0 ? 'Then' : 'And'} ${t}`));
  if (outline) {
    L.push('');
    L.push('    Examples: matriz pairwise');
    L.push('      | metodo | pagador | gateway | cta | tarjetas | entrada |');
    L.push('      # 31 filas — generar con: bun scripts/tm-payment-matrix.mjs --wiki');
  }
  return L.join('\n');
}

function enriquecer(test, tc) {
  let d = test.__desc;
  const cambios = [];

  // «Caso de uso» — al tope, como en los casos migrados
  if (!/\*Caso de uso:\*/i.test(d) && CASO_DE_USO[tc]) {
    d = `*Caso de uso:* ${CASO_DE_USO[tc]}\n${d}`;
    cambios.push('caso-de-uso');
  }

  // Gherkin — antes de Trazabilidad, que es la última sección estructurada
  if (!/^h3\. Gherkin/m.test(d)) {
    const bloque = `h3. Gherkin\n{code:gherkin}\n${gherkin(test, tc)}\n{code}\n`;
    d = /^h3\. Trazabilidad/m.test(d)
      ? d.replace(/^h3\. Trazabilidad/m, `${bloque}\nh3. Trazabilidad`)
      : `${d.trimEnd()}\n\n${bloque}`;
    cambios.push('gherkin');
  }

  // «Historia de usuario» — al pie, como en los casos migrados
  if (!/Historia de usuario/i.test(d)) {
    d = `${d.trimEnd()}\n\n_Historia de usuario:_ ${HISTORIA}`;
    cambios.push('historia');
  }

  return { desc: d, cambios };
}

// --- cargar el alcance -------------------------------------------------------
const execId = (await jira(`/rest/api/3/issue/${EXEC}?fields=summary`)).id;
const ids = new Set(await fetchAllAttachedTestIds(QUERIES.getTestExecutionTestsPage, 'getTestExecution', execId));

const all = [];
for (let s = 0; s < 400; s += 100) {
  const r = await graphql(QUERIES.getTestsFullDataNoCoverage, { jql: `project = TM AND labels = "${CAMPAIGN}"`, limit: 100, start: s });
  const res = r?.getTests?.results ?? [];
  all.push(...res);
  if (res.length < 100) { break; }
}
const scope = all.filter(t => ids.has(t.issueId));

for (const t of scope) {
  t.__desc = (await jira(`/rest/api/2/issue/${t.jira.key}?fields=description`)).fields.description || '';
}

console.log(`\n=== Enriquecimiento documental · ${EXEC} ${APPLY ? '' : '(DRY RUN)'} ===`);
console.log(`tests en alcance: ${scope.length}\n`);

const resumen = { 'caso-de-uso': 0, 'gherkin': 0, 'historia': 0, 'sin-cambios': 0 };
let muestra = 0;

for (const t of scope) {
  const tc = tcOf(t.jira.labels);
  const { desc, cambios } = enriquecer(t, tc);
  if (!cambios.length) { resumen['sin-cambios']++; continue; }
  for (const c of cambios) { resumen[c]++; }

  if (!APPLY) {
    console.log(`  ${t.jira.key.padEnd(8)} ${String(tc).padEnd(6)} +${cambios.join(' +')}`);
    if (muestra < 2 && cambios.includes('gherkin')) {
      muestra++;
      console.log(`\n${gherkin(t, tc).split('\n').map(l => `      ${l}`).join('\n')}\n`);
    }
    continue;
  }
  await jira(`/rest/api/2/issue/${t.jira.key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: desc } }) });
  console.log(`✔ ${t.jira.key.padEnd(8)} ${String(tc).padEnd(6)} +${cambios.join(' +')}`);
}

console.log('\n--- resumen ---');
console.log(`  + caso de uso        : ${resumen['caso-de-uso']}`);
console.log(`  + gherkin            : ${resumen.gherkin}`);
console.log(`  + historia de usuario: ${resumen.historia}`);
console.log(`  sin cambios          : ${resumen['sin-cambios']}`);
console.log('');
