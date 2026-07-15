# Business Model — MAGIIS Carrier

> Fase 1 (Constitution) · discovery reverse-engineering desde `magiis-fe` (Angular 5) · scope: portal **Carrier**.
> Fuente primaria: código, rutas, enums e i18n. No hay diseño aspiracional — solo lo verificable.

## Problema que resuelve

El portal **Carrier** es la **consola de operaciones y back-office de una empresa de transporte de pasajeros/carga** (taxi/remis/flota con despacho). Permite a un carrier gestionar flota, choferes, clientes y viajes de punta a punta: tomar/despachar solicitudes de viaje, tarifarlos con motores de precio configurables, monitorear la operación en vivo sobre mapa, y liquidar dinero con choferes, propietarios de vehículos, pasajeros y clientes corporativos.

Found in: `src/app/carrier/carrier.routing.ts`, `src/app/carrier/carrier.component.ts`.

## Usuarios (roles del portal)

De `MagiisRoleEnum` y el guard en `app.routing.ts` (líneas 26-40):

| Rol (code) | Descripción |
|---|---|
| `ROLE_CARRIER` | Administrador del carrier |
| `ROLE_CARRIER_OPERATOR` | Operador / despachador |
| `ROLE_CARRIER_MANAGER` | Gerente |
| `ROLE_CARRIER_ADMINISTRATIVE` | Administrativo (facturación/liquidaciones) |
| `ROLE_CARRIER_MAP_VIEWER` | Solo lectura, visor de mapa |

Found in: `src/app/services/enum/magiisRoleEnum.enum.ts`, `src/app/app.routing.ts`.

## Propuesta de valor

Una sola consola para:
1. **Despachar y trackear viajes en tiempo real** — Control de Operaciones (`dashboard`) + Visor de Mapa (`map-viewer`).
2. **Automatizar pricing** — Tarifadores / reglas de tarifa (diaria/semanal/alta demanda, segmentos de distancia, ida y vuelta, espera, peajes, costo financiero).
3. **Gestionar la red comercial** — pasajeros individuos, empresas corporativas, choferes, propietarios de vehículos.
4. **Liquidación financiera** — liquidaciones, cuentas corrientes, cierres de caja, adelantos.
5. **Intercambio de viajes entre carriers** — GNET Farm-In/Farm-Out y red de afiliados eAfiliados/ATC.

## Contexto de mercado

- **SaaS multi-región / multi-moneda.** Locales `es-ar` + `en-us`; `currencyEnum`, `country-iso.enum`, árbol de enums `multiregion`.
- Found in: `src/assets/i18n/es-ar.json`, `src/app/enums/multiregion/**`, `src/app/services/enum/currencyEnum.enum.ts`.
- Integraciones externas de alto riesgo (relevante para QA): **Stripe/3DS** (fuerte en el backlog MG), **MercadoPago**, Authorize.net/EbizCharge, Mailchimp, WhatsApp Business, Firebase (push), reCAPTCHA. Found in: `carrier/integrations/**`, `carrier/global-integrations/**`, environments.

## Discovery Gaps

- [ ] Modelo de ingresos exacto (comisiones por viaje, suscripción, o mixto): inferido de `reports/agency-commissions` y `configured-commissions` pero no confirmado.
- [ ] Significado de negocio de los códigos `TravelChannelEnum` (MA, MI, W, WC, AFI, SG, TG, FC, FP): abreviaturas sin comentarios en código.
- [ ] Función precisa de MELITA (IA sucursales) e integraciones Signal/IVR: labels mínimos.
- [ ] Otros portales (contractor/owner/admin/quote): fuera de scope Carrier — pendientes.
