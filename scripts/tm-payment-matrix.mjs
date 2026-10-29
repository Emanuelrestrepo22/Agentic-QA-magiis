/**
 * Pairwise matrix for the payment-method wave of the Alta de Viaje suite.
 *
 * Every factor, value and constraint below was read from code, not inferred:
 *   BE  magiis-be  services/CarrierPaymentMethodConfigService.java
 *                  controllers/CarrierAccountController.java
 *                  services/TravelService.java · entities/payments/PaymentMethod.java
 *   FE  magiis-fe-carrier-v2 @ origin/develop
 *                  src/app/pages/carrier/trips/new-trip/new-trip.component.{ts,html}
 *
 * The payment method is not a free variable: it is composed by five stacked layers
 * (carrier config per channel → contractor-employee flags → gateway → checking-account
 * state → a front-end re-check). Combining it with the factors that genuinely interact
 * is what lets one spec cover several test cases per run.
 *
 * The search space is small (1080 raw combinations), so pairwise is computed exactly:
 * enumerate the legal combinations, enumerate the pairs that are actually reachable,
 * then greedily pick the combination covering the most still-uncovered pairs. No
 * heuristic sampling — the reduction it reports is exact.
 *
 * Usage:
 *   bun scripts/tm-payment-matrix.mjs            # print the matrix + the reduction
 *   bun scripts/tm-payment-matrix.mjs --json     # emit rows as JSON for the spec
 *   bun scripts/tm-payment-matrix.mjs --wiki     # emit the Jira table for the ATR
 */

const FACTORS = {
  metodo: ['CASH', 'CHECKING_ACCOUNT', 'CREDIT_CARD', 'NEW_CREDIT_CARD', 'SAVED_CARD', 'QR'],
  pagador: ['individuo', 'colaborador'],
  gateway: ['ninguno', 'mercadopago', 'otro'],
  cta: ['inexistente', 'inactiva', 'activa_ok', 'saldo_cero_duro', 'saldo_cero_permitido'],
  tarjetas: ['cero', 'una_valida', 'una_invalida'],
  entrada: ['nuevo', 'clonado'],
};

/**
 * Forbidden combinations. Each one cites the guard it comes from — a wrong constraint
 * produces impossible rows, which is worse than a missing one.
 */
const CONSTRAINTS = [
  {
    id: 'C1',
    why: 'Sin gateway no hay tarjeta ni QR — CarrierAccountController.java:2494-2497 + new-trip.component.ts:3151',
    violates: r => r.gateway === 'ninguno'
      && ['CREDIT_CARD', 'NEW_CREDIT_CARD', 'SAVED_CARD', 'QR'].includes(r.metodo),
  },
  {
    id: 'C2',
    why: 'QR exige appCode == "MERCADOPAGO" — CarrierAccountController.java:2482-2483',
    violates: r => r.gateway === 'otro' && r.metodo === 'QR',
  },
  {
    id: 'C3',
    why: 'Cuenta corriente inexistente o inactiva ⟹ la opción no se ofrece — CarrierAccountController.java:2503-2527',
    violates: r => ['inexistente', 'inactiva'].includes(r.cta) && r.metodo === 'CHECKING_ACCOUNT',
  },
  {
    id: 'C4',
    why: 'No se puede elegir una tarjeta guardada si no hay ninguna — new-trip.component.ts:2960-2974',
    violates: r => r.tarjetas === 'cero' && r.metodo === 'SAVED_CARD',
  },
  {
    id: 'C5',
    why: 'La billetera solo se carga cuando hay gateway — CarrierAccountController.java:2485-2493',
    violates: r => r.gateway === 'ninguno' && r.tarjetas !== 'cero',
  },
];

// --- enumerate ---------------------------------------------------------------
const keys = Object.keys(FACTORS);
const raw = [];
(function walk(i, acc) {
  if (i === keys.length) { raw.push({ ...acc }); return; }
  for (const v of FACTORS[keys[i]]) { walk(i + 1, { ...acc, [keys[i]]: v }); }
})(0, {});

const broken = r => CONSTRAINTS.filter(c => c.violates(r));
const legal = raw.filter(r => broken(r).length === 0);

// --- the pairs that are actually reachable ----------------------------------
const pairKey = (a, va, b, vb) => `${a}=${va}|${b}=${vb}`;
const reachable = new Set();
for (const r of legal) {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      reachable.add(pairKey(keys[i], r[keys[i]], keys[j], r[keys[j]]));
    }
  }
}

const pairsOf = (r) => {
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) { out.push(pairKey(keys[i], r[keys[i]], keys[j], r[keys[j]])); }
  }
  return out;
};

// --- greedy exact cover over the reachable pairs -----------------------------
const uncovered = new Set(reachable);
const matrix = [];
while (uncovered.size > 0) {
  let best = null; let bestGain = -1;
  for (const r of legal) {
    const gain = pairsOf(r).filter(p => uncovered.has(p)).length;
    if (gain > bestGain) { bestGain = gain; best = r; }
  }
  if (bestGain <= 0) { break; }
  matrix.push(best);
  for (const p of pairsOf(best)) { uncovered.delete(p); }
}

// --- guarantees --------------------------------------------------------------
for (const r of matrix) {
  const bad = broken(r);
  if (bad.length) { throw new Error(`fila ilegal en la matriz (${bad.map(b => b.id).join(',')}): ${JSON.stringify(r)}`); }
}
if (uncovered.size !== 0) { throw new Error(`quedaron ${uncovered.size} pares sin cubrir`); }

// --- output ------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--json')) {
  console.log(JSON.stringify(matrix.map((r, i) => ({ fila: i + 1, ...r })), null, 1));
  process.exit(0);
}

if (args.includes('--wiki')) {
  const W = [];
  W.push('||#||Medio de pago||Pagador||Gateway||Cuenta corriente||Tarjetas||Entrada||');
  matrix.forEach((r, i) => W.push(
    `|${i + 1}|${r.metodo}|${r.pagador}|${r.gateway}|${r.cta}|${r.tarjetas}|${r.entrada}|`,
  ));
  console.log(W.join('\n'));
  process.exit(0);
}

const totalPairs = (() => {
  let n = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) { n += FACTORS[keys[i]].length * FACTORS[keys[j]].length; }
  }
  return n;
})();

console.log('\n=== Matriz pairwise · medios de pago ===\n');
console.log('Factores:');
for (const k of keys) { console.log(`  ${k.padEnd(9)} ${FACTORS[k].length}  ${FACTORS[k].join(' · ')}`); }
console.log('\nRestricciones (todas ancladas en código):');
for (const c of CONSTRAINTS) { console.log(`  ${c.id}  ${c.why}`); }

console.log('\n--- reducción aplicada ---');
console.log(`  combinaciones del cruce completo : ${raw.length}`);
console.log(`  podadas por restricción          : ${raw.length - legal.length}`);
console.log(`  combinaciones legales            : ${legal.length}`);
console.log(`  pares teóricos                   : ${totalPairs}`);
console.log(`  pares alcanzables                : ${reachable.size}  (${totalPairs - reachable.size} imposibles)`);
console.log(`  FILAS FINALES                    : ${matrix.length}`);
console.log(`  reducción                        : ${(100 * (1 - matrix.length / legal.length)).toFixed(1)}% sobre lo legal`);

console.log('\n--- la matriz ---');
console.log(`  #  ${'metodo'.padEnd(17)}${'pagador'.padEnd(13)}${'gateway'.padEnd(13)}${'cta'.padEnd(22)}${'tarjetas'.padEnd(14)}entrada`);
matrix.forEach((r, i) => console.log(
  `  ${String(i + 1).padStart(2)} ${r.metodo.padEnd(17)}${r.pagador.padEnd(13)}${r.gateway.padEnd(13)}${r.cta.padEnd(22)}${r.tarjetas.padEnd(14)}${r.entrada}`,
));

const crea = matrix.filter(r => r.entrada === 'nuevo' && r.cta !== 'saldo_cero_duro').length;
console.log(`\n  filas que llegan a crear un viaje: ~${crea} de ${matrix.length}`);
console.log('  (el resto solo abre la pantalla y lee el selector — no envía)\n');
