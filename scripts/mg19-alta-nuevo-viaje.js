// MG-19 — reusable "Nuevo Viaje" form-fill for manual-execution sessions (Carrier v2, apps-test).
// Run:  npx playwright cli -s=<session> run-code --filename=scripts/mg19-alta-nuevo-viaje.js
//
// Edit CONFIG per case (one Edit call) instead of re-typing the form (~10 tool calls -> 1).
// The script STOPS BEFORE any irreversible action (Enviar Manual / Enviar Servicio / Cotizar):
// that click is the case's decision point and stays with the session.
// Returns JSON: { fecha, hora, tarifaTotal, botones } for assertion without snapshots.
//
// Selectors validated live on v2.0.13 (2026-08-24/25). Gotchas honored:
// - draft modal ("Empezar de cero") awaited briefly, dismissed, and awaited hidden
// - the Pasajero/Autorizante field is targeted by its stable id="passenger", never by its label
//   text — the app renames Pasajero -> Autorizante only once it resolves the client type, and a
//   label-text wait can miss the rename entirely
// - same-route re-navigation between cases (goto the same "#/travel/create" hash the session was
//   already on) does NOT reliably tear down the Angular form: leftover search text corrupts the
//   next field's query, and a leftover fecha/hora silently survives into the next case. Every
//   typeahead is cleared before typing, and fecha/hora are ALWAYS set explicitly (0 days = today
//   for 'ondemand'), never left to the page's assumed default.
// - ng-select autocompletes need click + type (fill does not always trigger Angular)
// - ngbDatepicker renders in body; day picked via .ngb-dp-day nth index (nth-of-type fails);
//   month rollover handled by advancing the calendar once
// - the simulateAll network response is awaited (best-effort) before falling back to a DOM poll
//   for the rendered fare, so a merely-slow backend doesn't hard-fail the script
// - a form left mid-fill from a PRIOR script run triggers the app's own "Estás saliendo del
//   nuevo viaje" exit guard on the next navigation — that confirmation belongs to the calling
//   session (see segment-prompt-template.md §7-8), not to this script
//
// Precondition for the Cotizar button: see Xray TM-761. CAVEAT (found 2026-08-25 while verifying
// this script): the same client + hora 00:00 did NOT trigger it on a different date (28/08 gave
// the normal $13.637,80 fare, no Cotizar) — the degenerate-fare condition appears date-dependent,
// not purely time-of-day. Treat TM-761's recipe as a starting point to re-probe, not a guarantee.

// playwright-cli run-code --filename requires a single top-level function expression;
// import/export is rejected by the loader — see playwright-cli/references/running-code.md.
// eslint-disable-next-line no-unused-expressions
async (page) => {
  const CONFIG = {
    cliente: 'QA idea', // >=3 chars; first option picked
    autorizante: 'Emanuel', // null to skip (e.g. particular client fills Pasajero itself)
    origen: 'San Martin 536', // first Google prediction picked
    destino: 'Av del Libertador 118', // first Google prediction picked
    modo: 'ondemand', // 'ondemand' (today + "Ahora") | 'programado' (future date)
    diasFuturo: 3, // modo 'programado': days ahead
    hora: null, // modo 'programado' only: '10:00' | '00:00' (Cotizar slot, TM-761) | null
  };

  if (CONFIG.modo === 'ondemand' && CONFIG.hora) {
    throw new Error('CONFIG inválido: modo \'ondemand\' exige hora:null — setear una hora convierte el viaje en programado-de-hoy');
  }

  // ng-select portals its option panel to the document root (not nested under the combo), so a
  // click resolving without throwing is NOT proof the right option got selected — a residual
  // panel from an earlier field, or a click that lands a beat before the list settles, can
  // silently no-op (measured live: Autorizante and Origen ended up empty with no exception
  // anywhere, and the script only failed several steps later on an unrelated button). Waiting for
  // the panel to actually CLOSE after the click is a cheap, accent/locale-agnostic proof the
  // selection landed; a fieldLabel makes a real miss fail loud, at the field that caused it.
  const pickFirstOption = async (fieldLabel) => {
    const panel = page.locator('.ng-dropdown-panel').first();
    const opt = panel.locator('.ng-option').first();
    await opt.waitFor({ state: 'visible', timeout: 15000 });
    await opt.click();
    await panel
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {
        throw new Error(`pickFirstOption: panel did not close after clicking an option for "${fieldLabel}" — the click likely missed the real option (stale/residual panel).`);
      });
  };

  // Same-route re-navigation between cases (goto the same "#/travel/create" hash the session
  // was already on) does not reliably tear down the Angular ng-select component: a prior run's
  // search text can still be sitting in the input. Typing on top of it silently corrupts the
  // query (measured: "QA idea" -> "QA ideaQA idea", 0 backend matches, opaque timeout several
  // steps later). Always clear before typing on every typeahead field.
  const clearAndType = async (locator, text) => {
    await locator.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text);
  };

  // 0) Draft modal — may render up to a few seconds after load; wait for it, then wait it out
  const cero = page.getByRole('button', { name: 'Empezar de cero' });
  const draftAppeared = await cero.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
  if (draftAppeared) {
    await cero.click();
    await cero.waitFor({ state: 'hidden', timeout: 10000 });
  }

  // 1) Cliente
  await clearAndType(page.getByRole('combobox', { name: 'Cliente' }), CONFIG.cliente);
  await pickFirstOption('Cliente');

  // 2) Autorizante / Pasajero. Its <label> text is renamed Pasajero -> Autorizante only once
  //    the app resolves the client type (contractor), but the underlying input keeps a stable
  //    id="passenger" throughout — target the id, not the (unstable) accessible name, and wait
  //    for the ng-select wrapper to lose ng-select-disabled before interacting.
  if (CONFIG.autorizante) {
    await page.waitForFunction(() => {
      const input = document.querySelector('#passenger');
      return !!input && !input.closest('ng-select')?.classList.contains('ng-select-disabled');
    }, null, { timeout: 20000 });
    await clearAndType(page.locator('#passenger'), CONFIG.autorizante);
    await pickFirstOption('Autorizante');
  }

  // 3) Ruta
  await clearAndType(page.getByRole('combobox', { name: 'Origen' }), CONFIG.origen);
  await pickFirstOption('Origen');
  const destino = page.getByRole('combobox', { name: 'Destino' });
  await destino.waitFor({ state: 'visible', timeout: 10000 });
  await clearAndType(destino, CONFIG.destino);
  await pickFirstOption('Destino');

  // 4) Fecha — ALWAYS set explicitly, even for 'ondemand' (0 days = today). Same-route reuse
  //    between cases in one session (goto the same "#/travel/create" hash repeatedly) does not
  //    reset this field: a prior case's future date silently carries over onto the next case if
  //    left untouched, turning an intended on-demand case into a stale scheduled one (measured
  //    live: 'ondemand' inherited "28/08/2026" + "00:00" from the previous run in this session).
  const diasObjetivo = CONFIG.modo === 'programado' ? CONFIG.diasFuturo : 0;
  await page.locator('.nt-date-group button').click();
  const dp = page.locator('ngb-datepicker');
  await dp.waitFor({ state: 'visible', timeout: 10000 });
  const target = new Date();
  target.setDate(target.getDate() + diasObjetivo);
  const dayText = String(target.getDate());
  // Enabled cell for that day number (first enabled match; past days are app-disabled).
  // Rendering-aware text: textContent would also match the visually hidden adjacent-month digits.
  const findDay = () => dp.locator('.ngb-dp-day').evaluateAll((cells, want) => {
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    return cells.findIndex(c => c.innerText.trim() === want && !c.classList.contains('disabled'));
  }, dayText);
  let idx = await findDay();
  if (idx < 0) {
    // Target day rolled into the next month and its trailing cell is disabled: advance once.
    await dp.locator('.ngb-dp-arrow-next button, button[aria-label="Next month"]').first().click();
    idx = await findDay();
  }
  if (idx < 0) { throw new Error(`Datepicker: day ${dayText} not enabled in current or next month — adjust diasFuturo`); }
  await dp.locator('.ngb-dp-day').nth(idx).click();

  // 5) Hora — same reuse hazard as fecha: reset explicitly instead of trusting the page default.
  const ts = page.locator('.nt-time-select');
  await ts.scrollIntoViewIfNeeded();
  await clearAndType(ts.locator('.ng-select-container'), CONFIG.hora || 'Ahora');
  await pickFirstOption('Hora');

  // 6) Simulate fares. Prefer the network response as the completion signal (a recovered draft
  //    could otherwise show a stale panel — though step 0 already discards drafts, so this is a
  //    fast-path, not the only source of truth); if the backend is merely slow, don't hard-fail
  //    the whole script on that alone — fall through to the DOM check below, which is what the
  //    return value is actually read from.
  const simResponse = page.waitForResponse(r => r.url().includes('/travels/simulateAll'), { timeout: 45000 }).catch(() => null);
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await simResponse;
  await page.locator('button', { hasText: 'Enviar Servicio' }).first().waitFor({ state: 'visible', timeout: 30000 });
  /* eslint-disable unicorn/prefer-dom-node-text-content -- rendering-aware text below matches
     what a human tester reads on screen (line breaks per block, no hidden-element leakage),
     which is what the fare/button regexes are written against. */
  await page.waitForFunction(
    () => /Subtotal del Viaje\s*\$ [\d.,]+/.test(document.body.innerText),
    null,
    { timeout: 20000 },
  );

  return await page.evaluate(() => ({
    fecha: document.querySelector('input[ngbdatepicker]')?.value ?? null,
    hora: document.querySelector('.nt-time-select .ng-value-label')?.innerText ?? null,
    tarifaTotal: document.body.innerText.match(/Subtotal del Viaje\s*(\$ [\d.,]+)/)?.[1] ?? null,
    botones: [...document.querySelectorAll('button')]
      .filter(b => /Cotizar|Enviar Manual|Enviar Servicio|Volver/.test(b.innerText))
      .map(b => b.innerText.trim() + (b.disabled ? ' [DISABLED]' : '')),
  }));
  /* eslint-enable unicorn/prefer-dom-node-text-content */
  // No semicolon below: run-code wraps this file in `(...)` and evaluates it as one expression;
  // a trailing `;` breaks that wrapping. Keep this file semicolon-free at the top level.
  // eslint-disable-next-line style/semi
}
