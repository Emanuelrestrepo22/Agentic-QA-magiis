/**
 * Consultas de dominio — desvinculación de pasarela de pago (Stripe) del carrier.
 *
 * Reproduce en código las 3 queries validadas manualmente (ver automation-plan.md):
 *  1. MGW_LINKED  → vinculación pasarela↔carrier (ACTIVE=1 = vinculada).
 *  2. USER_WALLET → wallet del pasajero (se elimina en cascada al desvincular).
 *  3. CARD (join)  → tarjetas del pasajero asociadas a la pasarela.
 *
 * Todas fail-fast (vía withOracleTest). Devuelven números/objetos para assertions.
 */

import { queryCount, withOracleTest } from '@utils/db/oracleClient';

export interface GatewayLinkSnapshot {
  activeLinks: number
  userWallets: number
  gatewayCards: number
}

/** Cuenta vinculaciones ACTIVAS de la pasarela para el carrier. */
async function countActiveLinks(carrierAccountId: number): Promise<number> {
  return withOracleTest(async conn => queryCount(
    conn,
    `SELECT COUNT(*) AS CNT FROM MAGIIS.MGW_LINKED ml
       WHERE ml.CARRIER_ACCOUNT_ID = :carrierId AND ml.ACTIVE = 1`,
    { carrierId: carrierAccountId },
  ));
}

/** Cuenta wallets del pasajero (por email). */
async function countUserWallets(email: string): Promise<number> {
  return withOracleTest(async conn => queryCount(
    conn,
    'SELECT COUNT(*) AS CNT FROM MAGIIS.USER_WALLET uw WHERE uw.EMAIL = :email',
    { email },
  ));
}

/** Cuenta tarjetas del pasajero asociadas a una pasarela (join card↔wallet↔MERCADOPAGO_APP). */
async function countGatewayCards(email: string): Promise<number> {
  return withOracleTest(async conn => queryCount(
    conn,
    `SELECT COUNT(*) AS CNT
       FROM MAGIISUSER u
       JOIN USER_WALLET w ON w.USER_ID = u.ID
       JOIN CARD ca ON ca.USER_WALLET_ID = w.ID
       JOIN MERCADOPAGO_APP ma ON ma.ID = ca.MERCADOPAGO_APP_ID
      WHERE u.EMAIL = :email`,
    { email },
  ));
}

/**
 * Snapshot combinado (las 3 métricas) — para comparar antes/después de la desvinculación.
 * Una sola llamada por conveniencia; abre 3 conexiones cortas (aceptable para verificación).
 */
export async function getGatewaySnapshot(args: {
  carrierAccountId: number
  passengerEmail: string
}): Promise<GatewayLinkSnapshot> {
  const [activeLinks, userWallets, gatewayCards] = await Promise.all([
    countActiveLinks(args.carrierAccountId),
    countUserWallets(args.passengerEmail),
    countGatewayCards(args.passengerEmail),
  ]);
  return { activeLinks, userWallets, gatewayCards };
}

export { countActiveLinks, countGatewayCards, countUserWallets };
