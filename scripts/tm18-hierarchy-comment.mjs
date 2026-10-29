/**
 * Posts the Fase 3.F/G hierarchy-repair report (Epic Link restoration) as a new
 * comment on TM-18 (ATR · Alta de Viaje — Carrier v2 (Ronda 1)), scoped to the
 * 88 Tests this ATR contains — the same 88 repaired in lot L3 of the Xray<->KATA
 * remediation plan (label `atp-mg-altaviaje`, target TM-20).
 *
 * Wiki-markup body via REST v2 (not ADF), mirroring the established "estilo
 * Allure" convention already used on TM-36's comment (see tm-atp-comment.mjs).
 * POSTs a NEW comment (issue comments are a thread, unlike a Test Run's single
 * comment field) rather than overwriting an existing one.
 *
 * Usage:
 *   bun scripts/tm18-hierarchy-comment.mjs --dry-run
 *   bun scripts/tm18-hierarchy-comment.mjs --apply
 */

import { writeFileSync } from 'node:fs';
import { jiraRequest } from '../cli/xray/lib/jira-search.ts';

const APPLY = process.argv.includes('--apply');
const ATR = 'TM-18';
const REPOSITORY_EPIC = 'TM-20';
// Evidence for the figures below: .backups/hierarchy/apply-L3-1787333677185.jsonl

const W = []; const A = (s = '') => W.push(s);

A('h3. 🔧 QA · Trazabilidad Xray reparada — Epic Link restaurado en este ATR');
A('');
A('*Corte:* 2026-08-21 · Estilo Allure · Fase 3 del plan de remediación Xray↔KATA');
A('*Alcance:* los *88 Tests* que contiene este ATR (campaña {{atp-mg-altaviaje}})');
A('*Veredicto:* ✅ 88/88 reparados, 0 fallos');
A('');
A('{panel:title=Qué se rompió}');
A('La migración nativa de proyecto Jira MG → TM (2026-08-10) preservó el contenido y los test runs de '
  + 'los 88 Tests, pero les dejó el campo *Epic Link* ({{parent}}) vacío. El eje de trazabilidad "Test → épica '
  + 'QA Test Repository" estaba roto en el *100%* de los casos de este ATR.');
A('{panel}');
A('');
A('{panel:title=Qué se reparó}');
A(`Escritura mecánica, campo por campo: {{parent = ${REPOSITORY_EPIC}}} (QA Test Repository) en los 88 Tests. `
  + 'Sin transición de status, sin tocar {{resolution}}, sin modificar summary/steps/labels — un único campo, '
  + 'reversible, verificado antes y después de escribir.');
A('{panel}');
A('');
A('||Métrica||Resultado||');
A('|Tests en alcance|88|');
A('|Reparados|*88* (0 ya reparados, 0 conflicto, 0 drift, 0 fallo)|');
A(`|Destino|${REPOSITORY_EPIC} — QA Test Repository|`);
A('|Efecto sobre los runs|*Ninguno.* 86 TO DO + 2 PASSED, intactos|');
A('|Verificación post-mutación|diff campo-por-campo contra snapshot pre-mutación de los 649 issues de TM — 0 diffs inesperados en este ATR|');
A('');
A('_Estos 88 son uno de 5 lotes de la misma campaña de reparación (29 Test Sets, 17 Test Executions/'
  + 'Preconditions, 374 Tests de la campaña gateway-release y 69 Tests sin campaña) — *577 issues de Xray* '
  + 'recuperaron su Epic Link en total. El detalle completo vive en el plan de remediación, fuera de Jira._');
A('');
A('----');
A('');
A('_— QA · MAGIIS._');

const body = W.join('\n');
writeFileSync('.backups/hierarchy/tm18-comment-preview.txt', body, 'utf8');
console.log(`cuerpo: ${body.length} chars`);
if (body.length > 32000) { console.log('⚠ excede el límite de comentario de Jira'); process.exit(1); }
if (!APPLY) { console.log('(dry run — no se publicó, ver .backups/hierarchy/tm18-comment-preview.txt)'); process.exit(0); }

const created = await jiraRequest(`/rest/api/2/issue/${ATR}/comment`, {
  method: 'POST',
  body: JSON.stringify({ body }),
});
console.log(`✔ comentario ${created.id} publicado en ${ATR}`);
console.log(`  ${(process.env.ATLASSIAN_URL || '').replace(/\/$/, '')}/browse/${ATR}?focusedCommentId=${created.id}`);
