/**
 * TC-GATEWAY-UNLINK-STRIPE-01 — Desvincular pasarela Stripe (carrier) + borrado en cascada.
 *
 * Portal LEGACY (magiis-fe, Angular 5) en apps-test. Proyecto Playwright aislado `gateway-legacy`
 * (sin ui-setup ni storageState de carrier-v2). Login inline + URLs absolutas de apps-test.
 *
 * SEGURIDAD:
 *   - La desvinculación es IRREVERSIBLE y borra tarjetas/wallets de pasajeros del carrier.
 *   - Por defecto DRY-RUN: valida estado "vinculado" y NO ejecuta el paso destructivo.
 *   - Para ejecutar la desvinculación real: ALLOW_DESTRUCTIVE_UNLINK=true (solo en TEST).
 *   - Bloqueo duro: nunca ejecuta el paso destructivo contra hosts de producción.
 *   - Precondición restaurable vía TC-GATEWAY-LINK-STRIPE-01 (ciclo repetible).
 *
 * Ejecución:
 *   bun playwright test --project=gateway-legacy tests/gateway-legacy/unlink-stripe-gateway.test.ts
 *   ALLOW_DESTRUCTIVE_UNLINK=true bun playwright test --project=gateway-legacy ...   (destructivo, TEST)
 */

import { expect, test } from '@playwright/test';
import { isOracleTestConfigured } from '@utils/db/oracleClient';
import { getGatewaySnapshot } from '@utils/db/paymentGatewayDb';
import { gatewayConfig, gotoGatewayCard, isProdHost, loginCarrierLegacy, readGatewayState } from './support';

const GATEWAY = 'Stripe';
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_UNLINK === 'true';

test.describe('TC-GATEWAY-UNLINK-STRIPE-01: desvincular pasarela Stripe (carrier legacy) @gateway @stripe @integrations @unlink', () => {
  test.describe.configure({ timeout: 120_000 });

  test('TC-GATEWAY-UNLINK-STRIPE-01: should read Stripe link state (UI + DB evidence) and, when linked, unlink with cascade delete on confirm', async ({ page }) => {
    // 0) Guard de seguridad: jamás ejecutar el paso destructivo contra producción.
    if (isProdHost() && ALLOW_DESTRUCTIVE) {
      throw new Error(`Desvinculación destructiva bloqueada en producción (${gatewayConfig.baseUrl}).`);
    }

    // 1) Snapshot DB como EVIDENCIA (no cross-assert: la card puede derivar de Stripe Connect,
    //    no de MGW_LINKED). El cascade real se valida post-desvinculación vía wallets/cards → 0.
    const dbAvailable = isOracleTestConfigured();
    if (dbAvailable) {
      const before = await getGatewaySnapshot({ carrierAccountId: gatewayConfig.carrierAccountId, passengerEmail: gatewayConfig.passengerEmail });
      console.log(`[DB antes] activeLinks=${before.activeLinks} wallets=${before.userWallets} cards=${before.gatewayCards}`);
    }
    else {
      console.warn('[DB] Oracle TEST no configurado — se omite validación de cascada (solo UI).');
    }

    // 2) Login + ir a la card de Stripe.
    await loginCarrierLegacy(page);
    const stripeCard = await gotoGatewayCard(page, GATEWAY);

    // 3) Estado en UI (i18n-proof por clase de color).
    const state = await readGatewayState(stripeCard);
    const unlinkAction = stripeCard.locator('a.red-text');
    const linkAction = stripeCard.locator('a.green-text');
    console.log(`[UI] Stripe card = ${state}`);

    // 4) Si NO está vinculado: no hay nada que desvincular. Smoke read-only OK.
    if (state === 'unlinked') {
      await expect(linkAction).toBeVisible();
      console.log('[SMOKE] Stripe desvinculado — validado estado "Vincular/Link". Sin acción destructiva.');
      return;
    }

    // 5) Vinculado + DRY-RUN por defecto: no ejecutar el paso irreversible salvo opt-in explícito.
    if (!ALLOW_DESTRUCTIVE) {
      console.log('[DRY-RUN] Estado vinculado verificado. Set ALLOW_DESTRUCTIVE_UNLINK=true para ejecutar la desvinculación (solo TEST).');
      return;
    }

    // 6) Desvincular → diálogo de confirmación → Confirmar (btn-primary, i18n-proof).
    await unlinkAction.click();
    const dialog = page.locator('.modal-content').last();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator('.modal-footer button.btn-primary').click();

    // 7) Assert UI = desvinculado (la card pasa a "Vincular"; "Desvincular" desaparece).
    await expect(linkAction).toBeVisible({ timeout: 20_000 });
    await expect(unlinkAction).toBeHidden();

    // 8) Assert DB = borrado en cascada (wallets/cards del pasajero → 0; MGW_LINKED sin vinculación activa).
    if (dbAvailable) {
      const after = await getGatewaySnapshot({ carrierAccountId: gatewayConfig.carrierAccountId, passengerEmail: gatewayConfig.passengerEmail });
      console.log(`[DB después] activeLinks=${after.activeLinks} wallets=${after.userWallets} cards=${after.gatewayCards}`);
      expect(after.userWallets, 'USER_WALLET del pasajero debería borrarse en cascada').toBe(0);
      expect(after.gatewayCards, 'CARD del pasajero debería borrarse en cascada').toBe(0);
      expect(after.activeLinks, 'MGW_LINKED no debería tener vinculación activa').toBe(0);
    }
  });
});
