```
+==============================================================================+
|                     MASTER TEST PLAN — MAGIIS Carrier                        |
|             What to test in this system, and why it matters.                 |
|         Risk-ranked strategy layer above the business-* maps (2026-07-13)    |
+==============================================================================+
```

> **Read me first.** This is the **test-strategy layer** — a risk-ranked roadmap that answers
> *what to test and why*. It sits on top of, and does not duplicate, the flow diagrams
> (`business-data-map.md`), the feature catalog + CRUD matrix (`business-feature-map.md`), and the
> auth/endpoint narrative (`business-api-map.md`). Test-case definitions live in the TMS, not here
> (§What is NOT in this plan).
>
> **Grounding rule.** Every priority below cites a data-map flow, a feature-map QA-relevance row,
> a named integration, or an SRS/glossary fact. Nothing is hand-waved. Sources are reverse-engineered
> read-only surveys (no live Java source, no Oracle DDL) — carry that caveat into every "verify" below.

---

## Scope & environments

**Domain in scope**: the **Carrier operator** portal — the operator-facing web application that runs
fleet, trips, pricing, drivers/vehicles/owners, clients/contractors, billing, settlements, checking
accounts, affiliates (ATC), GNet dispatch, reports, and carrier configuration. All of it talks to a
single Spring Boot 2.0.0 / Java 8 monolith over Oracle, deployed under the `/magiis-v0.2` servlet
context [SRS System Context; backend.md L8-23].

**Frontend reality that shapes the whole plan**: the Carrier UI is mid-migration. **Only login +
dashboard are live in Carrier V2 (Angular 18)**; every other Carrier feature still runs on **legacy V1
(Angular 5/8) in production** [feature-map §0; frontend.md L17-20; SRS L134-136]. So today, UI testing
is realistically limited to login + dashboard, and **the productive test surface for everything else is
the API** (the domain already lives in ~90 wired command classes / 357 live endpoints)
[frontend.md L18, L37-38; feature-map §8].

**Environments** — canonical ids `local · qa · staging · production`. URLs are **host + the
`magiis-v0.2` prefix, joined once** — do NOT double the prefix (the OpenAPI `servers:` already include
it; the automation client splits host from prefix) [api-map §3].

| Canonical env | Maps to backend env | API base (host + prefix — do not double) | Carrier FE deploy URL | Source |
|---|---|---|---|---|
| `local` | DEV | `http://apps-dev2.magiis.com:8080/magiis-v0.2/` | — (non-TLS, port 8080) | api-map §3; backend.md L33 |
| `qa` | TEST (default) | `https://apps-test.magiis.com/magiis-v0.2/` | — | api-map §3; runtime default `ENV=test` |
| `staging` | UAT | `https://apps-uat.magiis.com/magiis-v0.2/` | `https://apps-uat.magiis.com/carrier/#/auth/login` | api-map §3; frontend.md L26 |
| `production` | PROD | `https://api.apps.magiis.com/` — **prefix + host UNCONFIRMED** | unconfirmed | backend.md L34, L155-157 (gap) |

Default target **staging (UAT)** unless the ticket says otherwise. Credentials come from `.env.<env>`
(`LOGIN_USER` / `LOGIN_PASSWORD`, role `ROLE_CARRIER`); they ship empty and are never committed — real
UAT/TEST credentials are still unconfirmed (gap) [backend.md L93-95, L158-159].

---

## TMS modality

This project is the **MX instance (project key MAGIIS-3.0)**, which **has Xray provisioned** → the TMS
modality is **`jira-xray`**. Test artifacts are Xray issue types: **Test**, **Test Plan** (holds the
ATP body), **Test Execution** / **Re-Test Execution** (holds the ATR body), and **Pre-Condition**;
`/xray-cli` resolves `[TMS_TOOL]`, `/acli` handles generic Jira issue-tracker writes.

> **Heads-up — differs from the shipped default.** The old `.agents/project.yaml` assumed the
> **MG / MAGIIS-4** instance, which is **jira-native (no Xray)**. Do **not** carry that assumption here.
> Before the first TMS write, **confirm** (a) Xray is actually enabled on this Jira site, (b) the
> QA-process epics exist — "QA Test Repository" (Tests), "QA Master Test Plan" (Test Plans / ATP),
> "QA Test Artifacts" (Test Executions / ATR + Pre-Conditions + Test Sets), "QA Defect Management"
> (bugs/defects/improvements) — and (c) your account has Xray access. If any is missing, stop and raise
> it; do not silently fall back to native fields.

---

## Risk-ranked test priorities

The most fragile money is in **trip pricing and settlement** — both re-run simulation math, both move
money across parties, and pricing already has a confirmed defect history (MX-6024 / MX-6052). The
second fault line is **tenant-scoping and auth**: a single JWT scheme gates every flow, `{carrierId}`
path-scoping is the only tenant boundary, and there is already a live cross-role leak signal
(`GET admins/paginated` returns 500 with a CARRIER token) [api-map §4.5; feature-map §8]. The third is
the **legacy monolith blast radius**: one process fronts all clients, so a bad query is a user-visible
500 (`GET travels/paginated` SQLGrammarException, live in prod [api-map §4.2]). Everything else —
config, reports, admin — is lower risk because it is stable CRUD with a small blast radius.

| Priority | Flow / feature | Why it matters | Depends on / Affects |
|---|---|---|---|
| **CRITICAL** | Trip pricing + Other Costs (**FEAT-002**, MX-6024/MX-6052) — active target | Money math on every trip; confirmed Hibernate orphan-collection rollback → 404 on edit | Other-costs catalog (FEAT-017), fare engine (FEAT-016), Travel lifecycle |
| **CRITICAL** | Billing / Payment / Settlement / Checking accounts (**FEAT-013/014/015**) | Real money across 4 parties + Stripe/MercadoPago; soft-delete (invalidate) = reversibility risk; balance integrity | Travel finalize, checking-account balances, liquidations |
| **CRITICAL** | Auth + tenant-scoping (**FEAT-026 / FEAT-025**) | Single JWT gates everything; `{carrierId}` is the only tenant wall; live cross-role 500 leak signal | Every authenticated flow |
| **HIGH** | Travel lifecycle (**FEAT-001**) | Central operational record; state machine not backend-verified; feeds pricing + settlement | Maps/Places, driver/vehicle assign, pricing, billing |
| **HIGH** | External payment integrations (MercadoPago, Stripe) | Third-party contract; payment decline/timeout stalls trip pay + settlement | Trip pay, settlement |
| **HIGH** | GNet / ODN external dispatch (**FEAT-022**) | Inbound webhooks + cross-carrier money; trip stuck if dispatch/webhook missed | Affiliate settlement, travel state |
| **HIGH** | Quotes → Travel (**FEAT-003**) | Priced offer that converts to a real (money) trip; `quotes/simulate` is dead — don't cover it | Pricing, travel create |
| **MEDIUM** | Fares / tarifador (**FEAT-016**) | Pricing input feeding FEAT-002; one deprecated rule endpoint | Trip pricing |
| **MEDIUM** | Affiliate agreements + checking accts (**FEAT-020/021**) | Inter-carrier money + negotiation state machine | GNet, settlement |

Below HIGH → §Lower-tier. Reports (FEAT-023, ~18 screens, mostly P2), carrier config (FEAT-018/019),
RBAC/admin (FEAT-024), CSV import (FEAT-005), map viewer (FEAT-007), recurring trips (FEAT-004).

---

## What to test & why

Per top-tier item: what to cover (happy path **plus** the risk-beyond-AC angles), why it's risky, and
the testing level. **DB note**: DB validation is **limited** — DBHub does **not** support Oracle, so
any DB check is **manual via an external Oracle client**, not automatable through the MCP. Treat DB
assertions as best-effort spot-checks, not a routine layer.

### CRITICAL — Trip pricing + Other Costs (FEAT-002 · MX-6024/MX-6052)

- **Why it's risky**: the price of every trip = base rate + simulation + `otherCosts[]`, recomputed on
  edit. MX-6024 was a service-layer bug where `updateTravel`'s else-branch moved the simulation's
  `all-delete-orphan` collection → Hibernate rollback → **404 ACTION_NOT_ALLOWED** (fixed v1.72.6 by
  cloning each `TravelOtherCostSim`); MX-6052 was the FE edit modal emptying the concept select via a
  currency filter [data-map Flow 2; feature-map FEAT-002].
- **What to cover**:
  - Happy path: open trip edit (mode=3) → add an other-cost concept + amount → recalc → save → price
    persists and matches base + sim + otherCosts.
  - Risk-beyond-AC: **edit a trip that already has other-costs** and save again (the exact MX-6024
    orphan-collection path — regression anchor); add/remove/re-add lines and re-price; concept select
    populated across **multiple currencies** (MX-6052); save with `recalculateTripPrice=true` vs a
    no-op edit; concurrent edits of the same trip; edit blocked correctly for FINISHED/LOST / Farm-In /
    One-Shot-offerer trips (mode gate) [data-map state machine].
  - Money-integrity: rounding, negative/zero amounts, very large amounts, currency mismatch between the
    catalog concept and the trip.
- **Level**: **API primary** — `POST .../travels/simulate|simulateAll|budget`,
  `POST .../{travelId}/calculateCost`, `PUT .../{travelId}/update`, and the catalog CRUD
  `POST/PUT .../otherCosts/{new,update,search,delete}` [api-map §4.1]. **UI**: only when the V2 trip
  edit screen migrates (POM `SettingsOtherCostsPage` exists but is wired-only scaffolding). **DB**:
  manual Oracle spot-check that the simulation + `TravelOtherCostSim` rows survive the update
  (table names `~inferred`, no DDL — best effort).

### CRITICAL — Billing / Payment / Settlement / Checking accounts (FEAT-013/014/015)

- **Why it's risky**: real money moves across contractors, drivers, owners, carrier users and
  passengers; "delete" is a **soft invalidate/cancel**, so a wrong invalidate is a reversible-but-messy
  money event; checking-account balances (`debitSum`/`creditSum`/`limit`/`balance`/`exceedingLimit`)
  must stay internally consistent [glossary Checking Account; feature-map §2.5].
- **What to cover**:
  - Happy path per party: create liquidation → read → (update where allowed) → invalidate; generate
    surrender/billing PDF; move payment status.
  - Risk-beyond-AC: **balance arithmetic after each movement** (add movement, then re-read balance);
    invalidate a liquidation and confirm the balance reverses correctly; `exceedingLimit` behavior at
    and over `limit`; driver/owner liquidations have **no update route** — confirm the UI/API blocks
    edit rather than half-applying; settlement status transitions NOTPAID → PAID → CANCELED with no
    illegal jumps; idempotency of "generate liquidation" (double-click / retry must not double-count).
  - Cross-party: a finalized trip's amount flowing into the correct party's checking account.
- **Level**: **API primary** (`billing/*`, `Carrier*LiquidationController`, `CheckingAccountController`,
  `PaymentController`/`CardController`). **DB**: manual Oracle spot-check of balance columns after
  movements (money integrity is worth the manual cost). **UI**: 12 settlement POMs + affiliate POMs
  exist but are wired-only — E2E awaits migration.

### CRITICAL — Auth + tenant-scoping (FEAT-026 / FEAT-025)

- **Why it's risky**: one JWT-bearer scheme, no session cookie; role chosen at login via
  `RoleToAttempt: ROLE_CARRIER` and carried in the JWT `roles` claim; the **only** tenant boundary is
  the `{carrierId}` path segment. There is a **live cross-role leak signal**:
  `GET admins/paginated` returns **500 with a CARRIER token** — it should be a clean 403
  [api-map §4.5; feature-map §8].
- **What to cover**:
  - Happy path: `POST auth/login` (200 + `.token`), then `Authorization: Bearer` on a scoped read.
  - Risk-beyond-AC (**the important part**): **tenant isolation** — carrier A's token must NOT read/write
    carrier B's `{carrierId}` resources (travels, liquidations, checking accounts); **role boundary** —
    a CARRIER token hitting admin/driver/pax-only routes must 401/403, never 500 or data; expired /
    tampered / missing token → 401 → FE logout (`AuthInterceptor`); public endpoint set stays public and
    exposes nothing else (login, solicitude create + `PUT .../confirm/{token}`, passenger register,
    password recovery, user-existence check, `config/serverInfo`); the account-confirmation email link
    (`PUT .../confirm/{solicitudeToken}`) — replay, expired, and already-consumed token.
  - Storage: JWT in `localStorage` (`carrier-0`) — session survival across reload, and clean wipe on
    logout.
- **Level**: **API primary** for tenant/role matrix (fastest, most valuable). **UI**: login is live in
  V2 (`#email`, `#password-input`, `button[type=submit]` → `/dashboard`) — automatable now; fix locale,
  wait on DOM presence (`@if`), avoid text locators [frontend.md L28-31].

### HIGH — Travel lifecycle (FEAT-001)

- **Why it's risky**: the central record feeding both pricing and settlement; the **state machine is
  code-declared but not backend-verified for transition guards** (see §State machines — the data-map's
  inferred `DRAFT→…` chain is superseded by the glossary's real `TravelStateEnum`).
- **What to cover**: happy path create → assign → confirm → in-progress → finalize; cancel and clone;
  **illegal transitions** (finalize before assign, confirm a CANCELLED/LOST trip, edit a DONE trip);
  the known live bug `GET travels/paginated` (SQLGrammarException) as a regression guard; Maps/Places
  geocode failure blocking create/simulate.
- **Level**: **API primary**; UI awaits V2 migration; DB manual spot-check of `travel.state`.

### HIGH — Payment integrations (MercadoPago, Stripe)

- **Why it's risky**: third-party contracts; a decline or timeout stalls trip pay and downstream
  settlement; OAuth vendor-onboarding returns land in `VendorController` and can be lost.
- **What to cover**: **validate through the backend, never against the provider directly**
  [data-map Integrations; api-map §6]; payment success, decline, and timeout paths; OAuth return
  success vs lost-return (vendor not linked); idempotency of pay retries. Sandbox-vs-prod drift is a
  known integration quirk to watch.
- **Level**: **API** (backend-mediated). DB manual check of payment/movement rows if a discrepancy is
  suspected.

### HIGH — GNet / ODN dispatch (FEAT-022) & HIGH — Quotes (FEAT-003)

- **GNet/ODN**: outbound farm-in/out plus **inbound webhooks** (`odn/requestTripByGNET`,
  `odn/updateTripByGNET`) — cover trip-stuck-awaiting-external-carrier when a webhook is missed, and the
  cross-carrier money leg. **API**; flow itself is inferred (gap).
- **Quotes**: create → detail → confirmToTravel → the converted trip is a real money trip; **do NOT
  cover `POST quotes/simulate` — it is confirmed dead across all 4 clients** [feature-map §7; api-map §4.5].

---

## State machines that matter

Only the machines with financial / operational consequence. Cosmetic UI states are skipped.

### Travel status — `TravelStateEnum` (code-derived; the one to trust)

```
SEARCHING_DRIVER → WITH_DRIVER_ASSIGNED → GOING_TO_CLIENT → GOING_TO_DESTINATION
                 → CLOSING_TRAVEL → DONE / ADMIN_DONE
   side/terminal: SCHEDULED, RESERVED, CANCELLED, LOST, NO_AUTH, NO_PAY
```
[glossary Trip §State machine `travelState.enum.ts`]

- **Why transitions matter**: an illegal jump (e.g. finalize/close before a driver is assigned, or
  re-pricing a DONE/LOST trip) corrupts the money that settlement later reads. Edit is gated to `mode=3`
  and blocked for FINISHED/LOST / Farm-In / One-Shot-offerer trips [data-map state machine].
- **Most likely broken**: the `CLOSING_TRAVEL → DONE` money-finalization edge, and re-entry into
  pricing on an already-terminal trip (the MX-6024 neighborhood).
- **Terminal / forbidden to leave**: `DONE`, `ADMIN_DONE`, `CANCELLED`, `LOST`, `NO_PAY`.
- **Detection**: partly UI-visible (trip state chip), but the **guard enforcement is backend-only and
  not verified on disk** — an illegal transition that the backend wrongly allows would be invisible
  until settlement math drifts. Confirm guards against `magiis-be` (gap).
- **⚠️ Source discrepancy**: `business-data-map.md` shows an **inferred** `DRAFT/SIMULATED → ASSIGNED →
  CONFIRMED → IN_PROGRESS → FINISHED` chain — that is a placeholder. The **glossary enum above is
  code-derived and authoritative**; test against it, and log the data-map version as needing a refresh.

### Settlement status — `SettlementStatusEnum`: `NOTPAID → PAID → CANCELED`

- **Why**: money state per liquidation. `NOTPAID → PAID` must be idempotent; `CANCELED` must reverse the
  balance, not just flip a flag. Detection is UI-visible on the settlement detail, but balance
  correctness needs a manual Oracle spot-check.

### Affiliate negotiation — `NegotiationStatesEnum`

`PENDING · NEGOTIATING · ESTABLISHED · FINALIZED · EXPIRED · REJECTED · NEW` [glossary Affiliate].
Cross-carrier agreements gate inter-carrier money — guard `ESTABLISHED → FINALIZED` and the `EXPIRED`
terminal. Lower frequency, so MEDIUM, but money-touching.

### Contractor-carrier relationship — `ContractorCarrierStatusEnum`

`LOCAL · ACCECON · ACCECAR · INACCAR · INACCON · PENCAR · PENCON · DELETED` [glossary Client].
Governs whether a corporate client can be transacted with; wrong state = a contractor billed or blocked
incorrectly. MEDIUM.

---

## Silent killers — automated processes

The backend declares **18 `@Scheduled` jobs**; only the count is documented — bodies, cron expressions,
and failure handling are **not on disk** (gap) [data-map Triggers; SRS L94]. That makes this the most
undertested area: off-request-path work with **no UI feedback**.

| Process (inferred domain) | What it does / who depends | If it misses, double-runs, or runs out of order | Detected today? | QA strategy |
|---|---|---|---|---|
| Recurring-trip generation (`RecurringTripController` adjacency) | Materializes scheduled trips from `isRecurringTrip` templates | Miss → trips never created (silent no-show); double → duplicate trips + double billing | No known alert (gap) | Scheduled audit: count expected vs generated trips per window; synthetic recurring template + assert next occurrence |
| Liquidation / settlement runs | Batch money settlement across parties | Miss → parties unpaid; double → double-credit balances | No known alert (gap) | Log assertion + manual Oracle balance audit after a run |
| ODN / GNet reconciliation | Reconcile external dispatch state | Out-of-order → trip stuck awaiting external carrier | Partly via trip state, else silent | Synthetic farm-out + assert state converges; webhook replay test |
| Notification / email dispatch (Firebase FCM, Mailchimp, WhatsApp) | Push/email on trip + account events | Miss → user not notified (trip still valid — non-blocking) | No alert (gap) | Non-blocking; assert send attempt via backend, not provider |

**Inbound webhooks are the other silent surface**: ODN/GNet dispatch (`odn/...`), payment OAuth returns
(`VendorController`), and the email account-confirmation link (`PUT .../confirm/{solicitudeToken}`). A
lost inbound callback fails without any user-facing error [data-map §Integrations; api-map §6]. Cover
replay, out-of-order, and dropped-callback paths with synthetic probes.

---

## External integrations — failure points

All third-party calls are **backend-mediated — validate through the backend, never the provider
directly** [data-map Integrations; api-map §6]. Failure modes are **inferred from integration type** (no
service source on disk — no timeout/retry/circuit-breaker code) — a documented gap.

| Service | Business flow that stops | Acceptable degradation | Known quirks / watch |
|---|---|---|---|
| **MercadoPago / Stripe** | Trip pay + settlement | **Hard-fail** — payment cannot complete | OAuth return can be lost (vendor unlinked); sandbox↔prod drift; idempotency on retries |
| **Google Maps / Places** | Trip simulate + create (geocode/route) | **Hard-fail** — cannot price/create trip | Geocode ambiguity; rate limits |
| **ODN / GNet** | Farm-in/out dispatch | Trip **stuck** awaiting external carrier | Inbound webhook missed/out-of-order; cross-carrier money |
| **Firebase (FCM + RTDB)** | Notifications + live map/driver status | **Soft** — trip stays valid, user just not notified | Missed push is silent |
| **Mailchimp / WhatsApp Business** | Marketing / messaging | **Soft** — non-blocking | Delivery not guaranteed |
| **Melita (AI branch)** | `melita/ai-branches` suggestion | **Soft** — feature degraded | Lookup fail degrades, doesn't block |

Retry/timeout boundaries are **unspecified on disk** — do not assert specific timeout values; assert
the **user-visible outcome** (hard-fail blocks, soft-fail degrades) until the contracts are confirmed
against `magiis-be`.

---

## Dependency cascade between flows

```
Auth/tenant-scope ──► Travel create/simulate ──► Pricing + Other Costs ──► Finalize/Pay ──► Settlement ──► Checking-account balance
       │                      │                          │                      │                │                     │
       │                      └ Maps/Places geocode      └ Other-costs catalog  └ Stripe/MP      └ liquidation run     └ manual Oracle audit
       └ fails here = every flow below is unreachable (whole portal gated by JWT)
```

Three chains worth testing end-to-end, not in isolation:

1. **Money chain** — `Travel create → Pricing/Other-Costs → Finalize/Pay → Settlement → Checking-account
   balance`. Testing pricing alone hides the MX-6024-class bug that only surfaces on **edit-then-save of
   a trip already carrying other-costs**, and hides balance drift that only appears after settlement
   consumes the finalized amount. Walk the whole chain and assert the balance at the end.
2. **Auth-gates-everything** — every flow above sits behind the single JWT. A tenant-scoping bug in auth
   doesn't show up in auth tests; it shows up as carrier A reading carrier B's money three flows later.
   Test cross-tenant reads *through* a real downstream flow.
3. **Dispatch chain** — `GNet farm-out → inbound webhook → travel state → affiliate settlement`. A
   dropped webhook leaves a trip stuck and an affiliate balance wrong, with no error in between.

---

## Edge cases developers commonly forget

Grouped by theme; each names the project flow most at risk.

- **Idempotency** — double-click / retry on `generate liquidation`, `payTravel`, and trip `update`
  (recalculateTripPrice). Most at risk: **settlement runs** and **trip pay** (double-credit / double
  charge).
- **Orphaned / dangling state** — the MX-6024 `all-delete-orphan` collection on `updateTravel`; a
  simulation left without its other-cost lines. Most at risk: **Trip pricing (FEAT-002)**.
- **Permission / tenant boundaries** — CARRIER token on admin routes (live 500 leak), carrier A vs
  carrier B `{carrierId}`. Most at risk: **Auth/tenant-scoping**.
- **Concurrency** — two operators editing the same trip; a trip finalized while its price is being
  edited. Most at risk: **Travel lifecycle + pricing**.
- **Data limits / money precision** — rounding, negative/zero/huge other-cost amounts, currency
  mismatch between catalog concept and trip. Most at risk: **pricing + billing**.
- **Timezone / DST** — recurring-trip generation windows, quote `expiredDate`, scheduled-trip firing.
  Most at risk: **recurring trips + quotes** (backend TZ vs client TZ unverified — gap).
- **Soft-delete semantics** — invalidate/cancel that must reverse balances, not just flip a flag; POST-
  based "delete" on config entities. Most at risk: **liquidations + checking accounts**.

---

## Regression anchor

This boilerplate is the **QA methodology hub**, not the suite host. The executable regression assets
live in two sibling automation repos [data-map/feature-map Sources]:

- **`magiis-api-e2e`** — Playwright API suite (`_flows/` chained + `controllers/` one-file-per-
  controller), JWT client, env resolver. **This is the primary regression layer today**, because the
  Carrier domain lives in the API ahead of the UI (357 live endpoints) [SRS Automation suite; frontend.md L37-38].
- **`magiis-carrier-v2-e2e`** — Playwright UI suite; 48 POM files inventoried, but **only login +
  dashboard are E2E-runnable against live V2** — the rest are pre-built scaffolding awaiting dev
  migration [feature-map §8].

**Regression priorities to anchor first**: the two confirmed live prod bugs as guards
(`GET carriers/{id}/travels/paginated` SQLGrammarException; `GET admins/paginated` 500 with CARRIER
role) and the MX-6024 edit-then-save-with-other-costs path. In the TMS (Xray), group these under the
Test Plan parented to "QA Master Test Plan" and run them via Test Executions parented to "QA Test
Artifacts" (see §TMS modality). Sprint-level execution order lives in
`.context/reports/SPRINT-{N}-TESTING.md`, not here.

---

## Lower-tier priorities (below HIGH)

Short list — stable CRUD, small blast radius, cover after the money/auth tiers:
Reports suite (FEAT-023, ~18 screens, mostly P2, generic report engine) · Carrier config —
zones/areas/service-types/concepts/taxes/special-rate-triggers/branches (FEAT-018) · account
preferences (FEAT-019) · Fleet CRUD read paths (driver/vehicle/owner list — FEAT-008/009/010) ·
Individual & corporate clients (FEAT-011/012) · CSV bulk trip import (FEAT-005) · Map viewer (FEAT-007) ·
Recurring trips (FEAT-004, but watch DST) · RBAC / Magiis Access (FEAT-024, admin UI not migrated to V2).

---

## What is NOT in this plan

- Flow-level diagrams and state-machine *transition tables* → `.context/business/business-data-map.md`
- Feature catalog, CRUD matrix, feature flags, per-feature QA-relevance tags → `.context/business/business-feature-map.md`
- Auth narrative + API endpoint inventory / contracts → `.context/business/business-api-map.md`, `magiis-api-e2e/openapi.yaml`, and `bun run api:sync` → `api/schemas/`
- Detailed test-case definitions + US↔ATP↔ATR↔TC traceability → TMS via `/test-documentation`
- Sprint-level execution order → `.context/reports/SPRINT-{N}-TESTING.md` via `/sprint-testing`

---

## Discovery gaps

All four source maps are **reverse-engineered read-only surveys** — no live backend Java source and no
Oracle DDL were read. Everything below limits confidence in this plan:

- **Backend Java source not read** — service logic, transition guards, the 18 `@Scheduled` job bodies,
  and integration retry/timeout/idempotency contracts are inferred. Confirm against `magiis-be`.
- **No Oracle DDL** — table/column schema, PK/FK, and the pricing cluster names
  (`SIMULATION_PRICE_INFORMATION` / `TRAVEL_OTHER_COST_SIM`, MX-6024) are `~inferred`. Combined with
  **DBHub not supporting Oracle**, all DB validation is manual, best-effort spot-checking only.
- **Travel state machine has two versions** — the code-derived `TravelStateEnum` (glossary) is
  authoritative and used here; the data-map's `DRAFT→…` chain is an inferred placeholder that needs a
  refresh. Transition guards themselves are still unverified.
- **Mobile pax/driver apps out of scope** — Carrier operator only; `PassengerUserController` (54) /
  `DriverUserController` surfaces are inferred from routes, no mobile source on disk.
- **Legacy V1 screens** — everything except login + dashboard runs on non-migrated Angular 5/8 V1;
  per-screen V2 liveness must be confirmed with dev as modules land. V2 POM `@route`s tagged "estimado"
  are placeholders.
- **PROD URL + valid UAT credentials unconfirmed** — `https://api.apps.magiis.com/` lacks a confirmed
  host+prefix; `.env` ships empty `LOGIN_USER`/`LOGIN_PASSWORD`. Confirm both before any prod-touching
  or live-run test.
- **TMS assumptions unconfirmed** — Xray-enabled site, QA-process epics, and account Xray access must be
  verified before the first TMS write (see §TMS modality).
- **Version / count drift** — 63 vs 65 controllers, 767 vs 787 endpoints across sources; counts are
  approximate and not load-bearing for this plan.
- **Integration SLAs / failure modes inferred** — hard-fail vs soft-fail column derived from integration
  type, not observed code; no documented timeouts or retry boundaries.

---

*Master Test Plan · MAGIIS Carrier · risk-ranked strategy layer · 2026-07-13. Derived from
`business-data-map.md`, `business-feature-map.md`, `business-api-map.md`, `SRS/architecture.md`,
`infrastructure/{backend,frontend}.md`, and `domain-glossary.md`. Hard input for `/sprint-testing` +
`/test-documentation`; soft input for `/test-automation` + `/regression-testing`.*
