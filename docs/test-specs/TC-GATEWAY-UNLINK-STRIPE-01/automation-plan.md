# Automation Plan — TC-GATEWAY-UNLINK-STRIPE-01

**Caso:** Desvincular pasarela Stripe (carrier) + borrado en cascada de wallets/tarjetas de pasajeros.
**Scope:** Regression-driven (micro, 1 TC). **Estrategia release:** regresión completa en TEST, smoke en UAT/PROD.
**Estado:** Código entregado (sandbox runnable + helper DB). Pendiente: run live en carrier vinculado + promoción a KATA.

## 1. Hallazgo que condiciona el diseño (code-grounded)

| Hecho | Evidencia |
|---|---|
| La feature es **legacy-only** | `magiis-fe` (Angular 5): `global-integrations.html` (cards Stripe/Vincular/Desvincular) + `carrier-integrations-list` con rutas activas en `admin.routing.ts`. |
| carrier-v2 **no** la tiene viva | `magiis-fe-carrier-v2/.../carrier.routing.ts`: `integrations/list` **comentado**. |
| Framework apunta a carrier-v2/apps-uat | `config/variables.ts`: `Environment = local\|staging`; `staging = apps-uat`. No hay env `apps-test`. |
| `LoginPage` KATA es carrier-v2 | ruta `/carrier/#/auth/login`, botón "Iniciar Sesión" — ≠ portal legacy (`#/authentication/login/carrier`, "Ingresar"). |

**Consecuencia:** un test KATA "regression-ready" para este flujo requiere env `test`+proyecto+auth legacy = **framework-development**, sobre un FE legacy en reemplazo. Por eso se entrega primero un **sandbox spec runnable** (sin cirugía de config) + el helper DB reusable.

## 2. Riesgos / constraints (QA)

1. **Irreversible + no idempotente.** Desvincular borra tarjetas/wallets; re-vincular es OAuth (Stripe Connect) → **no automatizable**. El test destruye su propia precondición ⇒ one-shot por vinculación. Mitigación: **skip-guard** (verifica `MGW_LINKED.ACTIVE=1` en DB; si no, `test.skip`).
2. **PROD peligroso.** Ejecutar la desvinculación en prod borraría tarjetas reales. Mitigación: **bloqueo duro** por host + **dry-run por defecto** (solo `ALLOW_DESTRUCTIVE_UNLINK=true` ejecuta el paso destructivo, solo en TEST). Smoke UAT/PROD = read-only (asserta estado de la card).
3. **Datos de cascada** dependen de que exista un pasajero con wallet/card (`emanuel.restrepo@yopmail.com`).

## 3. Artefactos entregados

| Archivo | Rol |
|---|---|
| `tests/gateway-legacy/support.ts` | Helpers compartidos i18n-proof: `loginCarrierLegacy`, `gotoGatewayCard`, `readGatewayState`, `gatewayConfig`, `isProdHost`. |
| `tests/gateway-legacy/link-stripe-gateway.test.ts` | **TC-GATEWAY-LINK-STRIPE-01**: vincular Stripe vía Connect test-mode (`test-mode-fill-button` → redirect `?code=`). Restaura la precondición del unlink → **ciclo repetible**. Stripe-onboarding derivado del record, pend. verificación live. |
| `tests/gateway-legacy/unlink-stripe-gateway.test.ts` | Spec runnable (proyecto `gateway-legacy`): login legacy + flujo UI + assertions + validación DB. Safe-by-default (dry-run). **Trackeado** (no sandbox). |
| `playwright.config.ts` | Nuevo proyecto `gateway-legacy` (sin `ui-setup` ni storageState de carrier-v2; aislado). |
| `tests/utils/db/oracleClient.ts` | Helper Oracle thin-mode (fail-fast) + `withOracleTest` / `queryRows` / `queryCount`. |
| `tests/utils/db/paymentGatewayDb.ts` | Queries de dominio: `getGatewaySnapshot` (activeLinks / userWallets / gatewayCards). |
| `config/variables.ts` | Bloque additivo `config.db.oracleTest` (lee `ORACLE_*_TEST`; respeta single-source). |
| `package.json` | devDep `@types/oracledb`. |

## 4. Locators i18n-proof (validados en vivo; reemplazan el `nth(5)` del record)

> La UI corre en EN o ES según `Accept-Language` (playwright.config fuerza `en`). Por eso NO se usan textos ("Desvincular"/"Vincular") sino estructura/clases.

- **Login legacy:** `input[type="text"]` + `input[type="password"]` + `button[type="submit"]`; éxito = `waitForURL(/home\/carrier\/dashboard/)`.
- **Card Stripe:** `.card` filtrada por `.card-subtitle` = "Stripe" (marca invariante).
- **Estado (clase de color, ver `global-integrations.html`):** vinculado → `a.red-text` (`stripe()` → unlink); desvinculado → `a.green-text`. Esperar `a.red-text, a.green-text` visible antes de leer (aparece al resolver `validatingStripe`/`stripeUri`).
- **Diálogo:** `.modal-content` + confirmar `.modal-footer button.btn-primary`.
- **Creds/URL:** vars dedicadas `GATEWAY_BASE_URL` / `GATEWAY_CARRIER_EMAIL` / `GATEWAY_CARRIER_PASSWORD` — **NO** usar `BASE_URL`/`USER_CARRIER` del `.env` (apuntan a apps-uat/otro carrier).

## 5. Validación

- `bun run types:check` ✅ · `bun run lint:check` ✅
- **Run live (dry-run) ✅** contra apps-test (carrier 1521): login + navegación + card Stripe + lectura de estado + conexión/queries Oracle TEST, todo verde. Gate destructivo frena antes del paso irreversible.
- Run **destructivo**: pendiente — lo ejecuta el usuario en TEST con `ALLOW_DESTRUCTIVE_UNLINK=true` y carrier vinculado.

## 5.1. Hallazgos QA (de la corrida en vivo)

1. **Discrepancia UI↔DB del estado Stripe:** la card mostró **linked (Unlink)** mientras `MGW_LINKED.ACTIVE=1` = 0 filas. La UI probablemente deriva el estado de la cuenta **Stripe Connect** (no de `MGW_LINKED`). ⇒ el cascade real se valida por `USER_WALLET`/`CARD` → 0, no por `MGW_LINKED`. **Vale investigar** si el "desvincular" anterior dejó la cuenta Connect a medias.
2. **i18n rompe locators por texto:** el record (ES) falla bajo `Accept-Language: en`. Confirmado que estructura/clases son la vía correcta.
3. **Estado del anchor es asíncrono:** `a.red-text/green-text` aparece recién al resolver la validación de Stripe; hay que esperarlo (posible flakiness si se lee antes).

## 6. Cómo ejecutar

```bash
# Dry-run (seguro): login + estado de la card + evidencia DB, NO desvincula
bun playwright test --project=gateway-legacy

# Destructivo (solo TEST, carrier vinculado):
ALLOW_DESTRUCTIVE_UNLINK=true bun playwright test --project=gateway-legacy
```
Overrides por env (prefijo `GATEWAY_` para no colisionar con `.env`): `GATEWAY_BASE_URL`, `GATEWAY_CARRIER_EMAIL`, `GATEWAY_CARRIER_PASSWORD`, `GATEWAY_CARRIER_ACCOUNT_ID`, `GATEWAY_PASSENGER_EMAIL`.

## 7. Promoción a KATA (siguiente fase — `/framework-development`)

Para que entre en el `regression` del boilerplate (no sandbox):
1. Añadir env `test` (apps-test) a `config/variables.ts` (Environment + envDataMap + creds).
2. Proyecto Playwright `regression-legacy` con auth-setup del portal legacy (o login inline sin storageState).
3. Extraer a componentes KATA: `CarrierLegacyLoginPage` (Steps de precondición) + `CarrierIntegrationsPage` con `@atc('TC-GATEWAY-UNLINK-STRIPE-01') unlinkPaymentGatewaySuccessfully(company)`; registrar en `UiFixture`; `bun run kata:manifest`.
4. Alternativa recomendada a evaluar: alojar este flujo gateway+DB en **magiis-playwright** (ya tiene specs gateway-pg + harness Oracle/wallets), en lugar del boilerplate (hub carrier-v2).
