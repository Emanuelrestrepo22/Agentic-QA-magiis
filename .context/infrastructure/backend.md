# Backend — MAGIIS Carrier (`magiis-be`)

> Reverse-engineered from on-disk automation-repo artifacts (`magiis-api-e2e`). The
> `magiis-be` Java source is NOT among these artifacts — only derived catalogs, an
> OpenAPI spec, and the API client. Every fact below cites its source file. Where a
> fact could not be derived, see **Discovery Gaps**.

## Runtime

| Aspect | Value | Source |
| --- | --- | --- |
| Component / version | `magiis-be` v1.72.2 (API v0.2) | `docs/reference/backend-endpoints-v1.72.2.md` (metadatos) |
| Framework | Spring Boot 2.0.0 | `docs/reference/backend-endpoints-v1.72.2.md` |
| Language | Java 8 | `docs/reference/backend-endpoints-v1.72.2.md` |
| Persistence | JPA / Hibernate | `docs/reference/backend-endpoints-v1.72.2.md` |
| DB dialect | Oracle (`Oracle10gDialect`, driver `ojdbc8`) | `docs/reference/backend-endpoints-v1.72.2.md` |
| Packaging | WAR (servlet-container deploy) | `docs/reference/backend-endpoints-v1.72.2.md` |
| API base prefix | `magiis-v0.2/` | `.env.example` (`MAGIIS_API_PREFIX`), `tests/config/runtime.ts` (`resolveMagiisPrefix` default) |
| Auth model | JWT bearer (`Authorization: Bearer`); bounded public-endpoint set | `docs/reference/backend-endpoints-v1.72.2.md`, `openapi.yaml` (`securitySchemes.bearerAuth`) |

OpenAPI declares `bearerAuth` as `type: http, scheme: bearer, bearerFormat: JWT`
with a global `security: [bearerAuth: []]` (`openapi.yaml` lines 15-16, 25101-25105).

## Environments

Effective base = `{host}` + `/magiis-v0.2` prefix. Full URLs from `openapi.yaml`
`servers:` block (lines 8-14) unless noted.

| Env | Base URL | Source | Notes |
| --- | --- | --- | --- |
| TEST (default) | `https://apps-test.magiis.com/magiis-v0.2/` | `openapi.yaml` servers; `.env.example` (`BASE_URL`, `AUTH_API_URL`) | Default `ENV=test` in `runtime.ts` |
| UAT (staging) | `https://apps-uat.magiis.com/magiis-v0.2/` | `openapi.yaml` servers | — |
| DEV | `http://apps-dev2.magiis.com:8080/magiis-v0.2/` | `openapi.yaml` servers | Non-TLS, port 8080 (spec lists `http://`) |
| PROD | `https://api.apps.magiis.com/` | `.agents/project.yaml` `environments.production.api_url` | **NEEDS CONFIRM** — not in `openapi.yaml` servers; prefix not shown; `project.yaml` marks it discovered from `environment.prod.ts` (public API: `https://api.public.magiis.com/`) |

## Auth flow

Single JWT login. Client: `tests/clients/magiis-api-client.ts` (`ensureToken`, lines 37-58).

- **Request**: `POST {baseUrl}/{magiisPrefix}/auth/login`
  — i.e. `https://apps-test.magiis.com/magiis-v0.2/auth/login`
  (`resolveAuthApiUrl`, `runtime.ts` lines 51-56; overridable via `AUTH_API_URL`).
- **Headers**:
  - `Content-Type: application/json`
  - `RoleToAttempt: ROLE_<ROLE>` — role uppercased, e.g. `ROLE_CARRIER`
    (`magiis-api-client.ts` line 32 `this.role = \`ROLE_${cfg.role.toUpperCase()}\``, sent line 44).
- **Body** (JSON): `{ "username": "<user>", "password": "<pass>" }`
  (`magiis-api-client.ts` line 46 `data: { username, password }`).
  The backend `CredentialsDTO` also accepts `secureKey` / `token` variants
  (per `docs/reference/backend-endpoints-v1.72.2.md` public-endpoint notes), but the
  client only sends username/password.
- **Response**: HTTP 200 with JSON `{ "token": "<jwt>" }`. The client throws on any
  non-200 and on a missing `.token` field (lines 50-56).
- **Subsequent calls**: `Authorization: Bearer <token>` on every authenticated request
  (`magiis-api-client.ts` line 102). Token cached in memory; `forceLogin` / `clearToken`
  re-issue it.

Verbatim client auth core (`tests/clients/magiis-api-client.ts` lines 40-57):

```ts
const resp = await this.request.fetch(this.authUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', RoleToAttempt: this.role },
  data: { username, password },
  timeout: 30_000,
  failOnStatusCode: false
});
if (resp.status() !== 200) { /* throw Login failed */ }
const parsed = (await resp.json()) as { token?: string };
if (!parsed.token) throw new Error('Login response missing .token field');
this.cachedToken = parsed.token;
```

**Public / unauthenticated endpoints** (no JWT): login / master login · carrier &
contractor solicitude creation + confirmation · passenger registration · password
recovery / change · user-existence check · country catalog · `config/serverInfo`
(`docs/reference/backend-endpoints-v1.72.2.md`).

## Commands

The `magiis-be` Java build/run commands are NOT derivable from these artifacts
(see Discovery Gaps). What IS known operationally:

```bash
# Deploy model: Spring Boot WAR into a servlet container; API served under the
# /magiis-v0.2 context prefix. (magiis-be v1.72.2 — build/run tooling unknown.)

# Environment contract consumed by the automation client (tests/config/runtime.ts):
#   ENV=test|uat|prod
#   BASE_URL=https://apps-test.magiis.com
#   MAGIIS_API_PREFIX=magiis-v0.2/
#   AUTH_API_URL=https://apps-test.magiis.com/magiis-v0.2/auth/login
#   LOGIN_USER=<username>        LOGIN_PASSWORD=<password>
#   LOGIN_ROLE=ROLE_CARRIER
#   MAGIIS_TEST_CARRIER_ID=1040  MAGIIS_TEST_DRIVER_ID=1203

# Smoke the live backend (auth): POST the login endpoint
curl -sS -X POST "https://apps-test.magiis.com/magiis-v0.2/auth/login" \
  -H "Content-Type: application/json" \
  -H "RoleToAttempt: ROLE_CARRIER" \
  -d '{"username":"'"$LOGIN_USER"'","password":"'"$LOGIN_PASSWORD"'"}'
# → 200 { "token": "<jwt>" }  then: Authorization: Bearer <jwt>
```

> Real `mvn` / `gradle` build, WAR name, and container start commands are a Discovery Gap.

## Scale

All figures from `docs/reference/backend-endpoints-v1.72.2.md` (v1.72.2 doc).

| Metric | Value |
| --- | --- |
| REST endpoints | **767** across **63 controllers** |
| Verb split | GET 370 (48%) · POST 226 (29%) · PUT 143 (19%) · DELETE 28 (4%) |
| JPA entities | 271 (~2594 columns) |
| Repositories | 259 |
| SQL migrations | 251 |
| `@Scheduled` jobs | 18 |

**Largest controllers (business core)**: `TravelController` (~77) ·
`CarrierAccountController` (~75) · `PassengerUserController` (54) · `DataController` (28)
· `DriverAccountController` (25) · `AdminUserController` (23) · `BillingController` (22)
· `MagiisAccessController` (21).

**Central tables (most columns)**: `travel_history` (121) · `travel` (86) ·
`quotes` (77) · `odn_trip_requests` (72) · `travel_audit` (48) · `recurring_trips` (45)
· `carrierAccount` (38).

**External integrations (high risk — validate via backend, never at provider)**:
Firebase Admin (RTDB + FCM) · MercadoPago · Stripe · Mailchimp · Google Maps/Places ·
ODN/GNet (external dispatch) · Melita · WhatsApp Business (Meta).

**Inbound webhooks / callbacks**: ODN/GNet dispatch (`odn/...`) · account confirmation
(`PUT .../confirm/{solicitudeToken}` from email) · payment OAuth returns in
`VendorController`.

## Discovery Gaps

1. **Backend Java source absent from these artifacts.** Only derived artifacts are
   available (`docs/reference/backend-endpoints-v1.72.2.md`, `openapi.yaml`,
   `scripts/backend-route-catalog.json`). The catalog `_meta` references a local clone
   path (`.../Escritorio/magiis-be`) as its provenance, but that source is not part of
   the artifact set used here — controller internals, service logic, and config
   (`application.yml`, datasource) are unverified.
2. **No Oracle DDL.** Table/column counts come from the derived doc; no schema DDL,
   constraints, indexes, or migration files (251 SQL migrations referenced but not on hand).
3. **Version drift across sources** — reconcile before trusting a single count:
   - Repo README / Postman snapshot: v1.72.1, 851 Postman requests.
   - Backend doc (primary here): v1.72.2 / API v0.2, **767 endpoints · 63 controllers**.
   - `openapi.yaml` (generated from source): **737 paths · 802 operations · 601 DTO schemas**.
   - Route catalog derived from source (`backend-route-catalog.json`): **65 controllers · 787 endpoints** (ground truth per that doc).
   This file uses the v1.72.2 doc figures as primary; other counts noted for reconciliation.
4. **Real build/run commands unknown.** WAR packaging + `/magiis-v0.2` prefix confirmed;
   Maven/Gradle targets, WAR artifact name, and container startup are undocumented here.
5. **PROD base URL unconfirmed.** `https://api.apps.magiis.com/` comes from
   `.agents/project.yaml` (not `openapi.yaml` servers) and omits the `magiis-v0.2` prefix
   shown for other envs — confirm host + prefix against a live PROD deployment.
6. **No valid UAT/TEST credentials.** `.env.example` ships `LOGIN_USER` / `LOGIN_PASSWORD`
   empty; real credentials must be supplied per environment (`.env.<env>`, never committed).
