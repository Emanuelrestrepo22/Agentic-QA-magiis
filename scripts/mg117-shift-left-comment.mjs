/**
 * MG-117 — second shift-left pass, published as a Jira comment.
 *
 * MG governance: general work items are read-only for QA (no status / field / label
 * mutations). Findings ship as a structured comment; only Xray entities are created,
 * and those live in TM. This continues comment 34968 (first pass, 2026-08-06).
 *
 * Body is wiki markup posted through REST v2, which Jira Cloud converts to ADF
 * server-side — the same approach scripts/tm-atp-comment.mjs uses.
 *
 * Usage:
 *   bun scripts/mg117-shift-left-comment.mjs [--apply]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(ROOT, '.context/magiis-process/mg117-xray-state.json');
const OUT = resolve(ROOT, '.context/magiis-process/mg117-shift-left-comment.txt');
const APPLY = process.argv.includes('--apply');

const STORY = 'MG-117';
const s = JSON.parse(readFileSync(STATE, 'utf8'));
const ATP = s.atp.key;
const ATR = s.atr.key;
const T = id => s.tests[id].key;

const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH
  = `Basic ${
    Buffer.from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`).toString('base64')}`;
const jira = async (p, init = {}) => {
  const r = await fetch(`${JIRA}${p}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!r.ok) { throw new Error(`Jira ${p} -> ${r.status} ${(await r.text()).slice(0, 400)}`); }
  return r.status === 204 ? null : r.json();
};

const L = [];
const A = (x = '') => L.push(x);

A('h2. Revisión QA — 2ª pasada shift-left (2026-08-11)');
A();
A('Continúa la revisión del 2026-08-06. *Alcance:* ticket, sus comentarios, el repositorio '
  + '{{repo.magiis/magiis-mobile-driver-v2}} y el contrato real del endpoint verificado en las otras dos superficies '
  + 'que ya lo consumen. Sin ejecución en la app.');
A();
A('*Veredicto:* 🔴 *NO TESTEABLE* — el hallazgo bloqueante de la 1ª pasada sigue abierto sin cambios. '
  + `La cobertura quedó igualmente diseñada y materializada en Xray (${ATP} / ${ATR}), lista para ejecutar en cuanto se desbloquee.`);
A();
A('----');
A();
A('h3. 1. Re-verificación de los hallazgos de la 1ª pasada');
A();
A('||Hallazgo (2026-08-06)||Estado hoy||Evidencia||');
A('|La implementación no está en GitLab|🔴 *Sigue abierto*|Cero ramas de este ticket, cero merge requests (17 revisados), '
  + 'cero coincidencias de {{places/autocomplete}}, {{getMagiisAutocomplete}} y {{sessionToken}} en todo el repo|');
A('|{{develop}} sigue llamando a Google directo|🔴 *Sigue abierto*|{{google-places.service.ts:104}} — {{getPlacePredictions}} vivo. '
  + 'El archivo no se toca desde el commit {{c6f42dd8}}, del *2024-04-22*|');
A('|AC-STALE: el DTO serializa {{airport}}, no {{isAirport}}|🟠 Sin corregir|Confirmado en Carrier v2 y App PAX. '
  + 'Es un booleano de Lombok: {{isAirport()}} → Jackson lo publica como {{airport}}|');
A('|AC-STALE: el endpoint no recibe {{radius}} ni {{language}}|🟠 Sin corregir|Contrato real del request: '
  + '{{address}} (obligatorio), {{latitude?}}, {{longitude?}}, {{sessionToken?}}. El radio de 10 km lo aplica el backend|');
A('|AC-STALE: {{placeId}} puede venir nulo en aeropuertos|🟠 Sin corregir|App PAX lo tipa como nullable y lo documenta. '
  + 'La selección se resuelve por nombre en ese caso|');
A('|Trazabilidad: el ticket declara depender de {{MX-5851}}|🟠 Sin corregir|En MG el ticket de backend es MG-118, ya Finalizada (v1.72.8)|');
A('|Inconsistencia de {{minLength}} entre superficies|🟠 Sin corregir|Sin valor único acordado para la feature|');
A();
A('{panel:title=El APK 2.6.15 no es reproducible desde el repositorio}');
A('La rama {{release/v2.6.15}} sí existe ahora, pero su HEAD ({{0fe45dbf}}, 2026-08-08) es *exactamente el mismo commit '
  + 'que el HEAD de {{develop}}*: no tiene ni un commit propio. Los 8 commits de {{develop}} desde el 2026-08-01 son '
  + 'actualización del SDK de Android, MG-571 (permisos iOS) y "graphify" — ninguno de autocomplete.');
A();
A('Si el APK adjuntado el 2026-08-08 efectivamente muestra el flujo nuevo, se construyó desde código local no publicado. '
  + 'Eso es un bloqueante de *trazabilidad* además del funcional: testear contra ese binario produciría evidencia que '
  + 'nadie puede reproducir, y v2.6.15 se cortaría sin el commit.');
A('{panel}');
A();
A('h3. 2. Lo que esta pasada agrega — el alcance del ticket no describe el código real');
A();
A('El texto del ticket afirma que «hoy la app no tiene debounce, {{distinctUntilChanged}} ni minLength». '
  + 'Medido en {{develop}}, eso es falso en dos de los tres:');
A();
A('||Control||Lo que dice el ticket||Lo que hay en el código||Consecuencia||');
A('|Debounce|No existe; agregar ~300 ms|{{debounceTime(1500)}} en {{travel-edit-search.ts:41}}|No es «agregar», es *bajar de 1500 a 300*|');
A('|{{distinctUntilChanged}}|No existe; agregar|*Ya presente desde 2023*, mismo pipe|El escenario 2 está cumplido antes de empezar: no es entregable de esta historia|');
A('|minLength|No existe; agregar 3|{{MIN_STRING_SIZE = 3}} con guard {{>}} en {{travel-edit-search.ts:27,42}}|*El mínimo efectivo es 4*, no 3|');
A();
A('h4. 🐞 El defecto de operador — es el hallazgo más accionable de esta pasada');
A();
A('El guard actual es {{value.trim().length > this.MIN_STRING_SIZE}} con {{MIN_STRING_SIZE = 3}}. '
  + 'Como es {{>}} y no {{>=}}, hace falta escribir *4 caracteres* para que se dispare la búsqueda. '
  + 'El AC pide explícitamente 3 «para soportar IATA» — y los códigos IATA tienen exactamente 3 letras. '
  + 'Con el operador actual, *escribir {{EZE}} nunca consulta*, y la razón misma por la que se eligió 3 queda anulada.');
A();
A('Es el mismo defecto que App PAX ya corrigió (registrado en su momento como «QA Nuevo Viaje BUG-12» en Carrier). '
  + `Si la migración se implementa reutilizando el pipe actual, el defecto se arrastra a v2.6.15. Lo cubre ${T('TC8')}.`);
A();
A('h4. Otros hallazgos de esta pasada');
A();
A('* *{{geocode()}} ya está migrado.* {{google-places.service.ts:80}} llama a {{getMagiisGeoCode}} del proxy propio. '
  + 'La mitad del camino ya está hecha: falta solo la pata de autocomplete.');
A('* *El retiro de Google en Driver es más simple que en PAX.* Las 5 coincidencias de {{google.maps.places}} están '
  + 'todas dentro de {{google-places.service.ts}}; no hay usos residuales en otras pantallas. El escenario 7 se cierra '
  + 'tocando un solo archivo.');
A('* *Falta {{skipLoader}} para el endpoint.* App PAX lo incorporó al interceptor cuando migró. Sin eso, el loader '
  + `global se dispara en cada consulta y la pantalla parpadea al tipear. Lo cubre ${T('TC17')}.`);
A('* *Ojo con la referencia que se copie.* Carrier v2 tipa {{placeId}} como no-nullable, y eso es *incorrecto* '
  + 'respecto del backend. App PAX lo tipa bien. *La referencia a replicar es App PAX*, no Carrier.');
A();
A('h3. 3. Criterios de aceptación re-baselinados contra el contrato real');
A();
A('Tal como están escritos, tres de los siete escenarios llevan a implementar mal. Corrección propuesta:');
A();
A('||Esc.||Como está||Como debería quedar||');
A('|1|«se dispara una sola llamada, ~300 ms después de la última tecla»|Correcto. Agregar que *hoy son 1500 ms*: es una reducción, no un alta|');
A('|2|«{{distinctUntilChanged}}: no se consulta si el texto no cambió»|Correcto, pero *ya está implementado*. Reclasificar como criterio de no-regresión|');
A('|3|«minLength 3 (para soportar IATA)»|Correcto en intención. Explicitar {{>=}}: *el término de 3 caracteres SÍ consulta*. Con el operador actual no lo hace|');
A('|4|«mapea {{placeId}}, {{shortName}}, {{mainText}}, {{secondaryText}}, {{latitude}}/{{longitude}}; opcional {{isAirport}}/{{iataCode}}»|'
  + 'El campo se llama *{{airport}}*, no {{isAirport}}. Agregar {{source}} ({{AIRPORT}} / {{CACHE}} / {{GOOGLE}}) y declarar *{{placeId}} nullable*|');
A('|5|«se envían {{location}} (lat/lng) + {{radius}}»|*Se envían {{latitude}} y {{longitude}} sueltos, y nada más.* El endpoint no recibe '
  + '{{radius}} ni {{language}}. Aclarar que el sesgo sale del *origen del viaje*|');
A('|6|«mismo {{sessionToken}} (UUID) por sesión, se descarta tras la selección»|Correcto. Nombrar la segunda llamada como la de resolución '
  + 'del lugar ({{getPlace}} / {{getMagiisGeoCode}})|');
A('|7|«se retira la llamada directa a Google»|Correcto. Acotable: en Driver es un solo archivo|');
A();
A('*Criterios que faltan por completo* — el ticket no define el comportamiento ante fallo, y con cache-first estos '
  + 'caminos dejan de ser raros:');
A();
A(`* *Cero resultados* — qué se muestra cuando el endpoint responde 200 con arreglo vacío. Propuesto en ${T('TC15')}.`);
A('* *Error 5xx o timeout* — y en particular: *ante el fallo del endpoint propio NO se debe reintentar contra Google directo.* '
  + `Un fallback silencioso anularía el ahorro sin que nadie lo note. Propuesto en ${T('TC16')}.`);
A('* *Cuota agotada* — mismo tratamiento, sin criterio definido.');
A();
A('_Los resultados esperados de esos tres son criterios *propuestos por QA*, no acordados. Necesitan ratificación._');
A();
A('h3. 4. Preguntas abiertas — NEEDS PO/DEV CONFIRMATION');
A();
A('Las cuatro de la 1ª pasada siguen sin respuesta:');
A();
A('# ¿Dónde está el código? Si es local, ¿se publica la rama y se abre el MR antes de cortar v2.6.15? '
  + '*Y en concreto: ¿cuál es el SHA exacto desde el que se compiló el APK 2.6.15?*');
A('# ¿Se ratifica el contrato real ({{airport}}, sin {{radius}}, sin {{language}}, {{placeId}} nullable) y se '
  + 'corrigen los ACs de MG-114 / MG-116 / MG-117?');
A('# ¿{{minLength}} de la feature es 3 en las cuatro superficies? Y si es 3, ¿se corrige el operador a {{>=}}?');
A('# ¿Cuál es el comportamiento esperado ante cuota agotada, timeout o cero resultados?');
A();
A('Se agrega una quinta, nueva de esta pasada:');
A();
A('# El escenario 2 ya está cumplido y el escenario 1 es una reducción de un valor existente, no un alta. '
  + '¿Se ajusta la estimación de la historia en consecuencia?');
A();
A('h3. 5. Cobertura materializada en Xray');
A();
A('La cobertura de la 1ª pasada era un outline. Esta pasada la convierte en artefactos ejecutables:');
A();
A('||Artefacto||Key||Qué es||');
A(`|ATP|${ATP}|Plan de aceptación — 17 casos, matriz AC→TC, riesgos y baseline de código verificado|`);
A(`|ATR|${ATR}|Ejecución del smoke — 17 corridas en {{TO DO}}, ambiente {{test}}, con criterio de GO/NO-GO|`);
A(`|Precondición|${T('PRE')}|Entorno, dispositivo e instrumentación, compartida por los 17 casos|`);
A(`|Test Cases|${T('TC1')} … ${T('TC17')}|17 casos manuales con pasos, en el repositorio QA de TM|`);
A();
A('*Diseño de la cobertura.* Los 17 casos no salen de mapear un AC a un caso: se derivaron por técnica. '
  + 'Análisis de valores límite sobre la longitud mínima (2 / 3 / 4 caracteres) y sobre la ventana de debounce; '
  + 'particiones de equivalencia por {{source}} de la predicción ({{AIRPORT}} / {{CACHE}} / {{GOOGLE}}); '
  + 'transición de estados sobre el ciclo de vida del {{sessionToken}}; y conjetura de errores sobre la degradación '
  + 'del endpoint. Cuatro casos cubren riesgo que *ningún AC menciona*: '
  + `${T('TC11')} ({{placeId}} nulo), ${T('TC15')} (respuesta vacía), ${T('TC16')} (5xx / timeout) y ${T('TC17')} (loader global).`);
A();
A('*Instrumentación.* Cuatro de los siete criterios no se ven en la interfaz. Como la app es Ionic/Cordova y todo el '
  + 'tráfico de autocompletado sale del WebView, alcanza con {{chrome://inspect}} y el panel Network del DevTools remoto: '
  + 'sin proxy, sin certificado y sin instalar nada en el dispositivo. Ahí se miden el debounce (tiempos), el conteo de '
  + 'llamadas, la query string completa y el filtro {{maps.googleapis.com}} en cero.');
A();
A('h4. Gate de GO / NO-GO del smoke');
A();
A(`*GO* si pasan los siete bloqueantes: ${T('TC1')} · ${T('TC2')} · ${T('TC7')} · ${T('TC8')} · ${T('TC5')} · `
  + `${T('TC13')} · ${T('TC16')}.`);
A();
A(`Dos merecen subrayarse. ${T('TC1')} y ${T('TC16')} juntos son el verdadero gate de MG-112: que el endpoint propio `
  + 'responda no sirve de nada si ante un fallo la app vuelve a Google en silencio. '
  + `Y ${T('TC13')} es bloqueante aunque el ticket lo trate como un escenario más: sin {{sessionToken}} compartido, Google `
  + 'factura cada pulsación como sesión independiente y el ahorro que justifica la épica no ocurre.');
A();
A('h4. Precondición de desbloqueo del ATR');
A();
A('Las 17 corridas se mantienen en {{TO DO}} hasta que se cumplan las tres:');
A();
A(`# Existe rama y merge request de ${STORY} en {{magiis-mobile-driver-v2}}, con {{places/autocomplete}} en el diff.`);
A('# El desarrollador confirma el SHA desde el que se compiló el APK, y ese SHA está en el repositorio.');
A('# PO/Dev responden las contradicciones de contrato de la sección 3.');
A();
A('----');
A();
A('_Nota de proceso: en MG no modifico estado, campos ni etiquetas de las incidencias generales; la revisión se '
  + 'entrega como comentario y los artefactos de prueba se crean en el proyecto TM. — Emanuel Restrepo (QA)_');

const body = L.join('\n');
writeFileSync(OUT, body, 'utf8');
console.log(`cuerpo: ${body.length} chars -> ${OUT.replace(ROOT, '.')}`);
if (body.length > 32000) {
  console.log('⚠ excede el límite de comentario de Jira');
  process.exit(1);
}
if (!APPLY) {
  console.log('(dry run — no se publicó)');
  process.exit(0);
}

const c = await jira(`/rest/api/2/issue/${STORY}/comment`, { method: 'POST', body: JSON.stringify({ body }) });
const v = await jira(`/rest/api/3/issue/${STORY}/comment/${c.id}?expand=renderedBody`);
const rb = v.renderedBody;
console.log(`✔ comentario ${c.id} publicado por ${v.author.displayName}`);
console.log(
  `  tablas:${(rb.match(/confluenceTable/g) || []).length} filas:${(rb.match(/<tr>/g) || []).length} `
  + `paneles:${(rb.match(/class="panel/g) || []).length} errores:${(rb.match(/class="error"/g) || []).length} `
  + `macros:${(rb.match(/jira-issue-macro/g) || []).length}`,
);
console.log(`  ${JIRA}/browse/${STORY}?focusedCommentId=${c.id}`);
