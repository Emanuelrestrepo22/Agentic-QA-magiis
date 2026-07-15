# Business Data Map — MAGIIS Carrier

> **Reverse-engineered, read-only survey (2026-07-13).** Reconstructed from on-disk automation-repo
> artifacts + embedded application source; no live backend Java source or Oracle DDL was read
> (see [Discovery Gaps](#discovery-gaps)). Aligned with `.context/SRS/architecture.md`,
> `.context/infrastructure/backend.md`, and `.context/business/domain-glossary.md` — vocabulary not duplicated.
>
> **Sources**
> - `magiis-api-e2e/scripts/backend-route-catalog.json` — controller→route inventory (source-derived). **[ROUTE-CAT]**
> - `magiis-api-e2e/scripts/backend-dtos.json` — controller→request-DTO map. **[DTO-MAP]**
> - `magiis-api-e2e/docs/reference/backend-endpoints-v1.72.2.md` — stack, entities, central tables, jobs, public endpoints. **[BE-DOC]**
> - `magiis-api-e2e/docs/reference/fe-endpoint-usage.md` — per-client endpoint usage, live-vs-dead. **[FE-USE]**
> - `magiis-carrier-v2-e2e/refs/v2/src/app/**` — active Carrier V2 frontend (Angular 18). **[FE-V2]**
> - `magiis-carrier-v2-e2e/tests/pages/carrier-v2/**` + `tests/fixtures/factories/**` — POM feature map + entity factories. **[POM]/[FACT]**

---

## Executive summary

MAGIIS is a mobility / dispatch platform. The **Carrier** domain (fleet operator) manages **trips
(travels)**, drivers, vehicles, owners, contractors and passengers, computes **fares** (base rate +
simulation + **other costs**), and settles money across parties (**liquidations / checking accounts**).
Everything runs through a single Spring Boot monolith over Oracle [BE-DOC L17]. The active QA target
this session — trip **Other Costs** on travel edition — spans the pricing/simulation cluster (back
`TravelController` + `CarrierOtherCostController`; front `searchOtherCosts`/`addTravel` commands),
i.e. tickets **MX-6024** (back) + **MX-6052** (front).

---

## Core Entities

| Entity | Purpose | Evidenced by | Confidence |
|---|---|---|---|
| **Travel / Trip** | Central operational record — a transport job through its lifecycle | `travel` (86 cols) + `travel_history` (121) [BE-DOC L40-41]; `TravelController` (78) [ROUTE-CAT] | confirmed |
| **SimulationPriceInformation** | Per-trip price simulation holding fare breakdown | FE `TravelSimulateResponseDto` [FE-V2 simulateTravel]; MX-6024 root-cause | ~inferred (no DDL) |
| **TravelOtherCostSim** | Per-trip other-cost line item under a simulation | `otherCosts[]` in `IAddTravelCommandParameters` [FE-V2 addTravel L60]; MX-6024 | ~inferred (no DDL) |
| **OtherCost (concept)** | Carrier-level catalog of extra-cost concepts (peajes, extras) | `CarrierOtherCostController` `.../otherCosts/{new,update,search,delete}` [ROUTE-CAT]; `SettingsOtherCostsPage` [POM] | confirmed |
| **Quote (cotización)** | Priced trip offer, may originate a Travel | `quotes` (77) [BE-DOC L40]; `QuoteController` [ROUTE-CAT] | confirmed |
| **Carrier account** | Tenant operator account + config (rates, zones, service types) | `carrierAccount` (38) [BE-DOC L41]; `CarrierAccountController` (73) [ROUTE-CAT] | confirmed |
| **Driver** | Person executing trips | `DriverAccountController`/`DriverUserController` [ROUTE-CAT]; `driverFactory` [FACT] | confirmed |
| **Vehicle** | Transport unit | `VehicleController`/`VehicleOwnerController` [ROUTE-CAT]; `vehicleFactory` [FACT] | confirmed |
| **Owner** | Vehicle owner (settlement counterparty) | `VehicleOwnerController`/`OwnerPortalController`; `CarrierOwnerLiquidationController` [ROUTE-CAT] | confirmed |
| **Contractor / Client** | Corporate client contracting transport | `ContractorAccountController`, `ClientController`, `CostCenterController` [ROUTE-CAT] | confirmed |
| **Passenger** | End rider | `PassengerUserController` (54) [ROUTE-CAT] | confirmed |
| **Billing / Payment** | Invoicing + payment instruments | `BillingController` (24), `PaymentController`, `CardController` [ROUTE-CAT] | confirmed |
| **Liquidation / CheckingAccount** | Money settlement per party + running balance | `Carrier{Contractor,Driver,Owner,User}LiquidationController`, `CheckingAccountController` [ROUTE-CAT] | confirmed |
| **Affiliate agreement (eAfiliado/ATC)** | Farm-in/out agreements between carriers | `AffiAgreementController`, `AffiOSTravelController`, `AffiCheckingAccountController` [ROUTE-CAT] | confirmed |
| **GNet / ODN request** | External dispatch request (farm-in/out) | `odn_trip_requests` (72) [BE-DOC L40]; `ODNController` (16) [ROUTE-CAT] | confirmed |
| **RecurringTrip** | Scheduled/repeating trip template | `recurring_trips` (45) [BE-DOC L40]; `RecurringTripController` [ROUTE-CAT] | confirmed |

---

## System Flows

### 1. Travel lifecycle (core)
```
create/simulate → (assign driver+vehicle) → confirm → [in progress] → finalize/close
     │                                                          └→ clone → new travel
     └→ price = base rate + simulation + otherCosts[]
```
- Create/simulate: FE `addTravel` `POST carriers/{carrierUserId}/travels`, `simulateTravel`
  `POST .../travels/simulate` [FE-V2]; back `TravelController` create/assign/`calculateCost`/`budget`/
  `confirm`/`cloneTravel` [ROUTE-CAT]. Confirmed.
- Payment method, recurring flag, affiliate agreement carried on the create payload
  (`IAddTravelCommandParameters`, ~60 fields) [FE-V2 addTravel L10-84]. Confirmed.

### 2. Other Costs on travel edition (ACTIVE QA TARGET — MX-6024 / MX-6052)
```
open travel edit (mode=3) → open "Add Other Cost" modal
  → FE POST carriers/{carrierId}/otherCosts/search    (list concepts)   ← MX-6052: select empty
  → pick concept + amount → add to list → recalc price
  → Save → PUT carriers/{id}/travels/{travelId}/update (recalculateTripPrice=true,
           updateOthersCosts=false)                                       ← MX-6024: 404 rollback
```
- Front (MX-6052): `searchOtherCosts.command.ts` → `POST .../otherCosts/search`; the edit modal
  filtered concepts by currency and emptied the select [FE-V2]. Back (MX-6024): the `updateTravel`
  else-branch moved the old simulation's `all-delete-orphan` collection → Hibernate rollback → 404
  ACTION_NOT_ALLOWED (fix v1.72.6 clones each `TravelOtherCostSim`). Confirmed via tickets + FE source.

### 3. Quote → Travel
`QuoteController` produces a priced quote (`quotes` table) that can be converted into a Travel
[ROUTE-CAT; BE-DOC L40]. Flow steps inferred from controller surface (no service source).

### 4. Settlement / liquidation
Per-party liquidation controllers compute amounts owed to/from contractors, drivers, owners and
carrier users; balances tracked in `CheckingAccountController` [ROUTE-CAT]. Money-touching → high
QA risk. Steps inferred from controller surface.

### 5. GNet / affiliate farm-in-out
`ODNController` + `AffiAgreementController`/`AffiOSTravelController` dispatch trips to/from external
carriers; inbound `odn/...` webhooks return dispatch state [BE-DOC L107; ROUTE-CAT]. Inferred.

---

## State Machines

**Travel status** (inferred from route/DTO vocabulary + POM annotations — NOT from a verified enum):
```
DRAFT/SIMULATED → ASSIGNED → CONFIRMED → IN_PROGRESS → FINISHED
                                      └→ CANCELLED / LOST
```
- `travel.state` field exists per the domain glossary `Travel` DTO [domain-glossary L9]; concrete
  enum values and transition guards are **not on disk** — treat transitions as inferred (gap).
- Carrier V2 `travel/detail/:id` edit is gated by `mode=3` and blocked for FINISHED/LOST / Farm-In /
  One-Shot-offerer [POM `SettingsOtherCostsPage` + MX-6052 checklist context]. Inferred/confirmed-by-POM.

---

## Triggers & Scheduled Jobs

- Backend declares **18 `@Scheduled` jobs** [BE-DOC L19-20]. Their individual cron expressions and
  purposes are summarized only — job bodies are in the not-on-disk Java source (gap). Likely domains
  by controller adjacency: recurring-trip generation (`RecurringTripController`), liquidation runs,
  ODN/GNet reconciliation, notification/email dispatch. **Inferred** — confirm against `magiis-be`.

---

## Integrations

Backend-mediated — validate through the backend, never against the provider directly [BE-DOC L100-103]:

| Integration | Purpose | Signal |
|---|---|---|
| Firebase Admin | RTDB + FCM push | [BE-DOC L102] |
| MercadoPago | Payments | [BE-DOC L102]; OAuth return via `VendorController` |
| Stripe | Payments | [BE-DOC L102]; OAuth return via `VendorController` |
| Mailchimp | Email marketing | `MailchimpEmailController` (15) [ROUTE-CAT] |
| Google Maps / Places | Geocoding / routing | `PlacesController` [ROUTE-CAT] |
| ODN / GNet | External trip dispatch | `ODNController` (16) + inbound `odn/...` webhooks [BE-DOC L107] |
| WhatsApp Business (Meta) | Messaging | `WhatsappBusinessIntegrationController` (9) [ROUTE-CAT] |
| Melita | Branch / AI service | `AIController` `melita/...` + FE `melita/ai-branches` [ROUTE-CAT; FE-V2] |

**Inbound webhooks / callbacks** [BE-DOC L105-109]: ODN/GNet dispatch (`odn/...`); public account
confirmation `PUT .../confirm/{solicitudeToken}` (email link); payment OAuth returns in `VendorController`.

---

## Discovery Gaps

- [ ] **Backend Java source not read** — flows, service logic, and job bodies inferred from route
      catalog + endpoint doc [ROUTE-CAT][BE-DOC]. Confirm against `magiis-be` (path in [ROUTE-CAT] `_meta`).
- [ ] **No Oracle DDL** — entity list, PK/FK, and the simulation/other-cost table names
      (`SIMULATION_PRICE_INFORMATION` / `TRAVEL_OTHER_COST_SIM`, MX-6024) are `~inferred` from DTO/route
      names, not verified schema.
- [ ] **Travel state machine** — enum values + transition guards not on disk; transitions inferred.
- [ ] **18 @Scheduled jobs** — only the count is documented; individual triggers/purposes unknown.
- [ ] **Integration inventory** — provider list is confirmed at controller level; per-flow contracts
      (payloads, retry, idempotency) not on disk.
- [ ] **Version / count drift** — 63 vs 65 controllers, 767 vs 787 endpoints across sources
      [BE-DOC L18 vs ROUTE-CAT `_meta`]; counts approximate.

---

*Reverse-engineered business-data-map · read-only survey · 2026-07-13. Satisfies the
`/adapt-framework` + `/master-test-plan` data-map prerequisite.*
