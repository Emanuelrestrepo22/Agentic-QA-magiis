/**
 * Soporte compartido para specs del portal legacy (apps-test) — pasarelas de pago.
 * Locators i18n-proof (la UI corre EN/ES según Accept-Language): login por `type`,
 * estado de card por clase de color (a.red-text = vinculado, a.green-text = desvinculado).
 */

import type { Locator, Page } from '@playwright/test';

import { expect } from '@playwright/test';

const ENV = process.env;

// Vars dedicadas GATEWAY_* (NO usar BASE_URL/USER_CARRIER del .env: apuntan a apps-uat/otro carrier).
export const gatewayConfig = {
  baseUrl: ENV.GATEWAY_BASE_URL ?? 'https://apps-test.magiis.com',
  carrierEmail: ENV.GATEWAY_CARRIER_EMAIL ?? 'remises.eeuu@yopmail.com',
  carrierPassword: ENV.GATEWAY_CARRIER_PASSWORD ?? '123',
  carrierAccountId: Number.parseInt(ENV.GATEWAY_CARRIER_ACCOUNT_ID ?? '1521', 10),
  passengerEmail: ENV.GATEWAY_PASSENGER_EMAIL ?? 'emanuel.restrepo@yopmail.com',
} as const;

const PROD_HOST_MARKERS = ['api.apps.magiis.com', 'apps.magiis.com/prod'];

/** true si baseUrl apunta a un host de producción (para bloquear pasos destructivos). */
export function isProdHost(baseUrl: string = gatewayConfig.baseUrl): boolean {
  return PROD_HOST_MARKERS.some(m => baseUrl.includes(m));
}

/** Login legacy → dashboard del carrier. Locators estructurales (i18n-proof). */
export async function loginCarrierLegacy(page: Page): Promise<void> {
  await page.goto(`${gatewayConfig.baseUrl}/#/authentication/login/carrier`);
  await page.locator('input[type="text"]').first().fill(gatewayConfig.carrierEmail);
  await page.locator('input[type="password"]').first().fill(gatewayConfig.carrierPassword);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/home\/carrier\/dashboard/, { timeout: 30_000 });
}

/** Navega a Interfaces de pago y devuelve el Locator de la card de la pasarela (por company). */
export async function gotoGatewayCard(page: Page, company: string): Promise<Locator> {
  await page.goto(`${gatewayConfig.baseUrl}/#/home/carrier/integrations/list`);
  const card = page.locator('.card').filter({
    has: page.locator('.card-subtitle', { hasText: company }),
  });
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

/**
 * Estado de la card por clase de color (espera a que resuelva `validatingStripe`/`stripeUri`).
 * @returns 'linked' (a.red-text visible) | 'unlinked' (a.green-text visible)
 */
export async function readGatewayState(card: Locator): Promise<'linked' | 'unlinked'> {
  await expect(card.locator('a.red-text, a.green-text').first()).toBeVisible({ timeout: 20_000 });
  const linked = (await card.locator('a.red-text').count()) > 0;
  return linked ? 'linked' : 'unlinked';
}
