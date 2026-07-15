# Business API Map — MAGIIS Carrier

> **Reverse-engineered, read-only survey (2026-07-13).** Business-first narrative of how the
> Carrier operates through the backend API. Reconstructed from on-disk automation-repo artifacts +
> the source-generated OpenAPI spec; no live backend Java source or Oracle DDL was read
> (see [Discovery Gaps](#discovery-gaps)). Every claim cites its source. Aligned with — not
> duplicating — `.context/SRS/architecture.md`, `.context/infrastructure/backend.md`, and
> `.context/business/business-data-map.md`.
>
> **This is NOT an endpoint catalog.** Full route inventory lives in `scripts/backend-route-catalog.json`
> and the `openapi.yaml` spec; TypeScript types come from `bun run api:sync` → `api/schemas/`.
>
> Last verified against OpenAPI on 2026-07-13.
>
> **Sources**
> - `magiis-api-e2e/openapi.yaml` — source-generated OpenAPI 3.0 spec (info/servers/security/paths). **[OPENAPI]**
> - `magiis-api-e2e/scripts/backend-route-catalog.json` — controller→"VERB handler"→route (source-derived). **[ROUTE-CAT]**
> - `magiis-api-e2e/scripts/backend-dtos.json` — per-endpoint request DTO. **[DTO-MAP]**
> - `magiis-api-e2e/docs/reference/backend-endpoints-v1.72.2.md` — stack, public endpoints, verb split, central tables. **[BE-DOC]**
> - `magiis-api-e2e/docs/reference/fe-endpoint-usage.md` — per-client live-vs-dead endpoint usage. **[FE-USE]**
> - `magiis-api-e2e/tests/clients/magiis-api-client.ts` — auth flow + URL building. **[CLIENT]**
> - `magiis-api-e2e/tests/config/runtime.ts` — env / base-URL / prefix resolution. **[RUNTIME]**

---

## 1. Executive summary

The MAGIIS backend lets a **Carrier operator** run a mobility/dispatch business end to end: create
and price trips, assign drivers and vehicles, take payment, and settle money across contractors,
drivers, owners and passengers. A carrier user authenticates once (`POST auth/login` with header
`RoleToAttempt: ROLE_CARRIER`), receives a JWT, and drives every subsequent operation as
`Authorization: Bearer <token>` [CLIENT L37-58; BE-DOC L21]. From the operator's seat the core
loop is: **simulate a trip's price → create the trip → adjust its costs → confirm → finalize →
settle** — all against a single Spring Boot monolith over Oracle [BE-DOC L17; SRS System Context].

The API is large (767 REST endpoints / 63 controllers per the v1.72.2 doc; 787 / 65 per the
source-derived catalog [BE-DOC L18; ROUTE-CAT `_meta`]) but the money-touching surface is
concentrated in a handful of controllers: `TravelController` (~78), `BillingController` (24), the
four `Carrier*LiquidationController`s, `PaymentController`/`CardController`, and the trip-pricing
pair `TravelController` + `CarrierOtherCostController` [ROUTE-CAT; BE-DOC L34-36]. The **active QA
target this session** — trip **Other Costs** on travel edition (MX-6024 back / MX-6052 front) —
lives exactly on that pricing surface: `TravelController.updateTravel` / `calculateTravelCost`
plus the `CarrierOtherCostController` `otherCosts/{new,update,search,delete}` CRUD
[ROUTE-CAT L288-292, L809, L850; DTO-MAP].

> **Context notes.** `business-feature-map.md` was still a stub at generation time, so feature-ID
> (FEAT-NNN) cross-references below are marked *pending feature-map*; journey selection leaned on
> the data-map flows + code scan instead (logged in §Discovery Gaps). `business-data-map.md` was
> present and its entities/flows anchor every journey here.

---

## 2. Auth model

Single JWT-bearer scheme. There is no session cookie, API key, or OAuth login for the app itself
(third-party OAuth returns exist only at the payment integration boundary — see §5). Roles are
selected at login time via a request header and carried inside the JWT `roles` claim
[INFRA-BE `backend.md` L24; BE-DOC L21].

| Tier | Who it applies to | How to acquire | Where enforced (evidence) |
|---|---|---|---|
| **Public / unauthenticated** | Anonymous callers (signup, recovery, catalogs) | none — bounded allow-list | Backend allow-list [BE-DOC L43-47]; `security: [bearerAuth]` global with per-endpoint exceptions [OPENAPI L15-16] |
| **Authenticated (JWT)** | Any logged-in user | `POST auth/login` → `.token` | `Authorization: Bearer` on every call [CLIENT L100-102]; `bearerAuth` = `http`/`bearer`/`JWT` [OPENAPI L25101-25105] |
| **Role-scoped** | Carrier / admin / driver / passenger / contractor / owner | `RoleToAttempt: ROLE_<ROLE>` at login; role in JWT claim | Header set from config [CLIENT L32,L44]; per-actor controllers (`AdminUserController`, `DriverAccountController`, `PassengerUserController`, `ContractorAccountController`, `OwnerPortalController`) [ROUTE-CAT] |
| **Tenant/owner-scoped** | A specific carrier's data | `{carrierId}` path segment on nearly every route | Path-scoped routes e.g. `carriers/{carrierId}/travels/...` [ROUTE-CAT TravelController] |

**Carrier login** (the scheme this repo automates): `POST auth/login`, header
`RoleToAttempt: ROLE_CARRIER`, body `{ "username", "password" }`, response `200 { "token": "<jwt>" }`.
The client throws on non-200 and on a missing `.token` field [CLIENT L40-56; INFRA-BE `backend.md` L40-53].
The backend `CredentialsDTO` also accepts `secureKey`/`token` variants, but the automation client only
sends username/password [INFRA-BE `backend.md` L49-51].

**Public / unauthenticated endpoint set** (no JWT) [BE-DOC L43-47]: login / master login · carrier
& contractor solicitude creation + confirmation · passenger registration · password recovery/change
· user-existence check · country catalog · `config/serverInfo`.

Token flow (primary — and only — scheme):

```
Carrier user                Backend (magiis-v0.2)
    |                              |
    |  POST auth/login             |
    |  H: RoleToAttempt=ROLE_CARRIER
    |  { username, password }      |
    | ---------------------------> |  validate creds + role
    |                              |  mint JWT (roles claim)
    |  200 { token: <jwt> }        |
    | <--------------------------- |
    |                              |
    |  GET/POST/PUT/DELETE ...      |
    |  H: Authorization: Bearer <jwt>
    | ---------------------------> |  verify JWT -> handler
    |  200 / 4xx / 5xx             |
    | <--------------------------- |
    |                              |
    |  (401 -> client re-login / FE logout)  [INFRA-FE AuthInterceptor]
```

No refresh handshake is exercised by the automation client (it caches the token in memory and
re-issues via `forceLogin`) [CLIENT L37-62]; a backend `POST users/refreshToken` route does exist
[ROUTE-CAT UserController] — refresh recipe not automated (gap).

---

## 3. Environments & base URLs

> **CRITICAL — do not double-prefix.** The OpenAPI `servers:` URLs already include the route prefix
> (`.../magiis-v0.2`). The automation client instead splits them: `BASE_URL` = **host+protocol only**
> and `MAGIIS_API_PREFIX` = `magiis-v0.2/` as a **separate** segment, joined once in
> `buildUrl()` as `${baseUrl}/${magiisPrefix}/${path}` [CLIENT L66-69; RUNTIME L41-56]. When wiring a
> new client, pick ONE convention — either a full base that already contains `magiis-v0.2`, OR
> host + separate prefix — never concatenate the prefix twice.

| Env | Full base (host + prefix) | Client `BASE_URL` (host only) | Source |
|---|---|---|---|
| **TEST** (default) | `https://apps-test.magiis.com/magiis-v0.2` | `https://apps-test.magiis.com` | [OPENAPI L9-10]; default `ENV=test` [RUNTIME L34-39] |
| **UAT** (staging) | `https://apps-uat.magiis.com/magiis-v0.2` | `https://apps-uat.magiis.com` | [OPENAPI L11-12] |
| **DEV** | `http://apps-dev2.magiis.com:8080/magiis-v0.2` | `http://apps-dev2.magiis.com:8080` | [OPENAPI L13-14] — non-TLS, port 8080 |
| **PROD** | `https://api.apps.magiis.com/` (prefix unconfirmed) | — | `.agents/project.yaml` `environments.production.api_url` — **NEEDS CONFIRM**, not in OPENAPI servers [INFRA-BE `backend.md` L34,L155-157] |

- Route prefix resolution: `MAGIIS_API_PREFIX` env, default `magiis-v0.2/`, trimmed of leading/trailing
  slashes [RUNTIME L47-49].
- Auth URL: `AUTH_API_URL` override, else `{BASE_URL}/{prefix}/auth/login` [RUNTIME L51-56].
- Env selector: `ENV=test|uat|prod`; unknown values fall back to `test` with a warning [RUNTIME L34-39].
- Credentials come from `.env.<env>` (`LOGIN_USER`/`LOGIN_PASSWORD`, empty in `.env.example`) — never
  committed [INFRA-BE `backend.md` L158-159].

---

## 4. Critical endpoints

Grouped by business domain. **$ = money-touching** (fares, payment, settlement). **★ = business-critical**
(core value or high blast radius). Routes are relative to `{base}/magiis-v0.2/`. Full request/response
schemas → `openapi.yaml`; do not restate them here.

### 4.1 Trip pricing & other costs — ACTIVE QA TARGET (MX-6024 / MX-6052) ★ $

The pricing surface. A trip's price = base rate + simulation + `otherCosts[]`; editing a trip's other
costs re-runs the simulation and re-prices the trip [DATA-MAP Flow 2].

| Method / path | Handler | Request DTO | Note |
|---|---|---|---|
| `POST carriers/{carrierId}/travels/simulate` | `TravelController.simulate` | `TravelCreateRequestDTO` | price a prospective trip ★ $ [ROUTE-CAT L828; DTO-MAP L233] |
| `POST carriers/{carrierId}/travels/simulateAll` | `TravelController.simulateAll` | `TravelCreateRequestDTO` | simulate all payment methods $ [ROUTE-CAT L829; DTO-MAP L232] |
| `POST carriers/{carrierId}/travels/budget` | `TravelController.budGetCalculateTravelCost` | `TravelBudGetRequestDTO` | budget calc $ [ROUTE-CAT L808; DTO-MAP L234] |
| `POST carriers/{carrierId}/travels/{travelId}/calculateCost` | `TravelController.calculateTravelCost` | `FinalizeTravelRequestDTO` | recompute a trip's cost ★ $ [ROUTE-CAT L809; DTO-MAP L241] |
| `PUT carriers/{carrierId}/travels/{travelId}/update` | `TravelController.updateTravel` | `TravelUpdateRequestDTO` | **MX-6024 root** — else-branch moved the sim's orphan-delete collection → rollback → 404 ★ $ [ROUTE-CAT L850; DTO-MAP L249; DATA-MAP Flow 2] |
| `POST carriers/{carrierId}/otherCosts/new` | `CarrierOtherCostController.addCarrierOtherCost` | `CarrierOtherCostRequestDTO` | create carrier other-cost concept $ [ROUTE-CAT L289; DTO-MAP L90] |
| `PUT carriers/{carrierId}/otherCosts/update` | `CarrierOtherCostController.updateCarrierOtherCost` | `CarrierOtherCostRequestDTO` | update concept $ [ROUTE-CAT L292; DTO-MAP L91] |
| `POST carriers/{carrierId}/otherCosts/search` | `CarrierOtherCostController.searchCarrierOtherCostSearch` | `CarrierOtherCostSearchRequestDTO` | **MX-6052 surface** — edit modal lists concepts; select emptied by currency filter $ [ROUTE-CAT L291; DTO-MAP L93; DATA-MAP Flow 2] |
| `POST carriers/{carrierId}/otherCosts/delete` | `CarrierOtherCostController.deleteCarrierOtherCost` | `CarrierOtherCostRequestDTO` | delete concept $ [ROUTE-CAT L290; DTO-MAP L92] |
| `GET carriers/{carrierId}/travels/{travelId}/otherCost/{otherCostId}` | `TravelController.getOtherCost` | — | per-trip other-cost line read [ROUTE-CAT L782] |
| `PUT carriers/{carrierId}/travels/{travelId}/otherCost/{otherCostId}` | `TravelController.updateOtherCost` | `TravelOtherCostDTO` | per-trip other-cost line update $ [ROUTE-CAT L849; DTO-MAP L252] |

> Two distinct "other cost" surfaces: the **carrier catalog** concept CRUD (`CarrierOtherCostController`,
> `carriers/{carrierId}/otherCosts/*`) vs. the **per-trip line item** on a travel
> (`TravelController .../travels/{travelId}/otherCost/*`). MX-6052 hits the catalog *search*; MX-6024
> hits the per-trip collection during `updateTravel`.

### 4.2 Travel lifecycle ★

`create → assign → confirm → (in progress) → finalize`, plus cancel/clone/pay/rate
[DATA-MAP Flow 1]. Selected [ROUTE-CAT TravelController]:

| Method / path | Handler | DTO |
|---|---|---|
| `POST carriers/{carrierId}/travels` | `create` ★ | `TravelCreateRequestDTO` [DTO-MAP L235] |
| `POST carriers/{carrierId}/travels/{travelId}/assign` | `assignTravel` | `ConfirmTravelRequestDTO` [DTO-MAP L239] |
| `POST carriers/{carrierId}/travels/{travelId}/confirm` | `confirmTravel` ★ | `ConfirmTravelRequestDTO` [DTO-MAP L237] |
| `POST carriers/{carrierId}/travels/{travelId}/finalize` | `finalize` ★ $ | `FinalizeTravelRequestDTO` [DTO-MAP L242] |
| `POST carriers/{carrierId}/travels/{travelId}/pay` | `payTravel` $ | `PayTravelRequestDTO` [DTO-MAP L244] |
| `PUT carriers/{carrierId}/travels/{travelId}/cancel` | `cancelTravel` | `CancelTravelRequestDTO` [DTO-MAP L240] |
| `POST carriers/{carrierId}/travels/{travelId}/clone` | `cloneTravel` | — [ROUTE-CAT L810] |
| `GET carriers/{carrierId}/travels/paginated` | `getTravelsPaginated` | — **known bug** SQLGrammarException, live in prod [FE-USE L30] |

### 4.3 Billing, payment & settlement $ ★

| Method / path (sample) | Controller | Note |
|---|---|---|
| `GET billing/carriers/{carrierAccountId}/travels` | `BillingController` | invoiceable trips $ [ROUTE-CAT L113] |
| `carrierContractorLiquidations/...`, `carrierUserLiquidations/...` | `Carrier{Contractor,Driver,Owner,User}LiquidationController` | per-party settlement $ ★ [ROUTE-CAT] |
| `CheckingAccountController` routes | `CheckingAccountController` | running balance per party $ [ROUTE-CAT] |
| `PaymentController` / `CardController` | payment instruments + movements $ | `PUT payments/movement/{id}/invalidate` `@Deprecated`/likely dead [FE-USE L39] |

### 4.4 Auth, users & account provisioning

| Method / path | Handler | Tier |
|---|---|---|
| `POST auth/login` | login | public [BE-DOC L43] |
| `POST users/refreshToken` | `UserController.refreshToken` | authenticated [ROUTE-CAT L857] |
| `PUT users/{userId}/changePassword` | `changePassword` | public (recovery) [ROUTE-CAT L862] |
| `POST users/searchEmailExists` | user-existence check | public [ROUTE-CAT L860; BE-DOC L46] |
| carrier/contractor solicitude create + `PUT .../confirm/{solicitudeToken}` | account provisioning | public (email link) [BE-DOC L44-45, L108] |

### 4.5 Quotes, GNet/affiliate dispatch, admin ★

| Method / path | Controller | Note |
|---|---|---|
| `POST quotes/simulate` | `QuoteController.simulateQuote` | `@Deprecated` — **confirmed dead** in all 4 clients [FE-USE L37] |
| `POST quotes/simulateAllByPaymentMethods` | `QuoteController` | live quote pricing $ [ROUTE-CAT L735] |
| `odn/...` inbound + `ODNController` (16 routes) | `ODNController` | external farm-in/out dispatch ★ [ROUTE-CAT; BE-DOC L107] |
| `AffiAgreementController` / `AffiOSTravelController` / `AffiCheckingAccountController` | affiliate (eAfiliado/ATC) | inter-carrier agreements + settlement $ [ROUTE-CAT] |
| `GET admins/paginated` | `AdminUserController` | **known bug** 500 with CARRIER role, live [FE-USE L31] |

---

## 5. Architecture behind the API

Single Spring Boot 2.0.0 monolith (Java 8, JPA/Hibernate, Oracle10g dialect), deployed as a WAR under
the `/magiis-v0.2` servlet context; layering is Controller → Service → JPA Repository → Oracle
[BE-DOC L17; INFRA-BE `backend.md` L8-23; SRS Container Structure].

```
Clients                     Monolith (deploy /magiis-v0.2)                Data / External
------------------          --------------------------------------        ---------------------
Carrier V2 (Angular 18) --\   +----------------------------------+
Carrier V1 (legacy)     ---> |  @*Mapping Controllers (63-65)   |  ----> Oracle DB
Driver/Pax mobile       --/  |     (JWT bearer verify)          |        (271 entities,
Contractor / Owner      --/  +----------------------------------+         ~2594 cols,
                             |  Services (business rules)       |         251 migrations)
                             +----------------------------------+
                             |  JPA Repositories (259)          |  ----> Firebase / MercadoPago
                             +----------------------------------+        Stripe / Mailchimp /
                             |  18 @Scheduled jobs (async)      |        Google Maps / ODN-GNet /
                             +----------------------------------+        WhatsApp / Melita
```

| Component | Role | Persistence / integrations touched | Why it matters for QA |
|---|---|---|---|
| Controllers (63-65) | REST surface, JWT verify, path-scoping by `{carrierId}` | — | Where auth + tenant-scoping bugs surface (e.g. `admins/paginated` 500 with CARRIER [FE-USE L31]) |
| Services | Business rules incl. trip pricing/simulation | Oracle via repositories | Pricing correctness lives here — MX-6024 was a service-layer collection-lifecycle bug (orphan-delete on `updateTravel`) [DATA-MAP Flow 2] |
| JPA repositories (259) | Oracle persistence | Oracle | A malformed query = user-visible 500 (SQLGrammarException on `travels/paginated` [FE-USE L30]) |
| `@Scheduled` jobs (18) | Async work (recurring trips, liquidations, ODN recon, notifications) | Oracle + external | Off-request-path effects; hard to observe from a single API call [DATA-MAP Triggers] |
| Oracle DB | Single source of truth; `travel`/`travel_history`/`quotes`/`odn_trip_requests` are the hottest tables | — | A hung DB stalls every authenticated call — monolith has no read replica evidenced [BE-DOC L38-41] |

Deployment shape: servlet-container WAR (not serverless) — one process fronts all clients; failure
blast radius is global, not per-endpoint [INFRA-BE `backend.md` L17, L153].

---

## 6. External integrations

All third-party calls are **backend-mediated — validate through the backend, never against the
provider** [BE-DOC L100-103]. Failure modes below are inferred from the integration type where no
service source is on disk (gap — see §7).

| Service | Trigger | Direction | Failure mode (user-visible) | Journeys affected |
|---|---|---|---|---|
| MercadoPago | trip payment; OAuth vendor onboarding | Outbound sync + inbound OAuth return (`VendorController`) | payment declined/timeout → trip pay stalls; OAuth return lost → vendor not linked | Trip pay, settlement [BE-DOC L102,L109] |
| Stripe | trip payment; OAuth vendor onboarding | Outbound sync + inbound OAuth return (`VendorController`) | same as MercadoPago | Trip pay, settlement [BE-DOC L102,L109] |
| Firebase Admin | trip/state notifications | Outbound async (FCM + RTDB) | missed push → user not notified (trip still valid) | Trip lifecycle, dispatch [BE-DOC L102] |
| Google Maps / Places | address geocode / route on simulate & create | Outbound sync (`PlacesController`) | geocode fail → cannot price/create trip | Trip simulate/create [BE-DOC L102] |
| ODN / GNet | farm-in/out dispatch | Outbound + inbound webhooks (`odn/...`, `ODNController` 16) | dispatch not accepted / webhook missed → trip stuck awaiting external carrier | GNet/affiliate dispatch [BE-DOC L102,L107] |
| Mailchimp | marketing email | Outbound async (`MailchimpEmailController` 15) | email not sent (non-blocking) | Marketing/comms [BE-DOC L102; ROUTE-CAT] |
| WhatsApp Business (Meta) | messaging | Outbound (`WhatsappBusinessIntegrationController` 9) | message not delivered (non-blocking) | Comms/notifications [BE-DOC L103; ROUTE-CAT] |
| Melita | branch / AI service | Outbound (`AIController` `melita/...`) | AI-branch lookup fails → feature degraded | `melita/ai-branches` screen [BE-DOC L103; ROUTE-CAT] |

Inbound callbacks: ODN/GNet dispatch (`odn/...`); public account confirmation
`PUT .../confirm/{solicitudeToken}` (email link); payment OAuth returns in `VendorController`
[BE-DOC L105-109].

---

## 7. Cross-references

- **Data-map entities this API exposes** → `.context/business/business-data-map.md`
  §Core Entities (Travel, SimulationPriceInformation, TravelOtherCostSim, OtherCost concept, Quote,
  Carrier account, Driver, Vehicle, Owner, Contractor, Passenger, Billing/Payment,
  Liquidation/CheckingAccount, Affiliate agreement, GNet/ODN request, RecurringTrip) and
  §System Flows (Flow 1 travel lifecycle, Flow 2 other-costs MX-6024/6052, Flow 4 settlement).
- **Feature-map features this API backs** → `.context/business/business-feature-map.md`
  **(pending — file was a stub at generation; FEAT-NNN links to be added when the feature-map is generated).**
- **Architecture / security detail** → `.context/SRS/architecture.md` (Security Model, Container
  Structure) and `.context/infrastructure/backend.md` (Auth flow, Environments).
- **Full endpoint specs (request/response schemas)** → `magiis-api-e2e/openapi.yaml` and
  `magiis-api-e2e/scripts/backend-route-catalog.json`.
- **TypeScript types for request/response shapes** → `bun run api:sync` → `api/schemas/`.

---

## Discovery Gaps

- **Backend Java source not read.** Controller/service internals, exact `ROLE_*` string set, refresh
  handshake, and per-integration retry/idempotency contracts are inferred from route catalog + DTO map
  + endpoint doc [ROUTE-CAT][DTO-MAP][BE-DOC]; confirm against `magiis-be` (path in [ROUTE-CAT] `_meta`).
- **Integration failure modes inferred.** §6's user-visible failure column is derived from integration
  type, not from observed service code (no timeout/retry/circuit-breaker source on disk).
- **PROD base URL + prefix unconfirmed.** `https://api.apps.magiis.com/` comes from `.agents/project.yaml`,
  not OPENAPI servers, and omits the `magiis-v0.2` prefix shown for other envs — confirm host+prefix on
  a live PROD deploy [INFRA-BE `backend.md` L155-157].
- **feature-map not yet generated.** FEAT-NNN cross-references (§7) are pending; journey/endpoint→feature
  mapping relied on the data-map + code scan alone.
- **Version / count drift.** 63 vs 65 controllers, 767 vs 787 endpoints, 737 paths / 802 operations in
  the source-generated OPENAPI — treat counts as approximate [BE-DOC L18; ROUTE-CAT `_meta`; INFRA-BE L149-151].
- **Live-vs-dead only partially closed.** `fe-endpoint-usage.md` covers carrier×2 + driver (357/717 live);
  pax builds routes at call-sites (not statically extractable) and contractor/admin portals were not
  scanned, so "unused" endpoints are not safely deprecable [FE-USE L20-24, L49-52].
- **Refresh-token flow not automated.** `POST users/refreshToken` exists but the automation client caches
  in memory and re-logins via `forceLogin` — refresh contract unverified [CLIENT L37-62; ROUTE-CAT L857].

---

*Reverse-engineered business-api-map · read-only survey · 2026-07-13. Narrative complement to
business-data-map.md; NOT an endpoint catalog.*
