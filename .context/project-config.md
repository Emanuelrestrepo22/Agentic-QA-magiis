# Project Config — MAGIIS Carrier

> Fase 1 (Constitution). Datos de conexión, stack y assessment. Fuente: `magiis-fe`, `.agents/project.yaml`, Atlassian MCP.

## Repositories

| Rol | Ubicación | Notas |
|---|---|---|
| Frontend (target) | `C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\magiis-fe` | Angular 5, multi-portal. Git: `gitlab.com/repo.magiis/magiis-fe`, branch `release/v1.72.6` |
| Backend (target) | `C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\magiis-be` | Spring Boot (Java 8), WAR/Tomcat, `com.magiis.magiis`. Git: `gitlab.com/repo.magiis/magiis-be`, branch `release/v1.72.6` |

## Backend Stack (magiis-be)

- **Spring Boot** (starter-parent), **Java 8**, packaging **WAR** (Tomcat embebido). Módulos: web, data-jpa, jdbc, security, mail, thymeleaf.
- **Auth server-side**: Spring Security (`security/WebSecurity.java`) + JWT (`io.jsonwebtoken/jjwt`). Firebase-admin (push).
- **Persistencia**: JPA/Hibernate sobre **Oracle** (`ojdbc8`, `jdbc:oracle:thin:@...rds.amazonaws.com:1521/orcl`, `Oracle10gDialect`). H2 presente (tests).
- **Layout**: controllers, dto, entities, repositories, services, security, interceptors, **jobs** (cron), **engines** (pricing), projections, converters, aspects.
- **API contract**: **Swagger 2.0** (`@EnableSwagger2`, springfox) → `<api_url>/v2/api-docs` + `/swagger-ui.html`. ⚠️ Docket **filtrado a `checking-account-controller` + `travel-controller`** (parcial, no todo el API). Para `bun run api:sync` (openapi-typescript espera OAS3) requiere conversión Swagger2→OAS3.

> **DB para QA (trifuerza capa D)**: el DBHub MCP del boilerplate **NO soporta Oracle** (solo sqlserver/postgres/mysql/sqlite/mariadb). Validación de estado en DB requerirá cliente Oracle directo (sqlplus / SQL Developer / DBeaverX) o quedará fuera de alcance automatizado. Registrar como decisión en /adapt-framework.

## Tech Stack

- **Framework**: Angular **5.2.1** (template `@genesisui/angular` v1.8.14, Bootstrap 4 admin), Angular CLI 1.6.5.
- **Lenguaje**: TypeScript **2.5.3**. RxJS 5.5.6, zone.js 0.8.18.
- **Unit**: Karma 2.0.0 + Jasmine 2.8.0 + coverage-istanbul (sin thresholds). **E2E**: Protractor 5.2.2 (esqueleto).
- **Lint**: tslint 5.9.1 + codelyzer (relajado: `max-line-length=5000`, `member-access:false`).
- **Auth libs**: `jwt-decode` (JWT client-side), `firebase`/`angularfire2` (push), `ng-recaptcha`.
- **Mapas/UI pesado**: Leaflet (+draw/heat/routing/markercluster), DevExtreme 18.2, PrimeNG 6, ng2-charts, jspdf.
- **CI/CD**: GitLab `.gitlab-ci.yml` (1 job, stage deploy) → dispara **Jenkins** `do.magiis.com/.../MAGIIS-FE-UAT` solo en ramas `release/*`. Sin test/lint/build gate en CI.
- **Scripts build por env**: `build-qa|uat|uat2|preprod|prod` (cada uno con `run-script-before-build.js <env>`). `start:*` para local.

> Nota QA: el Angular 5 legacy es **irrelevante para Playwright** (caja negra contra URL desplegada). Sí importa para selectores (ver Assessment).

## Environments

Fuente: `src/environments/environment*.ts` + `ConfigService`.

| Env (project.yaml) | Nombre MAGIIS | web_url | api_url | production |
|---|---|---|---|---|
| qa | test | https://apps-test.magiis.com *(confirmar)* | https://apps-test.magiis.com/magiis-v0.2/ | false |
| staging | UAT | https://apps-uat.magiis.com *(confirmar)* | https://apps-uat.magiis.com/magiis-v0.2/ | false |
| production | prod | *(pendiente)* | https://api.apps.magiis.com/ | true |

- APIs adicionales por env: `publicApiUrl` (`/magiis-public/`), `notificationsApiUrl` (`/mmc-0.0.1/`), `traslatorApiUrl` (Yandex).
- `environment.ts` (default) == qa (apps-test).
- Sin enumerar: `dev2`, `uat2`, `preprod`.

## Issue Tracker / TMS

- Jira Cloud: `https://magiis.atlassian.net` (cloudId `56c215ad-7fd1-43cd-81a3-ee41d2a2aafd`).
- **project_key = MG** (MAGIIS-4). Carrier vive aquí como módulo/dominio (títulos `[Carrier v1/v2/IA]`).
- **Modalidad TMS = jira-native** (MG NO tiene Xray ni custom fields QA → fallback a comentarios). Xray sí existe en MX/AF.

## Project Assessment (Phase 1)

**Madurez QA: BAJA.**

| Dimensión | Estado |
|---|---|
| Unit tests | 224 `*.spec.ts` (proporción real vs stub `should create` sin medir); sin thresholds de cobertura |
| E2E | Protractor esqueleto (`e2e/app.e2e-spec.ts` únicamente) |
| CI gate | **Ninguno** — CI solo dispara deploy; nada bloquea release por tests |
| Lint/typecheck | tslint relajado; typecheck solo vía `ng build` |
| Selector readiness | **0** `data-testid/data-test/data-cy` en `src` → Playwright dependerá de `[formControlName]`, `type=`, role y CSS estructural |
| Stack | Angular 5 (EOL), TS 2.5, RxJS 5 — legacy, sin soporte |
| Seguridad | Keys client-side (Firebase/Google/reCAPTCHA/MP) commiteadas en `environment*.ts` (esperable en FE, pero prod en repo → verificar que ninguna sea secreto server-side) |

**Implicación para automatización**: priorizar agregar `data-testid` a flujos críticos (login, CTAs clave) antes de automatizar, o estandarizar en selectores `[formControlName]`. Locators por placeholder/texto son frágiles (i18n).

## Discovery Gaps

- [ ] web_url real por env (inferido = mismo host que API; FE podría estar en subpath).
- [ ] Backend repo/stack (no en disco).
- [ ] Dominio webapp prod (`environment.prod.ts` solo trae API).
- [ ] Proporción de specs significativos vs stubs.
