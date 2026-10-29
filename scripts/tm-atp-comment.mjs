/**
 * Regenerates the ROI / criticality / roadmap comment on the Alta de Viaje ATP (TM-36).
 *
 * Rewritten after the Xray environment moved MG -> TM: the previous body listed 154
 * MG-xxx keys that now only redirect, and predated the 15 Destino Abierto cases.
 *
 * Sources (all produced earlier in this campaign, none re-derived here):
 *   .context/magiis-process/mg19-roi.json           154 cases, scored
 *   .context/magiis-process/mg19-roi-nuevos15.json   15 Destino Abierto cases, same formula
 *   .context/magiis-process/mg19-tc-keys-TM.json    tcid -> TM key, 169 entries
 *
 * Usage:
 *   bun scripts/tm-atp-comment.mjs --dry-run
 *   bun scripts/tm-atp-comment.mjs --apply
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphql, QUERIES } from '../cli/xray/lib/graphql.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = f => resolve(ROOT, '.context/magiis-process', f);
const APPLY = process.argv.includes('--apply');

const ATP = 'TM-36'; const ATR = 'TM-18'; const ATR_AUTO = 'TM-617'; const MTP = 'TM-34'; const STORY = 'MG-19';
const COMMENT_ID = '35216';

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
  if (!r.ok) { throw new Error(`Jira ${p} -> ${r.status} ${(await r.text()).slice(0, 250)}`); }
  return r.status === 204 ? null : r.json();
};

const KEYS = JSON.parse(readFileSync(P('mg19-tc-keys-TM.json'), 'utf8'));
const OLD = JSON.parse(readFileSync(P('mg19-roi.json'), 'utf8'));
const NEW = JSON.parse(readFileSync(P('mg19-roi-nuevos15.json'), 'utf8'));

// summaries for the new 15 come from TM itself — never re-typed by hand
const sums = {};
for (let s = 0; s < 200; s += 100) {
  const r = await graphql(QUERIES.getTestsFullDataNoCoverage, { jql: 'project = TM AND labels = "destino-abierto"', limit: 100, start: s });
  const res = r?.getTests?.results ?? [];
  for (const t of res) {
    const l = (t.jira?.labels ?? []).find(x => x.startsWith('tcid:'));
    if (l) { sums[l.slice(5)] = t.jira.summary; }
  }
  if (res.length < 100) { break; }
}

const rows = [
  ...OLD.map(r => ({ ...r, nuevo: false })),
  ...NEW.map(r => ({
    tcid: r.tcid,
    component: 'Destino Abierto',
    type: r.tipo,
    severity: r.severity,
    smoke: r.smoke,
    roi: r.roi,
    veredicto: r.veredicto,
    criticidad: r.criticidad,
    esfuerzo: r.esfuerzo,
    dependencias: r.dependencias,
    summary: sums[r.tcid] ?? r.tcid,
    nuevo: true,
    ola: null,
    spec: null,
  })),
];
rows.sort((a, b) => Number(a.tcid.slice(-3)) - Number(b.tcid.slice(-3)));

// --- the automation scope, mirrored from scripts/tm-automation-atr.mjs -----
const SPECS = [
  { ola: 1, spec: 'nuevo-viaje.alta-e2e.spec.ts', tcs: ['TC068', 'TC080', 'TC074', 'TC083', 'TC089', 'TC092', 'TC116', 'TC146', 'TC157'], que: 'El alta de punta a punta. Habilita todo lo demás.' },
  { ola: 1, spec: 'nuevo-viaje.cupo.spec.ts', tcs: ['TC001', 'TC011', 'TC050'], que: 'Consumo del cupo → bloqueo con USAGE_LIMIT_EXCEEDED → liberación al cancelar.' },
  { ola: 2, spec: 'nuevo-viaje.destino-abierto.spec.ts', tcs: ['TC164', 'TC167', 'TC168', 'TC161', 'TC165', 'TC170', 'TC171'], que: 'Los dos casos de mayor ROI de toda la campaña están acá.' },
  { ola: 2, spec: 'asignacion-manual.candidatos.spec.ts', tcs: ['TC035', 'TC036', 'TC037', 'TC043', 'TC045', 'TC046', 'TC018', 'TC022', 'TC026', 'TC027', 'TC158', 'TC159', 'TC160'], que: 'Despacho, asignación manual y candidatos. Rescata los 5 críticos que el ROI aislado descartaba.' },
  { ola: 3, spec: 'nuevo-viaje.clonacion.spec.ts', tcs: ['TC003', 'TC004', 'TC005', 'TC010', 'TC013'], que: 'Clonación de finalizados y cancelados vía ?travelId=.' },
  { ola: 3, spec: 'nuevo-viaje.configuracion.spec.ts', tcs: ['TC059', 'TC061', 'TC063', 'TC031'], que: 'Restricciones que la configuración impone sobre el formulario.' },
];
const inScope = new Map();
for (const s of SPECS) { for (const tc of s.tcs) { inScope.set(`TS-ALTAVIAJE-${tc}`, s); } }
for (const r of rows) { const s = inScope.get(r.tcid); r.ola = s?.ola ?? null; r.spec = s?.spec ?? null; }

const n = rows.length;
const cnt = p => rows.filter(p).length;
const ver = { Candidate: cnt(r => r.veredicto === 'Candidate'), Manual: cnt(r => r.veredicto === 'Manual'), Deferred: cnt(r => r.veredicto === 'Deferred') };
const cri = ['Crítica', 'Alta', 'Media', 'Baja'].map(c => [c, cnt(r => r.criticidad === c)]);
const rois = rows.map(r => r.roi).sort((a, b) => a - b);
const key = t => KEYS[t] ?? '—';

const W = []; const A = (s = '') => W.push(s);
A('h2. 📊 QA · ROI, criticidad y hoja de ruta — ATP TM-36 (Carrier v2 · Alta de Viaje)');
A('');
A('*Corte:* 2026-08-10 · Estilo Allure · Etapa 4 del pipeline QA');
A(`*Alcance:* los *${n} Test Cases* de la pantalla Nuevo Viaje migrada a v2 (release v2.0.9)`);
A(`*Veredicto:* 🟡 ${ver.Candidate} candidatos a automatización, de los cuales *41 quedan priorizados en 3 olas y 6 specs* → ${ATR_AUTO}`);
A('');
A('{panel:title=Actualización — el entorno Xray se mudó de MG a TM}');
A('La campaña completa se movió de proyecto: el ATP, el ATR y los 154 tests conservan su contenido y su '
  + 'trazabilidad, pero cambiaron de numeración. Este informe ya está reescrito con las *keys TM* reales. '
  + `Se sumaron además *15 casos nuevos de Destino Abierto*, con lo que la campaña pasó de 154 a ${n} casos.`);
A('{panel}');
A('');
A('----');
A('');
A('h3. 🧮 Método');
A('');
A('{{ROI = (Frecuencia × Impacto × Estabilidad) / (Esfuerzo × Dependencias)}}');
A('');
A('*Esfuerzo* y *Dependencias* son divisores: un flujo crítico con setup caro puede tener ROI bajo, '
  + 'y eso es correcto — la fórmula mide retorno de automatizar, no importancia.');
A('');
A('||Eje||Cómo se puntuó||');
A('|Frecuencia|smoke = 5 · severidad Crítica = 4 · resto = 3|');
A('|Impacto|Crítica = 5 · Mayor = 3 · Menor = 2|');
A('|Estabilidad|contrato de API = 3 · i18n/regionalización = 1 · *resto de la UI = 2*|');
A('|Esfuerzo *(divisor)*|base 3 · +1 si tiene 4 pasos o más · +1 si exige preparar cupo, lista negra, contractor, geocerca o clonación|');
A('|Dependencias *(divisor)*|base 2 · +1 por cada familia externa que toca|');
A('');
A('Dos decisiones de calibración que conviene discutir, porque mueven todo el resultado:');
A('');
A('* *Estabilidad base 2, no 3.* La pantalla acaba de migrarse y se espera rotación de selectores.');
A('* *Dependencias base 2, no 1.* Cero dependencias no existe acá: todo caso exige carrier, sesión, cliente y tipo de servicio.');
A('');
A('Un caso neutro (todo en 3) da exactamente *ROI = 3,0*, que es el umbral. La mediana de la campaña es '
  + `*${rois[Math.floor(n / 2)].toFixed(2)}*, así que la escala está centrada.`);
A('');
A('h3. 📈 Resultado — los tres destinos');
A('');
A('||Veredicto||TCs||%||Qué significa||');
A(`|✅ Candidate|*${ver.Candidate}*|${Math.round(100 * ver.Candidate / n)}%|Apto para automatizar|`);
A(`|🖐️ Manual|*${ver.Manual}*|${Math.round(100 * ver.Manual / n)}%|Regresión manual|`);
A(`|⏸️ Deferred|*${ver.Deferred}*|${Math.round(100 * ver.Deferred / n)}%|Fuera del repositorio de regresión|`);
A('');
A(`_Rango de ROI: ${rois[0].toFixed(2)} – ${rois[n - 1].toFixed(2)}._`);
A('');
A('h3. 🎯 Criticidad de negocio — eje independiente del ROI');
A('');
A('Criticidad mide *qué se rompe si falla en producción*; ROI mide *cuánto conviene automatizarlo*. No son lo mismo.');
A('');
A('||Criticidad||TCs||Candidate||Manual||Deferred||');
for (const [c, t] of cri) { if (t) { A(`|${c}|${t}|${cnt(r => r.criticidad === c && r.veredicto === 'Candidate')}|${cnt(r => r.criticidad === c && r.veredicto === 'Manual')}|${cnt(r => r.criticidad === c && r.veredicto === 'Deferred')}|`); } }
A('');
A('h3. 🌟 Novedad — Destino Abierto (15 casos nuevos)');
A('');
A('Se diseñaron leyendo el código, no ejecutándolos. Dos hallazgos que corrigen supuestos del suite anterior:');
A('');
A('* *No existe* un permiso configurable «el tipo de servicio permite destino abierto». El gate real es '
  + '{{canUseOpenDestination = !isDelivery && !isOneShotSelected}} — que el tipo de servicio no sea de mensajería.');
A('* El *viaje de calle* es otra entidad ({{startStreetTravel}}, estado inicial distinto, pasajero por '
  + 'defecto, CASH forzado). Solo comparte el flag {{openTrip}}: cubrir uno *no* cubre al otro.');
A('');
const nuevosCand = rows.filter(r => r.nuevo && r.veredicto === 'Candidate').sort((a, b) => b.roi - a.roi);
A(`*${nuevosCand.length} de los 15 entraron como candidatos*, y los dos primeros son ahora *el ROI más alto de toda la campaña*:`);
A('');
A('||Test||ROI||Criticidad||Qué valida||');
for (const r of nuevosCand.slice(0, 4)) { A(`|${key(r.tcid)}|*${r.roi.toFixed(2)}*|${r.criticidad}|${String(r.summary).replace(/^MG-19 \| TC\d+: /, '')}|`); }
A('');
A('_Cinco casos quedaron en exactamente 3,00 — el punto neutro — y cayeron a Deferred por el umbral estricto. '
  + 'Están al borde, no descartados con holgura._');
A('');
A('h3. 🌊 Hoja de ruta — 3 olas, 6 specs, 41 casos');
A('');
A(`El backlog de automatización vive en *${ATR_AUTO}*, con su membresía exacta y los prerrequisitos del framework.`);
A('');
A('*El orden NO es por ROI.* El ROI puntúa casos aislados y no ve que un spec E2E atraviesa varios '
  + 'componentes por corrida. Sin un spec que cree un viaje de punta a punta, ninguno de los demás corre.');
A('');
A('||Ola||Spec||Casos||Qué cubre||');
for (const s of SPECS) { A(`|${s.ola}|{{${s.spec}}}|${s.tcs.length}|${s.que}|`); }
A('');
A('h3. 🚨 Los 5 casos críticos que el ROI descartaba, y cómo se resuelven');
A('');
A('Cinco casos de criticidad Crítica caen bajo el umbral aislados: caros de automatizar y con muchas '
  + 'dependencias. Quedarían *sin cubrir por ningún lado*.');
A('');
A('{panel:title=Se resuelven por costo marginal}');
A('Automatizada la pantalla de candidatos, agregar las aserciones de chofer bloqueado —ícono de prohibido, '
  + 'botón de asignar en rojo, pop-up de confirmación— cuesta casi nada: mismo setup, misma navegación. '
  + 'Los cinco entran en {{asignacion-manual.candidatos.spec.ts}} de la Ola 2.');
A('{panel}');
A('');
A('||Test||ROI||Esfuerzo||Dependencias||');
for (const r of rows.filter(x => x.criticidad === 'Crítica' && x.veredicto === 'Deferred')) { A(`|${key(r.tcid)}|${r.roi.toFixed(2)}|${r.esfuerzo}|${r.dependencias}|`); }
A('');
A('h3. ⚠️ Lo que este análisis NO dice');
A('');
A(`* *0 de ${n} TCs ejecutados formalmente.* Este informe prioriza diseño; no es evidencia de calidad del producto.`);
A('* *El ROI no es un ranking de importancia.* Un caso Deferred puede ser crítico: significa que no conviene automatizarlo.');
A('* *La estabilidad se puntuó a la baja a propósito.* Cuando la migración se asiente, varios Deferred van a subir.');
A('* *Los 15 de Destino Abierto nunca se ejecutaron.* El primer run puede revelar diferencias: eso es un hallazgo, no un fallo del spec.');
A('');
A('h3. ✅ Hallazgo cerrado — preselección del tipo de servicio');
A('');
A(`*${key('TS-ALTAVIAJE-TC157')}* — «preselecciona el tipo de servicio regular al seleccionar un cliente».`);
A('');
A('Se había registrado como deuda técnica ({{DT-MG19-001}}): regresión de paridad con V1, severidad Mayor. '
  + '*Verificado el 2026-08-10 en apps-test (carrier S&G Remis AR0103): el comportamiento correcto está presente.*');
A('');
A('||Verificación||Resultado||');
A('|Primera selección tras recarga limpia de la pantalla|Preselecciona *Regular*|');
A('|Cliente «Andreita, Ana» (el que originalmente falló)|Preselecciona *Regular*|');
A('|Cliente con teléfono registrado|Preselecciona *Regular*|');
A('|Cliente sin teléfono registrado|Preselecciona *Regular*|');
A('');
A('_Una observación previa de este mismo equipo había reportado el campo en «Sin especificar». No se pudo '
  + 'reproducir en ninguno de los cuatro intentos posteriores: se descarta como hallazgo vigente. '
  + 'El caso se mantiene en el suite como guarda de regresión, que es su valor real._');
A('');
A('h3. 🗂️ ATR de la Ronda 1 y sus test cases');
A('');
A(`*${ATR} — ATR · Alta de Viaje — Carrier v2 (Ronda 1)* · ambiente {{test}} · contiene los ${n} casos, todos en TODO.`);
A('');
A('||Test||TC||Componente||Criticidad||Veredicto||Ola||');
for (const r of rows) {
  const k = key(r.tcid); const tc = r.tcid.replace('TS-ALTAVIAJE-', '');
  A(`|${r.ola ? k : `{{${k}}}`}${r.smoke ? ' 🔥' : ''}|${tc}|${r.component}|${r.criticidad}|${r.veredicto}|${r.ola ?? '—'}|`);
}
A('');
A(`_🔥 marca los ${cnt(r => r.smoke)} casos del smoke. Los 41 priorizados van como enlace vivo; el resto en `
  + 'monoespaciado, porque Jira limita la cantidad de macros de issue por comentario._');
A('');
A('----');
A('');
A('h3. Trazabilidad');
A('');
A(`* *ATP:* ${ATP} → épica ${MTP} (QA Master Test Plan) → *${n}* Tests`);
A(`* *ATR Ronda 1 (manual):* ${ATR} · *ATR Automatización:* ${ATR_AUTO} (41 casos, 6 specs)`);
A(`* *Historia:* ${STORY} — Carrier v2 · Migrar pantalla Nuevo Viaje`);
A('* *Repositorio Xray:* {{/Carrier/v2-front/AltaViaje}}');
A('* *Cobertura:* 28 componentes de pantalla × 3 niveles + flujo, configuración y Destino Abierto');
A('');
A('_Los medios de pago no tienen segmento propio: ese dominio ya está cubierto por la campaña de pasarelas '
  + '({{ATP · TRIP}}, {{WAL}}, {{CHG}}, {{COB}}). Duplicarlo acá sería cobertura redundante._');
A('');
A('— QA · MAGIIS. Próxima actualización al cerrar la Ronda 1 del smoke.');

const body = W.join('\n');
writeFileSync(P('mg19-roi-comment.txt'), body, 'utf8');
console.log(`\ncasos: ${n} · candidatos: ${ver.Candidate} · en olas: ${cnt(r => r.ola)} · cuerpo: ${body.length} chars`);
if (body.length > 32000) { console.log('⚠ excede el límite de comentario de Jira'); process.exit(1); }
if (!APPLY) { console.log('(dry run — no se publicó)'); process.exit(0); }

await jira(`/rest/api/2/issue/${ATP}/comment/${COMMENT_ID}`, { method: 'PUT', body: JSON.stringify({ body }) });
const v = await jira(`/rest/api/3/issue/${ATP}/comment/${COMMENT_ID}?expand=renderedBody`);
const rb = v.renderedBody;
console.log(`✔ comentario ${COMMENT_ID} actualizado`);
console.log(`  tablas: ${(rb.match(/confluenceTable/g) || []).length} · errores: ${(rb.match(/class="error"/g) || []).length} · paneles: ${(rb.match(/panel/g) || []).length ? 'si' : 'no'}`);
console.log(`  ${JIRA}/browse/${ATP}?focusedCommentId=${COMMENT_ID}\n`);
