# Business Feature Map — MAGIIS Carrier

> **Reverse-engineered, read-only survey (2026-07-13).** Feature-centric complement to
> `business-data-map.md` (data-centric). Reconstructed from on-disk automation-repo artifacts +
> embedded Carrier V2 frontend source; no live backend Java source or Oracle DDL was read (see
> [Discovery Gaps](#discovery-gaps)). Aligned with `.context/SRS/architecture.md`,
> `.context/business/business-data-map.md`, `.context/business/domain-glossary.md` — vocabulary not duplicated.
>
> **Sources & abbreviations**
> - `magiis-api-e2e/scripts/backend-route-catalog.json` — controller→"VERB handler"→route, source-derived from `magiis-be`. **[ROUTE-CAT]**
> - `magiis-api-e2e/docs/reference/fe-endpoint-usage.md` — per-client (carrier prod / carrier-v2 / driver / pax) live-vs-dead endpoint usage. **[FE-USE]**
> - `magiis-carrier-v2-e2e/tests/pages/carrier-v2/**` — 48 POM files, each JSDoc-annotated `@jira` / `@route` / `@priority`. **[POM]**
> - `magiis-carrier-v2-e2e/refs/v2/src/app/pages/carrier/carrier.routing.ts` — Carrier V2 feature routes (Angular 18, hash-routed). **[FE-V2]**
> - `.context/SRS/architecture.md` **[SRS]** · `.context/business/business-data-map.md` **[DATA-MAP]** · `.context/business/domain-glossary.md` **[GLOSSARY]**
>
> **Confidence legend**: `confirmed` = two independent sources agree (route + POM/FE) · `inferred` = single source or derived from naming.

---

## 0. Reading this map (FE migration state — READ FIRST for QA)

The backend is one Spring Boot monolith (~787 endpoints / 65 controllers) [ROUTE-CAT `_meta`; SRS]. It
serves **two Carrier frontends at once**:

```
                          +-- Carrier V2 (Angular 18) -- ACTIVE: only LOGIN + DASHBOARD migrated
Carrier operator ---------|                              (~88 endpoints wired, subset of V1) [FE-USE L13]
                          +-- magiis-fe  (Angular 5/8) -- LEGACY/PROD: rest of the portal
                                                          (~330 endpoints in use) [FE-USE L12]
```

- **Only login + dashboard are live in V2**; every other Carrier feature below still runs on **legacy V1 in production** [SRS L134-136; DATA-MAP; FE-USE L13]. `confirmed`.
- The V2 [POM] files exist as an **automation-readiness inventory** — each carries a `@jira` migration ticket and an estimated `@route` — not proof the screen is live in V2. Where a POM `@route` is marked "estimado" the route is a placeholder for the pending dev migration [POM `README.md` L42]. `confirmed`.
- Feature **Status** below therefore means *product maturity* (the capability is live in prod on V1), while **FE-V2** flags whether the V2 UI is live, wired-only, or absent.

---

## 1. Inventory summary

Feature count is by capability group (Section 2), not by endpoint. Status = product maturity in prod.

| Category | Features | Status | Notes |
|---|---|---|---|
| Core (money/trip critical) | 9 | Stable (prod, V1) | Travel lifecycle, pricing/other-costs, settlements, checking accounts, billing |
| Secondary (config & CRM) | 14 | Stable (prod, V1) | Fleet, clients/contractors, fares, zones, service types, reports |
| Migrating to V2 | 2 live + ~26 wired | In Development | Login + Dashboard live in V2; ~26 screens wired-only [FE-USE L13] |
| Integrations | 8 | Mixed | Payments (MP/Stripe), Mailchimp, WhatsApp, Maps, GNet/ODN, Melita, Firebase |
| Planned / stub / dead | 4+ | Various | Admin portal routes commented out; `quotes/simulate` dead; deprecated endpoints |

Totals: **~33 product features · 48 V2 POM screens · 65 backend controllers · ~787 endpoints** (counts approximate — version drift, see [Discovery Gaps](#discovery-gaps)).

---

## 2. Feature catalog (by domain)

Feature IDs are stable (`FEAT-NNN`). `[MX-xxxx]` = migration/automation ticket from the [POM] `@jira` tag.

### 2.1 Travel / Trips (core)

#### Feature: Travel lifecycle (create → assign → confirm → run → finalize)
| Aspect | Value |
|---|---|
| **ID** | FEAT-001 |
| **Status** | Stable (prod, V1) · V2 wired-only |
| **Endpoints** | `POST carriers/{cid}/travels` (create), `POST .../{tid}/assign`, `POST .../{tid}/confirm`, `POST .../{tid}/finalize`, `PUT .../{tid}/cancel`, `POST .../{tid}/clone`, `GET .../{tid}` / `.../paginated` [ROUTE-CAT `TravelController` 78 routes] |
| **UI** | `travel/create`→`NewTripComponent`, `travel/detail/:id`→`TravelDetailComponent`, `travel/dashboard`→`TripsDashboardComponent` [FE-V2 L494-502]; POM `TravelDashboardPage` [MX-5529] |
| **Users** | Carrier operator (ROLE_CARRIER) |
| **Dependencies** | Google Maps/Places (routing), fare engine, driver/vehicle assignment |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; [DATA-MAP flow 1]; `confirmed` |

**Capabilities:** create/simulate, assign driver+vehicle, confirm, dispatch, finalize/cancel, clone, multi-trips, audit trail, notes, proof-of-delivery, signature, QR payment.

#### Feature: Trip pricing — base rate + simulation + Other Costs  *(ACTIVE QA TARGET — MX-6024 / MX-6052)*
| Aspect | Value |
|---|---|
| **ID** | FEAT-002 |
| **Status** | Stable (prod, V1) · defect fixed v1.72.6 [DATA-MAP flow 2] |
| **Endpoints** | `POST carriers/{cid}/travels/simulate` / `simulateAll`, `POST .../budget`, `POST .../{tid}/calculateCost`, `PUT .../{tid}/update` (recalculateTripPrice), per-trip other-cost `GET/PUT .../{tid}/otherCost/{ocId}`, `GET/PUT .../{tid}/toll/{tollId}`, `GET/PUT .../{tid}/parking/{pId}` [ROUTE-CAT `TravelController`] |
| **UI** | "Add Other Cost" modal inside `travel/detail/:id` edit (mode=3); concept select fed by other-costs catalog [FE-V2 L494-497; SRS L164-181] |
| **Dependencies** | Other-costs catalog (FEAT-011), fare engine (FEAT-010), simulation cluster (`SimulationPriceInformation`/`TravelOtherCostSim` — inferred, MX-6024) |
| **Evidence** | [ROUTE-CAT]; [SRS command layer]; [DATA-MAP flow 2]; `confirmed` via tickets + FE command source |

**Capabilities:** simulate price, itemize other-costs/tolls/parking, recalc on edit, budget quote.
**Known defects (context):** MX-6052 (edit modal emptied concept select filtered by currency) · MX-6024 (`updateTravel` moved orphan `all-delete-orphan` simulation collection → Hibernate rollback → 404 ACTION_NOT_ALLOWED; fixed by cloning each `TravelOtherCostSim` in v1.72.6) [DATA-MAP flow 2].

#### Feature: Quotes (cotizaciones)
| Aspect | Value |
|---|---|
| **ID** | FEAT-003 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST quotes/quote` (create), `GET quotes/carrier/{cid}/quote/{qid}/detail`, `POST quotes/quote/{qid}` (update), `PUT .../{qid}/cancel`, `POST .../{qid}/confirmToTravel`, `POST .../{qid}/booking`, notifications [ROUTE-CAT `QuoteController`] |
| **UI** | `travel/quotes`→`TripsQuotesComponent` [FE-V2 L499]; POM `TravelQuotesPage` [MX-5572, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. Note: `POST quotes/simulate` is **DEAD** across all 4 clients [FE-USE L37]. |

#### Feature: Recurring trips
| Aspect | Value |
|---|---|
| **ID** | FEAT-004 · **Status** Stable (prod, V1) |
| **Endpoints** | `GET carriers/{cid}/recurringTrip/paginated`, `POST .../{rid}/update`, `POST recurringTrip/{rid}/updateNote`, `PUT .../{rid}/delete` [ROUTE-CAT `RecurringTripController`]. Create is via the `isRecurringTrip` flag on `POST .../travels` (no dedicated create route) [SRS L176; DATA-MAP]. |
| **UI** | `travel/recurring`→`TripsRecurringComponent` [FE-V2 L501]; POM `TravelRecurringPage` [MX-5537, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; create path `inferred`. |

#### Feature: CSV bulk trip import (mappers)
| Aspect | Value |
|---|---|
| **ID** | FEAT-005 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST data/csv/mapperTravels/{cid}/{uid}/{mapperId}` (process), `.../createTravel`, `.../createBulkTravels`, mapper file/line CRUD, `mapper/{cid}/conversionProfile` CRUD [ROUTE-CAT `DataController`, `MapperController`] |
| **UI** | `travel/mappers`→`TripsMappersComponent` [FE-V2 L502] |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; `inferred` flow. |

### 2.2 Operations & monitoring

#### Feature: Operations Control / Dashboard  *(LIVE in V2)*
| Aspect | Value |
|---|---|
| **ID** | FEAT-006 · **Status** Stable · **FE-V2** LIVE |
| **Endpoints** | `GET carriers/{cid}/dashboard/driversSurrenderState`, `POST carriers/{cid}/dashboard/monthlyStatistics/{general,byDrivers,byVehicles}` [ROUTE-CAT `DashboardController`], `GET carriers/travelsCurrentStatus/carrier/{cid}` [ROUTE-CAT `CarrierAccountController`] |
| **UI** | `dashboard`→`DashboardCarrierComponent` [FE-V2 L478; GLOSSARY L59]; POM `DashboardCarrierPage` [MX-5711, P1] + `OperationsControlPage` [MX-5711, P1] |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; [FE-USE L13 — one of the two migrated V2 screens]; `confirmed`. |

#### Feature: Map viewer (live fleet map)
| Aspect | Value |
|---|---|
| **ID** | FEAT-007 · **Status** Stable (prod, V1) |
| **Endpoints** | driver location endpoints `GET carriers/{cid}/drivers/lastPlace`, `GET odn/{cid}/travel/{tid}/driverLocation` [ROUTE-CAT] |
| **UI** | `map-viewer`→`MapViewerComponent` [FE-V2 L482; GLOSSARY L60]; POM `MapViewerPage` [MX-5559, P1] |
| **Evidence** | [POM]; [FE-V2]; `confirmed` (POM). Backing endpoint set `inferred`. |

### 2.3 Drivers / Vehicles / Owners

#### Feature: Driver management
| Aspect | Value |
|---|---|
| **ID** | FEAT-008 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST drivers` (create), `GET drivers/{did}` / `carriers/{cid}/drivers/paginated`, `PUT drivers/{did}` (update), `PUT .../operability`, `.../outOfService`, `.../updateVehicle`, checking-account notes [ROUTE-CAT `DriverUserController`, `DriverAccountController`] |
| **UI** | `driver/list`→`DriverListComponent` [GLOSSARY L63]; POM `DriverListPage` [MX-5711, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. No hard-delete → disable via operability (soft). |

#### Feature: Vehicle management
| Aspect | Value |
|---|---|
| **ID** | FEAT-009 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST vehicles` (create), `GET vehicles/{vid}` / `.../iCard`, `PUT vehicles/{vid}` (update), `GET vehicles/types` [ROUTE-CAT `VehicleController`, `TransportController`] |
| **UI** | `vehicle/list`→`VehicleListComponent` [GLOSSARY L64]; POM `VehicleListPage` [MX-5711, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. No delete endpoint. |

#### Feature: Owner management + owner portal
| Aspect | Value |
|---|---|
| **ID** | FEAT-010 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST carriers/{cid}/vehicleOwners` (create), `GET .../vehicleOwners/{id}` / `.../paginated`, `PUT .../vehicleOwners/{id}`, owner-portal reads `GET vehicleOwners/{oid}/{drivers,vehicles}` [ROUTE-CAT `VehicleOwnerController`, `OwnerPortalController`] |
| **UI** | `owner/list`→`OwnerListComponent` [GLOSSARY L65]; POM `OwnerListPage` [MX-5604, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. No delete endpoint. |

### 2.4 Clients / Contractors (CRM)

#### Feature: Individual clients (Gestión Individuos)
| Aspect | Value |
|---|---|
| **ID** | FEAT-011 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST carriers/{cid}/clients` (add), `GET .../clients/{clid}` / `.../paginated`, `PUT .../clients/{clid}` (update) / `.../operability`, `DELETE .../clients/{clid}` [ROUTE-CAT `ClientController`] |
| **UI** | `client/list`→`ClientListComponent` [GLOSSARY L66]; POM `ClientListPage` [MX-5197, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. Full CRUD (delete present). |

#### Feature: Corporate clients / contractors (Gestión Empresas)
| Aspect | Value |
|---|---|
| **ID** | FEAT-012 · **Status** Stable (prod, V1) |
| **Endpoints** | contractor account `GET/PUT contractor/{caid}`, relation `POST/PUT carrier/{cid}/contractors...`, employees `POST/PUT/DELETE contractorEmployees/...`, areas `POST/PUT/DELETE contractorsAreas/...`, cost centers `POST/PUT costCenters/...`, CSV import [ROUTE-CAT `ContractorAccountController`, `ContractorUserController`, `ContractorEmployeeController`, `ContractorAreaController`, `CostCenterController`, `CarrierContractorRelationController`] |
| **UI** | `client/contractors`, `client/contractor/new`, `client/contractors/import`, `client/contractors/management` [FE-V2 L508-539] |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; [GLOSSARY L67]; `confirmed`. |

### 2.5 Billing / Settlement / Checking accounts (core, money-touching)

#### Feature: Liquidations / settlements (per party)
| Aspect | Value |
|---|---|
| **ID** | FEAT-013 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST .../create`, `GET .../{lid}` / `.../paginated`, `PUT .../update`, `PUT .../liquidation/{lid}/invalidate` across `CarrierContractorLiquidationController`, `CarrierDriverLiquidationController`, `CarrierOwnerLiquidationController`, `CarrierUserLiquidationController` [ROUTE-CAT] |
| **UI** | `liquidations/{contractors,passenger,drivers,owners}/{list,create,details,history}` [FE-V2 L558-565]; POMs `Settlements{Contractor,Driver,Owner,Passenger}{List,Detail,History}Page` [MX-5647, P1] |
| **Users** | Carrier operator |
| **Dependencies** | Checking accounts, travel surrender data |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. Delete = soft (invalidate). Driver/Owner liquidations have no update route. |

#### Feature: Checking accounts (cuentas corrientes)
| Aspect | Value |
|---|---|
| **ID** | FEAT-014 · **Status** Stable (prod, V1) |
| **Endpoints** | `GET checking-accounts/carrier/{cid}/{clients,drivers,owners}/paginated`, `GET .../{caid}/initialData`, `POST .../addMovement`, `POST .../generatePdf`, `PUT .../addNote` [ROUTE-CAT `CheckingAccountController`]; carrier-scoped variants in `CarrierAccountController` |
| **UI** | `checking-accounts/*` [SRS L132; GLOSSARY L68] |
| **Evidence** | [ROUTE-CAT]; [GLOSSARY]; `confirmed`. |

#### Feature: Billing & surrenders (cierres de caja) + admin liquidation
| Aspect | Value |
|---|---|
| **ID** | FEAT-015 · **Status** Stable (prod, V1) |
| **Endpoints** | `GET billing/surrender/paginated` / `.../summary`, `POST billing/carriers/{cid}/generateLiquidation` / `generateReport`, `POST billing/admin/carrierServices/settlement`, `PUT billing/payment/status/{id}`, `PUT .../carrierServices/deleteSettlement` [ROUTE-CAT `BillingController` 24] |
| **UI** | `pay/{travels,surrenders-report,drivers/advancements}` [FE-V2 L549-554]; POM none dedicated (legacy) [GLOSSARY L70] |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; `confirmed`. |

### 2.6 Carrier configuration

#### Feature: Fares / tarifador
| Aspect | Value |
|---|---|
| **ID** | FEAT-016 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST carriers/rate/{cuid}` (create), `GET carriers/rate/{cuid}` / `.../detail` / `.../family`, `PUT carriers/rate/{cuid}` (update) / `.../updateStatus`, `DELETE carriers/rate/{rid}/delete`, rules `GET/POST carriers/rate/{rid}/rule`, `POST .../simulateWith/{rid}` [ROUTE-CAT `CarrierRateController`] |
| **UI** | `settings/travel-fare-list`→`SettingsTravelFareListComponent`, `settings/travel-fare-rules`→`TravelFareRulesComponent` [FE-V2 L94,L100; GLOSSARY L71] |
| **Evidence** | [ROUTE-CAT]; [FE-V2]; `confirmed`. `POST carriers/rate/{rid}/rule` (addRule) is `@Deprecated` and probably dead [FE-USE L38]. |

#### Feature: Other-costs catalog (concept catalog)  *(feeds FEAT-002)*
| Aspect | Value |
|---|---|
| **ID** | FEAT-017 · **Status** Stable (prod, V1) · **Priority P3** [POM] |
| **Endpoints** | `POST carriers/{cid}/otherCosts/new` (create), `POST .../otherCosts/search` (read), `PUT .../otherCosts/update`, `POST .../otherCosts/delete` [ROUTE-CAT `CarrierOtherCostController`] |
| **UI** | `settings/otherCosts`→`SettingsOtherCostsComponent` [FE-V2 L88]; POM `SettingsOtherCostsPage` [MX-5575, `@route /carrier/#/settings/otherCosts`, P3] |
| **Evidence** | [ROUTE-CAT]; [POM]; [SRS L179-181]; `confirmed`. Full CRUD; note search is a POST. Directly consumed by the trip Other-Costs modal (FEAT-002). |

#### Feature: Zones, areas, service types, concept-taxes, special-rate triggers, transport types, branches
| Aspect | Value |
|---|---|
| **ID** | FEAT-018 · **Status** Stable (prod, V1) |
| **Endpoints** | Zones `carriers/{cid}/carrierZone` C/R/U/D [`CarrierZoneController`] · Areas `.../carrierArea` C/R/U/D [`CarrierAreasController`] · Service types `.../serviceTypes` C/R/U/D [`CarrierServiceTypesController`] · Concept/Tax `.../concept`,`.../tax` C/R/U/D [`CarrierConceptTaxController`] · Special-rate triggers `.../specialRateTrigger` C/R/U/D [`SpecialRateTriggerController`] · Transport types `transportTypes` C/R/U [`TransportController`] · Branches `carriers/{cid}/branch` C/R/U/D [`CarrierAccountController`] |
| **UI** | `settings/*` [SRS L133] |
| **Evidence** | [ROUTE-CAT]; `confirmed` (routes); UI screens `inferred` (legacy V1). |

#### Feature: Carrier account preferences & parameters
| Aspect | Value |
|---|---|
| **ID** | FEAT-019 · **Status** Stable (prod, V1) |
| **Endpoints** | `GET carriers/{cid}` / `.../preferences` / `.../parameters*`, `POST/PUT .../parameters`, `PUT .../preferences`, email templates C/R/U/D, terms & conditions, shortcuts [ROUTE-CAT `CarrierAccountController` 73] |
| **Evidence** | [ROUTE-CAT]; `confirmed`. Account creation itself is via public solicitude flow (FEAT-025). |

### 2.7 Affiliates (eAfiliado / ATC) & GNet

#### Feature: Affiliate agreements + one-shot travels (ATC network)
| Aspect | Value |
|---|---|
| **ID** | FEAT-020 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST affiliateAgreement/sendAgreementInvitation`, `.../{aid}/{accept,decline}AffiAgreement`, `.../updateAgreementValidity`; one-shot `POST affiOneShotTravel/createOSTravelAgreement`, `.../{id}/{accept,decline}`, `PUT .../{id}/quotingTravel`; profile `POST/PUT affiliateProfile` [ROUTE-CAT `AffiAgreementController`, `AffiOSTravelController`, `AffiliateProfileController`] |
| **UI** | `affiliate/*` incl. `affiliate/atc-profile`→`AffiliateProfileComponent` [GLOSSARY L73]; POMs `AffiliateLiquidation{Detail,ListWithId}Page`, `AffiliateCheckingAccount{,Detail}Page` [MX-5646/5647/5648/5554, P1] |
| **Evidence** | [ROUTE-CAT]; [POM]; [GLOSSARY]; `confirmed`. |

#### Feature: Affiliate checking accounts + liquidations
| Aspect | Value |
|---|---|
| **ID** | FEAT-021 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST affiCheckingAccount/createCheckingAccount`, `GET .../paginated`, `POST .../{id}/addLiquidation` / `addMovement`, `DELETE .../{caid}/deleteLiquidation/{lid}` [ROUTE-CAT `AffiCheckingAccountController`] |
| **UI** | `affiliate/checking-account`, `.../checking-account-detail/:id`, `.../liquidation-detail/:id` [POM affiliate/* ] |
| **Evidence** | [ROUTE-CAT]; [POM]; `confirmed`. |

#### Feature: GNet / ODN external dispatch (farm-in / farm-out)
| Aspect | Value |
|---|---|
| **ID** | FEAT-022 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST odn/{cid}/newRequest`, `.../createTrip`, `.../updRequest`, `.../cancelRequest`, `POST odn/requestTripByGNET`, `POST odn/updateTripByGNET` (inbound), providers/vehicle-type reads [ROUTE-CAT `ODNController` 16] |
| **UI** | `gnet/farm-in`, `gnet/credit-accounts` [POM `GnetFarmInPage` MX-5573 P2, `GnetCreditAccountsPage` MX-5574 P2] |
| **Evidence** | [ROUTE-CAT]; [POM]; [DATA-MAP flow 5]; `confirmed` (surface); flow `inferred`. |

### 2.8 Reports (~18 screens)

#### Feature: Reporting suite
| Aspect | Value |
|---|---|
| **ID** | FEAT-023 · **Status** Stable (prod, V1) |
| **Endpoints** | Mostly generic report engine `POST data/genericReport/{code}/paginated` / `.../totals`, `POST data/genericCSV/{code}` [ROUTE-CAT `DataController`]; plus domain reports in Billing/Liquidation controllers |
| **UI (18 report screens, all [POM]-inventoried)** | daily [MX-5438 P1], unpaid-travels [MX-5531 P1], travels-list [MX-5711 P2], segments-travels [MX-5553 P1], tips [MX-5560 P1], documentation [MX-5569 P1], transaction-tracking [MX-5565 P2], taxes-and-fees [MX-5566 P2], payment-flow [MX-5568 P2], debt-aging [MX-5561 P2], cash-flow [MX-5562 P2], agency-commissions [MX-5571 P2], ranking-{clients,drivers,vehicles} [MX-5711 P2], corporate-services-type [MX-5711 P2], cost-center-report [MX-5711 P2], individual-ca-travels [MX-5711 P2] [POM] |
| **Evidence** | [POM] (routes + tickets confirmed); backing report `code`s `inferred` (generic engine). |

### 2.9 Integrations & admin  → see Sections 6 (integrations) and 2.10

### 2.10 Admin / access / platform

#### Feature: RBAC — Magiis Access profiles
| Aspect | Value |
|---|---|
| **ID** | FEAT-024 · **Status** Stable (prod, V1) |
| **Endpoints** | `POST/PUT/GET/DELETE magiisaccess/carrierprofile*`, `.../contractorprofile*`, user-profile assignment, `GET magiisaccess/portal/{n}/menu` [ROUTE-CAT `MagiisAccessController` 20] |
| **UI** | admin screens **commented out** in V2 routing [FE-V2 L120-458] — legacy V1 / not migrated |
| **Evidence** | [ROUTE-CAT]; `confirmed` (routes); V2 UI absent (gap). |

#### Feature: Account solicitude / self-registration (public)
| Aspect | Value |
|---|---|
| **ID** | FEAT-025 · **Status** Stable (prod) · public/unauthenticated |
| **Endpoints** | `POST carrierAccounts/solicitude` + `PUT .../confirm/{token}` + step2/step3, `POST contractorAccounts/solicitude` + confirm, `POST passengers` [ROUTE-CAT `CarrierAccountSolicitudeController`, `ContractorAccountSolicitudeController`]; public per [SRS L308-310] |
| **Evidence** | [ROUTE-CAT]; [SRS security]; `confirmed`. |

#### Feature: Auth / login  *(LIVE in V2)*
| Aspect | Value |
|---|---|
| **ID** | FEAT-026 · **Status** Stable · **FE-V2** LIVE |
| **Endpoints** | `POST auth/login` (header `RoleToAttempt: ROLE_CARRIER`), `POST users/refreshToken`, `POST users/resetPassword`, `PUT users/{uid}/changePassword` [ROUTE-CAT `UserController`; SRS L294-296] |
| **Evidence** | [SRS security]; [FE-USE L13 — the other migrated V2 screen]; `confirmed`. |

---

## 3. CRUD matrix

Per entity, capability × endpoint evidence. Legend: ✅ Full · ⚠️ Partial/soft/conditional · ❌ Not exposed.
"Soft" delete = deactivate/invalidate/cancel rather than physical delete. All routes from [ROUTE-CAT].

| Entity | C | R | U | D | Evidence (controller · representative route) |
|---|---|---|---|---|---|
| Travel / Trip | ✅ | ✅ | ✅ | ⚠️ cancel | `TravelController` · `POST/GET .../travels`, `PUT .../{tid}/update`, `PUT .../{tid}/cancel` |
| Trip Other-Cost line | ⚠️ payload | ✅ | ✅ | ❌ | `TravelController` · `GET/PUT .../{tid}/otherCost/{ocId}` (create carried in simulate/update payload) |
| Other-Cost concept (catalog) | ✅ | ✅ | ✅ | ✅ | `CarrierOtherCostController` · `otherCosts/{new,search,update,delete}` |
| Quote | ✅ | ✅ | ✅ | ⚠️ cancel | `QuoteController` · `POST quotes/quote`, `GET .../detail`, `PUT .../cancel` |
| Recurring trip | ⚠️ flag | ✅ | ✅ | ✅ | `RecurringTripController` · create via `isRecurringTrip` on travel; `PUT .../{rid}/delete` |
| Carrier account | ⚠️ solicitude | ✅ | ✅ | ❌ | `CarrierAccountController` + `CarrierAccountSolicitudeController` |
| Carrier branch | ✅ | ✅ | ✅ | ✅ | `CarrierAccountController` · `PUT/POST/GET/DELETE .../branch` |
| Carrier user | ✅ | ✅ | ✅ | ⚠️ soft | `CarrierUserController` · `POST carriers/create`, `POST carriers/delete/{uid}` |
| Fare / rate | ✅ | ✅ | ✅ | ✅ | `CarrierRateController` · `carriers/rate/*`, `DELETE .../{rid}/delete` |
| Carrier zone | ✅ | ✅ | ✅ | ✅ | `CarrierZoneController` · `carriers/{cid}/carrierZone*` |
| Carrier area | ✅ | ✅ | ✅ | ✅ | `CarrierAreasController` · `.../carrierArea*` |
| Service type | ✅ | ✅ | ✅ | ✅ | `CarrierServiceTypesController` · `.../serviceTypes/*` (D via POST) |
| Concept / Tax | ✅ | ✅ | ✅ | ✅ | `CarrierConceptTaxController` · `.../concept`,`.../tax` (D via POST) |
| Special-rate trigger | ✅ | ✅ | ✅ | ✅ | `SpecialRateTriggerController` · `.../specialRateTrigger/*` |
| Transport type | ✅ | ✅ | ✅ | ❌ | `TransportController` · `transportTypes*` (only image delete exists) |
| Driver | ✅ | ✅ | ✅ | ⚠️ operability | `DriverUserController` + `DriverAccountController` |
| Vehicle | ✅ | ✅ | ✅ | ❌ | `VehicleController` · `vehicles*` (no delete) |
| Owner (vehicle owner) | ✅ | ✅ | ✅ | ❌ | `VehicleOwnerController` · `.../vehicleOwners*` |
| Client (individual) | ✅ | ✅ | ✅ | ✅ | `ClientController` · `carriers/{cid}/clients*` |
| Contractor account | ⚠️ solicitude/relation | ✅ | ✅ | ❌ | `ContractorAccountController` + `CarrierContractorRelationController` |
| Contractor employee | ✅ | ✅ | ✅ | ✅ | `ContractorEmployeeController` · `contractorEmployees*` |
| Contractor area | ✅ | ✅ | ✅ | ✅ | `ContractorAreaController` · `contractorsAreas*` |
| Cost center | ✅ | ✅ | ✅ | ❌ | `CostCenterController` · `costCenters*` |
| Liquidation (all parties) | ✅ | ✅ | ⚠️ contractor/user only | ⚠️ invalidate | `Carrier{Contractor,Driver,Owner,User}LiquidationController` |
| Checking account | ✅ | ✅ | ✅ | ❌ | `CheckingAccountController` + carrier-scoped variants |
| Billing settlement | ✅ | ✅ | ✅ | ⚠️ delete-settlement | `BillingController` · `billing/admin/carrierServices/*`, `PUT .../deleteSettlement` |
| Affiliate profile | ✅ | ✅ | ✅ | ❌ | `AffiliateProfileController` · `affiliateProfile*` |
| Affiliate agreement | ✅ | ✅ | ⚠️ validity/accept/decline | ❌ | `AffiAgreementController` |
| Affiliate checking acct | ✅ | ✅ | ⚠️ movement/liquidation | ⚠️ deleteLiquidation | `AffiCheckingAccountController` |
| ODN/GNet request | ✅ | ✅ | ✅ | ⚠️ cancel | `ODNController` · `odn/{cid}/*` |
| API integration app | ✅ | ✅ | ✅ | ✅ | `ApiIntegrationController` · `api*`, `DELETE api/applications/{ids}` |
| WhatsApp Business config | ✅ | ✅ | ✅ | ✅ | `WhatsappBusinessIntegrationController` · `api/whatsapp-business/carriers/{cid}*` |
| Mailchimp template | ✅ | ✅ | ✅ | ✅ | `MailchimpEmailController` · `vendor/mailchimp/{uid}/templates*` |
| Admin user | ✅ | ✅ | ✅ | ❌ | `AdminUserController` · `admins*` (no delete route) |
| RBAC profile (magiisaccess) | ✅ | ✅ | ✅ | ✅ | `MagiisAccessController` · `magiisaccess/{carrier,contractor}profile*` |
| CSV mapper / conversion profile | ✅ | ✅ | ✅ | ✅ | `DataController` + `MapperController` · `data/csv/mapperTravels*`, `mapper/{cid}/conversionProfile*` |

**37 entity rows.** Cross-check vs [DATA-MAP] Core Entities: all 16 data-map entities have ≥1 CRUD feature (no orphan data). Passenger CRUD is owned by `PassengerUserController` (pax app scope), reachable from Carrier only via checking-account/liquidation reads — intentionally out of the Carrier operator's write surface.

---

## 4. API endpoint inventory (by domain — controller level)

Full route list = [ROUTE-CAT] (65 controllers / ~787 routes). Verb split GET 48% / POST 29% / PUT 19% / DELETE 4% [SRS L91]. Auth = JWT Bearer unless public (see Section 7). Grouping mirrors [SRS L102-113].

| Domain | Controllers (route count where notable) | Auth |
|---|---|---|
| Travel / Trips | `TravelController` (78), `TravelProcessesController`, `RecurringTripController`, `QuoteController`, `FlightsController`, `MapperController` | authenticated |
| Carrier config | `CarrierAccountController` (73), `CarrierAccountSolicitudeController` (public create), `CarrierUserController`, `CarrierAreasController`, `CarrierZoneController`, `CarrierServiceTypesController`, `CarrierRateController`, `CarrierConceptTaxController`, `CarrierOtherCostController`, `SpecialRateTriggerController`, `OperationCharacteristicController` | authenticated (solicitude public) |
| Drivers / Vehicles / Owners | `DriverAccountController` (23), `DriverUserController`, `VehicleController`, `VehicleOwnerController`, `TransportController`, `OwnerPortalController` | authenticated |
| Clients / Contractors | `ClientController`, `ContractorAccountController`, `ContractorUserController`, `ContractorEmployeeController`, `ContractorAreaController`, `CostCenterController`, `ContractorAccountSolicitudeController` (public), `AbleToUseContractorController`, `CarrierContractorRelationController` | authenticated (solicitude public) |
| Billing / Settlement | `BillingController` (24), `Carrier{Contractor,Driver,Owner,User}LiquidationController`, `CheckingAccountController`, `PaymentController`, `CardController`, `VendorController` | authenticated |
| Affiliates (ATC) | `AffiAgreementController`, `AffiCheckingAccountController`, `AffiOSTravelController`, `AffiliateProfileController` | authenticated |
| GNet / dispatch | `ODNController` (16), `MultiRegionController` | authenticated + inbound webhooks |
| Integrations | `ApiIntegrationController`, `MailchimpEmailController` (15), `WhatsappBusinessIntegrationController` (9), `AIController` (Melita), `MagiisServicesCostController` | authenticated |
| Reports / Dashboard / Data | `DashboardController`, `DataController` (28), `PlacesController` | authenticated |
| Admin / Access / Platform | `AdminUserController` (23), `MagiisAccessController` (20), `UserController`, `UserTrailController`, `MagiisEmergencyController`, `ConfigController` (public serverInfo), `VersionsController`, `TestController`, `BaseController`, `PassengerUserController` (54, pax scope) | authenticated (some public) |

---

## 5. UI component inventory (Carrier V2 [POM] + [FE-V2] routes)

### Views / list screens
| Screen | Route | POM | Ticket | Priority | FE-V2 state |
|---|---|---|---|---|---|
| Dashboard / Operations Control | `dashboard` | `DashboardCarrierPage`, `OperationsControlPage` | MX-5711 | P1 | **LIVE** |
| Map viewer | `map-viewer` | `MapViewerPage` | MX-5559 | P1 | wired |
| Trip dashboard | `travel/dashboard` | `TravelDashboardPage` | MX-5529 | P1 | wired |
| Quotes | `travel/quotes` | `TravelQuotesPage` | MX-5572 | P1 | wired |
| Recurring trips | `travel/recurring` | `TravelRecurringPage` | MX-5537 | P1 | wired |
| Drivers | `driver/list` | `DriverListPage` | MX-5711 | P1 | wired |
| Vehicles | `vehicle/list` | `VehicleListPage` | MX-5711 | P1 | wired |
| Owners | `owner/list` | `OwnerListPage` | MX-5604 | P1 | wired |
| Individual clients | `client/list` | `ClientListPage` | MX-5197 | P1 | wired |
| Settlements ×4 parties (list/detail/history) | `liquidations/{contractors,passenger,drivers,owners}/*` | `Settlements*Page` (12 POMs) | MX-5647 | P1 | wired |
| Affiliate checking acct / liquidations | `affiliate/*` | 4 affiliate POMs | MX-5554/5646/5647/5648 | P1 | wired |
| GNet farm-in / credit accounts | `gnet/*` | `GnetFarmInPage`, `GnetCreditAccountsPage` | MX-5573/5574 | P2 | wired |
| Reports (18 screens) | `reports/*` | 18 Report POMs | MX-5438/5531/5711/… | P1–P2 | wired |
| Other-costs catalog | `settings/otherCosts` | `SettingsOtherCostsPage` | MX-5575 | P3 | wired |

### Forms / editors
| Form | Route | Component |
|---|---|---|
| New trip | `travel/create` | `NewTripComponent` [FE-V2 L496] |
| Trip detail / edit (+ Other-Cost modal — FEAT-002) | `travel/detail/:id` | `TravelDetailComponent` [FE-V2 L497] |
| New contractor / import | `client/contractor/new`, `client/contractors/import` | contractor components [FE-V2 L514-539] |
| Fare list / rules | `settings/travel-fare-list`, `settings/travel-fare-rules` | `SettingsTravelFareList*` [FE-V2 L94-100] |
| Liquidation create | `liquidations/contractors/create/:id` | `ContractorLiquidationCreateComponent` [FE-V2 L564] |

### Actions / modals (representative)
| Action | Where | Backing endpoint |
|---|---|---|
| Add Other Cost to trip | trip edit modal | `POST carriers/{cid}/otherCosts/search` + `PUT .../travels/{tid}/update` |
| Cancel trip | trip detail | `PUT carriers/{cid}/travels/{tid}/cancel` |
| Invalidate liquidation | settlement detail | `PUT .../liquidation/{lid}/invalidate` |
| Confirm quote → travel | quotes | `POST quotes/quote/{qid}/confirmToTravel` |

---

## 6. Third-party integrations

Backend-mediated — validate via the backend, never against the provider directly [DATA-MAP; SRS External Services].

| Service | Purpose | Backend surface | Status | Features using it |
|---|---|---|---|---|
| Firebase Admin | RTDB + FCM push | RTDB update routes (`updPlatformStatusRTDB`, `updDriversNodoRTDB`) [ROUTE-CAT] | Active | Live map (FEAT-007), driver status |
| MercadoPago | Payments | `VendorController` `POST/DELETE vendor/mercadopago/*` [ROUTE-CAT] | Active | Trip payment, checking accounts |
| Stripe | Payments | `VendorController` `POST/DELETE vendor/stripe/*` | Active | Trip payment, checking accounts |
| Mailchimp | Email marketing | `MailchimpEmailController` (15) + `VendorController` mailchimp [ROUTE-CAT] | Active | Email campaigns, templates |
| Google Maps / Places | Geocoding / routing | `PlacesController` `places/{checkPlace,getPlace}` [ROUTE-CAT] | Active | Trip create/simulate (FEAT-001/002) |
| ODN / GNet | External trip dispatch | `ODNController` (16) + inbound `odn/updateTripByGNET`, `requestTripByGNET` [ROUTE-CAT] | Active | GNet farm-in/out (FEAT-022) |
| WhatsApp Business (Meta) | Messaging / scheduled-trip status | `WhatsappBusinessIntegrationController` (9) [ROUTE-CAT] | Active | Integrations screen |
| Melita | Branch / AI service | `AIController` `GET melita/branches/{cid}/{ratio}/{qty}/{type}` [ROUTE-CAT]; FE `melita/ai-branches` [SRS L278] | Active | AI branch suggestion |
| Authorize.net / eBiz | Payment vendors | `VendorController` `vendor/{authorize,ebiz}/*` [ROUTE-CAT] | Active (inferred) | Payments (regional) |

**Inbound webhooks / callbacks** [DATA-MAP; SRS L284-286]: ODN/GNet dispatch (`odn/...`); public account confirmation `PUT .../confirm/{token}` (email link); payment OAuth returns via `VendorController`.

---

## 7. Feature flags & WIP

No `FEATURE_` / `ENABLE_` / `BETA_` environment-flag convention was found on disk in the surveyed
artifacts (gap — backend `.env` / config not read). WIP is expressed instead through **commented-out
routes**, **migration tickets**, and **deprecated/dead endpoints**.

### Toggles / conditional gating (evidenced)
| Flag / gate | Description | Source |
|---|---|---|
| `RoleToAttempt: ROLE_CARRIER` | Login role selector header (not a feature flag but gates the whole portal) | [SRS L295] |
| `mode=3` edit gate | Trip edit enabled only in mode 3; blocked for FINISHED/LOST / Farm-In / One-Shot-offerer | [DATA-MAP state machine] |
| `ngx-permissions` blocks | Screen-level permission gating **mostly commented out** in V2 routing | [FE-V2 L120-469] |
| WhatsApp `scheduled-trips-enabled` | `PUT api/whatsapp-business/carriers/{cid}/scheduled-trips-enabled` per-carrier toggle | [ROUTE-CAT] |

### Planned / WIP / not-migrated
| Item | Evidence | Estimated status |
|---|---|---|
| Admin portal in V2 | Entire admin route block commented out `carrier.routing.ts` L120-458 | Not migrated — legacy V1 only |
| ~26 Carrier V2 screens | [POM] inventory exists with migration tickets, but only login+dashboard are live | Wired-only / pending dev migration [FE-USE L13] |
| Estimated POM routes | `README.md` template `@route ... (estimado - confirmar cuando dev migre el modulo)` | Placeholder routes — confirm post-migration |

### Dead / deprecated endpoints (do NOT cover / candidates to deprecate) [FE-USE L37-45]
| Endpoint | Verdict |
|---|---|
| `POST quotes/simulate` (`QuoteController.simulateQuote @Deprecated`) | **DEAD** — confirmed unused across carrier/driver/pax |
| `POST carriers/rate/{rid}/rule` (`addRule @Deprecated`) | Probable dead (confirm pax N/A) |
| `PUT payments/movement/{id}/invalidate` (`@Deprecated`) | Probable dead |
| `GET users/{uid}/cards/app/{appId}` (`getAllByUser @Deprecated`) | Probable dead (superseded by `passengers/...`) |
| `POST drivers/{id}/reportNumericLocation` (`...Old`) | **LIVE — do NOT remove** (driver app v2 GPS) |

---

## 8. QA relevance

### High-risk features (prioritize testing)
| Feature | Risk | Reason |
|---|---|---|
| FEAT-002 Trip pricing / Other Costs | **HIGH** | Money + active defect area (MX-6024/MX-6052); Hibernate orphan-collection rollback fixed v1.72.6 |
| FEAT-013 Liquidations / settlements | **HIGH** | Money movement across 4 parties; delete is soft (invalidate) — reversibility risk |
| FEAT-014/015 Checking accounts / Billing | **HIGH** | Balance integrity, PDF generation, payment status |
| FEAT-026/025 Auth / solicitude | **HIGH** | Security; public endpoints; JWT in localStorage (`carrier-0`) |
| FEAT-022 GNet/ODN dispatch | **MED-HIGH** | External integration, inbound webhooks, cross-carrier money |
| Integrations (MP, Stripe, Mailchimp, WhatsApp) | **HIGH** | Third-party contracts; validate via backend only |
| FEAT-001 Travel lifecycle | **MED** | Central flow; state-machine transitions not fully verified (gap) |
| FEAT-016 Fares | **MED** | Pricing input; one deprecated rule endpoint |

### Feature test-coverage matrix (automation-readiness)
Levels reflect the V2 automation repo's POM inventory + backend API suite. "E2E" = Carrier V2 Playwright POM present; "API" = covered by `magiis-api-e2e` controller specs; unit tests are out of QA scope (backend Java not on disk).

| Feature | API (magiis-api-e2e) | E2E (V2 POM) | Live in V2 | Status |
|---|---|---|---|---|
| FEAT-001 Travel lifecycle | ⚠️ partial (live endpoint) | ✅ POM | ❌ | Needs V2-live + full API |
| FEAT-002 Other Costs | ⚠️ | ✅ (`SettingsOtherCostsPage`) | ❌ | **Priority** — active defect |
| FEAT-003 Quotes | ⚠️ | ✅ `TravelQuotesPage` | ❌ | Needs coverage |
| FEAT-006 Dashboard | ⚠️ | ✅ | ✅ **LIVE** | Automatable now |
| FEAT-013 Settlements | ⚠️ | ✅ 12 POMs | ❌ | High priority |
| FEAT-020/021 Affiliates | ⚠️ | ✅ 4 POMs | ❌ | Needs coverage |
| FEAT-022 GNet | ⚠️ | ✅ 2 POMs | ❌ | Needs coverage |
| FEAT-023 Reports (×18) | ⚠️ generic engine | ✅ 18 POMs | ❌ | Bulk, mostly P2 |
| FEAT-026 Auth | ✅ | ✅ | ✅ **LIVE** | Automatable now |

> Only Dashboard + Auth are E2E-automatable against live V2 today; the rest await dev migration
> (their POMs are pre-built scaffolding). Prioritize API-level coverage of the 357 live endpoints
> [FE-USE L49] and the two confirmed prod bugs (`GET carriers/{id}/travels/paginated` SQLGrammar,
> `GET admins/paginated` 500-with-CARRIER) [FE-USE L30-31].

---

## 9. Discovery Gaps

- [ ] **Backend Java source not read** — feature internals, service logic, validation, and the 18 `@Scheduled` job bodies are inferred from [ROUTE-CAT] + [DATA-MAP]. Confirm against `magiis-be`.
- [ ] **No feature-flag system located** — no `FEATURE_`/`ENABLE_`/`BETA_` env convention found in surveyed files; backend config / `.env` not on disk. WIP inferred from commented routes + migration tickets only.
- [ ] **FE-V2 liveness per screen** — only login + dashboard confirmed live [FE-USE L13]; all other V2 POM screens are "wired-only" scaffolding. Per-screen live/absent status must be confirmed with dev as modules migrate. POM `@route`s tagged "estimado" are placeholders.
- [ ] **CRUD delete semantics** — several "delete" verbs are POST-based soft deletes (service types, concepts, carrier user) or invalidate/cancel (travel, quote, liquidation). Physical vs logical deletion not verifiable without DDL. Entities marked ❌ delete (vehicle, owner, cost center, admin) may delete via an unrouted admin path.
- [ ] **Report `code` catalog** — 18 report screens map to a generic `data/genericReport/{code}` engine; the `code`↔report mapping is not on disk (inferred by screen name).
- [ ] **Passenger / driver mobile features** — owned by `PassengerUserController` (54) / `DriverUserController`; only the Carrier-facing slice is mapped here. Pax app endpoint usage is not statically extractable [FE-USE L21-23].
- [ ] **Auth roles beyond ROLE_CARRIER** — admin/driver/contractor/owner roles implied by controllers; exact `ROLE_*` set not enumerated on disk [SRS L304-307].
- [ ] **Endpoint/controller count drift** — 63 vs 65 controllers, 767 vs 787 vs 717 routes across sources [SRS L328-330; FE-USE L6]. Counts approximate.

---

*Reverse-engineered business-feature-map · read-only survey · 2026-07-13. Feature-centric complement
to `business-data-map.md`. Soft input for `/master-test-plan` + `/business-api-map`; consumed by
`project-discovery` + `sprint-testing` for ATP planning and risk scoping.*
