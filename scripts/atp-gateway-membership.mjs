#!/usr/bin/env node
/**
 * atp-gateway-membership.mjs — Selección determinista de membership para los
 * Test Executions POR PASARELA del ATP MG-178 (Ronda 1: acciones estandarizadas).
 *
 * Fuentes (read-only):
 *  - .context/magiis-process/atp-mg-import-NEW.csv   (col Gateways, split ';')
 *  - .context/magiis-process/atp-mg-gateway-idmap.md (tcid → MG-# → área → Level)
 *
 * Catálogo Ronda 1 (acciones repetitivas cross-gateway):
 *  A,B (vinculación & gate API) · CFG (config UI) · C (alta tarjeta) · WAL (wallet)
 *  E (hold) · F (cobro) · COB (cargo/cobro Authorize) · G (desvinculación)
 *  H (wallet lifecycle) · MPX (deltas MercadoPago)
 *  SBX (contrato sandbox Authorize.Net, keys MG-590..601 / tcid TC-PAY-SBX-01..12,
 *       requirement BL-036 — pack mono-pasarela, Test Set MG-602, ATR MG-558)
 * Excluidas: D (3DS = solo Stripe, cubierta por MG-511) · CHG (cubierta por MG-553)
 *  · TRIP/QUOTE/REC/EDIT/CLON/REACT (journeys de dominio, matriz Stripe)
 *  · L/K/J/DOC/WEB/ENT (hardening/migración/docs).
 *
 * Inferencia de pasarela cuando la col Gateways está vacía (en orden):
 *  1. Anotación del catálogo ATP §4 (atp-mg-release-gateway.md): "**TC-PAY-X-NN · ...** — MP/Stripe/Auth/Ebiz [nivel]".
 *     Paréntesis tipo "(Auth/Ebiz: verificar)" se DESCARTAN (conservador, coherente con exclusión 3DS).
 *  2. Reglas estructurales respaldadas por idmap:
 *     CFG-01..08 → stripe (MG-211..218) · CFG-09..16 → authorize (MG-219..226)
 *     WAL-01 → stripe (MG-284) · WAL-02..21 → authorize (MG-285..304)
 *     COB-* → authorize (MG-346..360 base; MG-519..551 extensión, fórmula MG-(503+N))
 *     SBX-* → authorize (MG-590..601, fórmula MG-(589+N); contrato sandbox, solo Authorize)
 *  3. Sin fuente → needs-review (NO entra al membership).
 *
 * Uso:  node scripts/atp-gateway-membership.mjs           (dry-run: solo reporte)
 *       node scripts/atp-gateway-membership.mjs --apply   (escribe atp-gateway-membership.json)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CSV_PATH = resolve(ROOT, '.context/magiis-process/atp-mg-import-NEW.csv');
const IDMAP_PATH = resolve(ROOT, '.context/magiis-process/atp-mg-gateway-idmap.md');
const RELEASE_DOC_PATH = resolve(ROOT, '.context/magiis-process/atp-mg-release-gateway.md');
const OUT_PATH = resolve(ROOT, '.context/magiis-process/atp-gateway-membership.json');

const APPLY = process.argv.includes('--apply');

const CATALOG_AREAS = ['A', 'B', 'CFG', 'C', 'WAL', 'E', 'F', 'COB', 'G', 'H', 'MPX', 'SBX'];
const EXCLUDED_AREAS = ['D', 'CHG', 'TRIP', 'QUOTE', 'REC', 'EDIT', 'CLON', 'REACT', 'L', 'K', 'J', 'DOC', 'WEB', 'ENT', 'I'];
const GATEWAYS = ['stripe', 'authorize', 'ebizcharge', 'mercado-pago'];
const TOKEN_MAP = { STRIPE: 'stripe', AUTHORIZE: 'authorize', EBIZ: 'ebizcharge', MP: 'mercado-pago' };

// ── CSV parser (state machine sobre TODO el texto: celdas con comillas pueden contener \n y comas) ──
function parseCsv(text) {
  const rows = [];
  let row = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = false; }
      }
      else { cur += c; }
    }
    else if (c === '"') { inQ = true; }
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') { i++; }
      row.push(cur); cur = '';
      if (row.some(v => v !== '')) { rows.push(row); }
      row = [];
    }
    else { cur += c; }
  }
  row.push(cur);
  if (row.some(v => v !== '')) { rows.push(row); }
  return rows;
}

// ── idmap: tabla | tcid | MG-# | área | Level | automatable | suite | ──
function parseIdmap(md) {
  const map = new Map();
  // Sin `\s*` antes de los grupos `[^|]*`: el espacio TAMBIÉN es `[^|]`, así que la pareja
  // `\s*([^|]*)` es ambigua y habilita backtracking polinomial (regexp/no-super-linear-backtracking).
  // Quitarlo no cambia el resultado — el grupo absorbe el espacio y las lecturas hacen `.trim()`.
  const re = /^\|\s*(TC-PAY-[A-Z]+-\d+)\s*\|\s*(MG-\d+)\s*\|\s*([A-Z]+)\s*\|([^|]*)\|([^|]*)\|/;
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) { map.set(m[1], { mg: m[2], area: m[3], level: m[4].trim(), automatable: m[5].trim() }); }
  }
  // Extensión COB-16..48 → MG-(503+N) (bloque final del idmap, no fila-a-fila)
  for (let n = 16; n <= 48; n++) {
    const tcid = `TC-PAY-COB-${String(n).padStart(2, '0')}`;
    if (!map.has(tcid)) {
      const level = n === 37 ? 'E2E' : n >= 45 ? 'API' : 'UI';
      map.set(tcid, { mg: `MG-${503 + n}`, area: 'COB', level, automatable: n === 37 || n >= 45 ? 'sí' : 'no' });
    }
  }
  return map;
}

// ── Catálogo ATP §4: "**TC-PAY-A-01 · Título** — MP/Stripe/Auth/Ebiz [API,UI] (PC-2)" ──
const DOC_TOKEN_MAP = { MP: 'mercado-pago', STRIPE: 'stripe', AUTH: 'authorize', EBIZ: 'ebizcharge' };
function parseReleaseDocGateways(md) {
  const map = new Map();
  // `(?!\d)` fuerza a `\d+` a consumir TODOS los dígitos del tcid: sin eso puede cederle uno a
  // `[^*]*` (ambigüedad → backtracking polinomial). NO se reduce a `\d` como sugiere
  // regexp/optimal-quantifier-concatenation: partiría el capture (`TC-PAY-A-0` + `1`) y el grupo 1
  // es la clave del map. El `\s*` antes de `([^[]+)` se quita por la misma razón que en parseIdmap
  // (el espacio es `[^[]`); los tokens se `.trim()`ean al splitear por '/'.
  const re = /^\*\*(TC-PAY-[A-Z]+-\d+(?!\d))[^*]*\*\*\s*—([^[]+)\[/;
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) { continue; }
    const cleaned = m[2].replace(/\([^)]*\)/g, ''); // descarta "(Auth/Ebiz: verificar)", "(delta)"
    const gws = [...new Set(cleaned.split('/').map(t => DOC_TOKEN_MAP[t.trim().toUpperCase()]).filter(Boolean))];
    if (gws.length) { map.set(m[1], gws); }
  }
  return map;
}

function inferGateways(tcid, area, docGwMap) {
  const doc = docGwMap.get(tcid);
  if (doc) { return { gws: doc, rule: 'inferred:atp-catalogo-§4' }; }
  const num = Number(tcid.match(/-(\d+)$/)?.[1]);
  if (area === 'CFG') { return { gws: num <= 8 ? ['stripe'] : ['authorize'], rule: 'inferred:cfg-split(MG-211..218 stripe / MG-219..226 authorize)' }; }
  if (area === 'WAL') { return { gws: num === 1 ? ['stripe'] : ['authorize'], rule: 'inferred:wal-split(MG-284 stripe / MG-285..304 authorize)' }; }
  if (area === 'COB') { return { gws: ['authorize'], rule: 'inferred:cob=authorize(MG-346..360,MG-519..551)' }; }
  if (area === 'SBX') { return { gws: ['authorize'], rule: 'inferred:sbx=authorize(MG-590..601, contrato sandbox BL-036)' }; }
  return { gws: null, rule: 'needs-review' };
}

const csvRows = parseCsv(readFileSync(CSV_PATH, 'utf8'));
const header = csvRows[0];
const col = Object.fromEntries(['TCID_local', 'Gateways', 'Level', 'Summary'].map(k => [k, header.indexOf(k)]));
const idmap = parseIdmap(readFileSync(IDMAP_PATH, 'utf8'));
const docGwMap = parseReleaseDocGateways(readFileSync(RELEASE_DOC_PATH, 'utf8'));

// dedup por tcid: última fila gana (el CSV acumula revisiones)
const byTcid = new Map();
for (const r of csvRows.slice(1)) {
  const t = r[col.TCID_local];
  if (t && t.startsWith('TC-PAY-')) { byTcid.set(t, r); }
}
// tcids del idmap ausentes del CSV (p.ej. extensión COB) entran con fila sintética
for (const tcid of idmap.keys()) { if (!byTcid.has(tcid)) { byTcid.set(tcid, null); } }

const membership = Object.fromEntries(GATEWAYS.map(g => [g, []]));
const needsReview = []; const noKey = []; const excluded = [];

for (const [tcid, row] of [...byTcid.entries()].sort()) {
  const known = idmap.get(tcid);
  const area = known?.area ?? tcid.match(/^TC-PAY-([A-Z]+)/)?.[1] ?? '?';
  if (!known) { noKey.push(tcid); continue; }
  if (!CATALOG_AREAS.includes(area)) { excluded.push(tcid); continue; }

  const raw = row?.[col.Gateways]?.trim() ?? '';
  let gws, source;
  if (raw) {
    gws = raw.split(';').map(t => TOKEN_MAP[t.trim()]).filter(Boolean);
    source = 'csv';
    if (raw.includes(',')) { needsReview.push({ tcid, reason: `Gateways con comas sin corregir: "${raw}"` }); }
  }
  else {
    const inf = inferGateways(tcid, area, docGwMap);
    gws = inf.gws; source = inf.rule;
    if (!gws) { needsReview.push({ tcid, reason: 'Gateways vacío sin regla de inferencia' }); continue; }
  }
  for (const g of gws) {
    membership[g].push({ tcid, mg: known.mg, area, level: known.level || (row?.[col.Level] ?? ''), source });
  }
}

const summary = {
  generated: new Date().toISOString().slice(0, 10),
  script: 'scripts/atp-gateway-membership.mjs',
  round: 'Ronda 1 — acciones estandarizadas',
  atp: 'MG-178',
  catalog_areas: CATALOG_AREAS,
  excluded_areas: EXCLUDED_AREAS,
  counts: Object.fromEntries(GATEWAYS.map(g => [g, membership[g].length])),
  needs_review: needsReview,
  tcids_sin_key_en_idmap: noKey,
  per_gateway: membership,
};

console.log(`ATP gateway membership — Ronda 1 (catálogo: ${CATALOG_AREAS.join(',')})`);
for (const g of GATEWAYS) {
  const byArea = {};
  for (const t of membership[g]) { byArea[t.area] = (byArea[t.area] || 0) + 1; }
  console.log(`  ${g.padEnd(13)} ${String(membership[g].length).padStart(3)} tests  ${JSON.stringify(byArea)}`);
}
console.log(`  needs-review: ${needsReview.length}  · sin key en idmap: ${noKey.length}  · fuera de catálogo: ${excluded.length}`);
if (needsReview.length) { console.log(JSON.stringify(needsReview, null, 2)); }
if (noKey.length) { console.log('  sin key:', noKey.join(', ')); }

if (APPLY) {
  writeFileSync(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n[APPLY] escrito ${OUT_PATH}`);
}
else {
  console.log('\n[DRY-RUN] sin escribir. Usa --apply para emitir atp-gateway-membership.json');
}
