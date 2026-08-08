/**
 * TC-GATEWAY-LINK-STRIPE-01 — Vincular pasarela Stripe (carrier) vía Stripe Connect (test mode).
 *
 * Portal LEGACY (magiis-fe / apps-test), proyecto aislado `gateway-legacy`.
 * Flujo (derivado del record test-10.spec.ts + FE global-integrations):
 *   card "Vincular" (a.green-text, href=stripeUri) → Stripe Connect (connect.stripe.com) →
 *   `[data-test="test-mode-fill-button"]` + submit(s) → redirect a
 *   /integrations/list?code=ac_...&scope=read_write → el FE hace setStripeCode(code) →
 *   stripeUri=null → card pasa a "Desvincular" (vinculado).
 *
 * Precondición: Stripe DESVINCULADO (si ya está vinculado, se omite: no hay nada que vincular).
 * Idempotencia: este flujo RESTAURA la precondición del unlink (TC-GATEWAY-UNLINK-STRIPE-01),
 * habilitando el ciclo repetible link↔unlink.
 *
 * NOTA: la interacción con la página hosteada de Stripe está derivada del record y puede requerir
 * ajuste live (el onboarding Connect en test mode puede tener pasos variables). Ver automation-plan.md.
 *
 * Ejecución: bun playwright test --project=gateway-legacy tests/gateway-legacy/link-stripe-gateway.test.ts
 */

import { expect, test } from '@playwright/test';
import { isOracleTestConfigured } from '@utils/db/oracleClient';
import { getGatewaySnapshot } from '@utils/db/paymentGatewayDb';
import { gatewayConfig, gotoGatewayCard, loginCarrierLegacy, readGatewayState } from './support';

const GATEWAY = 'Stripe';
const MAX_STRIPE_STEPS = 6;

test.describe('TC-GATEWAY-LINK-STRIPE-01: vincular pasarela Stripe (carrier legacy) @gateway @stripe @integrations @link', () => {
  test.describe.configure({ timeout: 180_000 });

  test('TC-GATEWAY-LINK-STRIPE-01: should link Stripe via Connect test-mode and reflect linked state on return', async ({ page }) => {
    await loginCarrierLegacy(page);
    const stripeCard = await gotoGatewayCard(page, GATEWAY);

    // Precondición: debe estar DESVINCULADO para poder vincular.
    const state = await readGatewayState(stripeCard);
    console.log(`[UI] estado inicial Stripe = ${state}`);
    if (state === 'linked') {
      console.log('[SKIP] Stripe ya vinculado — no hay flujo de vinculación que ejecutar.');
      test.skip(true, 'Stripe ya vinculado (precondición para vincular no cumplida).');
      return;
    }

    // 1) Iniciar vinculación: click "Vincular" (green-text, navega a Stripe Connect same-page).
    await stripeCard.locator('a.green-text').first().click();
    await page.waitForURL(/stripe\.com/, { timeout: 30_000 });
    console.log(`[Stripe] onboarding url=${page.url()}`);

    // 2) Completar onboarding en TEST MODE: usar el botón de auto-fill de Stripe y avanzar
    //    hasta que la app redirija de vuelta con ?code=. Onboarding puede tener varios pasos.
    for (let i = 0; i < MAX_STRIPE_STEPS; i++) {
      if (/apps-test\.magiis\.com/.test(page.url())) {
        break;
      }
      const fillBtn = page.locator('[data-test="test-mode-fill-button"]');
      if (await fillBtn.count() > 0 && await fillBtn.first().isVisible().catch(() => false)) {
        await fillBtn.first().click().catch(() => {});
      }
      // Botón primario para avanzar/enviar el paso (Stripe usa data-test/submit).
      const submit = page.locator('[data-test="continue-button"], button[type="submit"], [data-testid="continue-button"]').first();
      if (await submit.isVisible().catch(() => false)) {
        await Promise.race([
          page.waitForURL(/apps-test\.magiis\.com|stripe\.com/, { timeout: 20_000 }).catch(() => {}),
          submit.click().catch(() => {}),
        ]);
        await submit.click().catch(() => {});
      }
      await page.waitForTimeout(1500);
    }

    // 3) Redirect de vuelta a la app con el authorization code → FE completa el link.
    await page.waitForURL(/apps-test\.magiis\.com.*\/integrations\/list/, { timeout: 30_000 });
    expect(page.url(), 'debería volver con authorization code de Stripe').toContain('code=');

    // 4) Assert UI = vinculado (la card pasa a "Desvincular"). Fuente primaria de verdad.
    await page.goto(`${gatewayConfig.baseUrl}/#/home/carrier/integrations/list`);
    const cardAfter = await gotoGatewayCard(page, GATEWAY);
    const stateAfter = await readGatewayState(cardAfter);
    console.log(`[UI] estado final Stripe = ${stateAfter}`);
    expect(stateAfter, 'Stripe debería quedar vinculado tras el retorno de Stripe Connect').toBe('linked');

    // 5) Evidencia DB (no hard-assert de MGW_LINKED: la UI puede derivar de Stripe Connect).
    if (isOracleTestConfigured()) {
      const snap = await getGatewaySnapshot({ carrierAccountId: gatewayConfig.carrierAccountId, passengerEmail: gatewayConfig.passengerEmail });
      console.log(`[DB después] activeLinks=${snap.activeLinks} wallets=${snap.userWallets} cards=${snap.gatewayCards}`);
    }
  });
});
