# Documentación de la Plataforma Jira + Xray

> _Traducción al español de [jira-platform.md](jira-platform.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Propósito**: Referencia completa para la integración de Jira/Xray en QA Automation (alineada con IQL)
> **Última actualización**: Febrero de 2026
> **Metodología**: Integrated Quality Lifecycle (IQL) — este documento es la referencia IQL canónica para el uso de Jira/Xray.
> **Relacionado**: `cli/xray.ts` (herramienta CLI), `tests/utils/jiraSync.ts` (utilidad de Sync)

---

## ¿Qué es Xray?

Xray es una **app nativa de Test Management para Jira** que extiende Jira con capacidades de testing. Usa el sistema nativo de issues de Jira, lo que significa que todos los tests, executions y plans son issues de Jira con acceso completo a workflows, custom fields, JQL y la Jira REST API.

### Conceptos clave

| Concepto | Descripción |
|---------|-------------|
| **Project** | Proyecto de Jira con Xray habilitado |
| **Test** | Issue type de test case |
| **Pre-Condition** | Requisitos de setup reutilizables |
| **Test Set** | Agrupación de tests |
| **Test Execution** | Contenedor para test runs |
| **Test Plan** | Planificación estratégica para versión/sprint |
| **Test Run** | Resultado individual de test dentro de una execution |
| **Requirement** | Story/Epic que los tests cubren |

---

## ¿Por qué Xray para Test Management?

### Ventajas

1. **Jira-Native**: los tests son issues de Jira — usá workflows, screens, JQL, permisos
2. **Trazabilidad completa**: enlazá tests con requirements, defects y executions
3. **Listo para empresas**: más de 10M de testers, más de 10.000 empresas en todo el mundo
4. **Integración CI/CD**: REST API para frameworks de automation (JUnit, Playwright, etc.)
5. **Soporte BDD**: integración nativa con Cucumber/Gherkin
6. **Reporting avanzado**: reportes integrados, gadgets y cobertura de requirements

### Limitaciones

1. **Dependencia de Jira**: requiere licencia de Jira Cloud o Data Center
2. **Curva de aprendizaje**: múltiples issue types y custom fields por entender
3. **Costo**: app de pago además de la licencia de Jira
4. **Diferencias de API**: las APIs de Cloud vs Server/DC son distintas

---

## Estructura de Issue Types alineada con IQL

> **Idea clave**: el Test Management System (TMS) sigue la metodología IQL, que define dos conceptos de estado distintos:
> - **Test Status** (Workflow): rastrea el estado de workflow de Jira del issue Test
> - **Execution Status** (Test Run): rastrea pass/fail de las corridas reales de tests

### Resumen de Issue Types de Xray

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                     XRAY ISSUE TYPE STRUCTURE (IQL-ALIGNED)                                ║
║                              "Your Project Test Suite"                                     ║
╠═══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                            ║
║  🧪 TEST (Issue Type)                                                                      ║
║  ┌──────────┬──────────────────────────────┬─────────────┬─────────────┬──────────────┐   ║
║  │ Key      │ Summary                      │ Test Type   │ Status      │ Test Repo    │   ║
║  │ (Auto)   │ (Text)                       │ (Select)    │ (Workflow)  │ (Folder)     │   ║
║  ├──────────┼──────────────────────────────┼─────────────┼─────────────┼──────────────┤   ║
║  │ PROJ-101 │ Login with valid credentials │ Generic     │ Automated   │ /Auth/Login  │   ║
║  │ PROJ-102 │ Password validation rules    │ Manual      │ Ready       │ /Auth/Login  │   ║
║  │ PROJ-103 │ Visual alignment check       │ Manual      │ Draft       │ /Auth/UI     │   ║
║  └──────────┴──────────────────────────────┴─────────────┴─────────────┴──────────────┘   ║
║                                                                                            ║
║  📁 TEST SET (Issue Type)                                                                  ║
║  ┌──────────┬────────────────────────────┬─────────────┬───────────────────────────┐      ║
║  │ Key      │ Summary                    │ Status      │ Tests (Link)              │      ║
║  ├──────────┼────────────────────────────┼─────────────┼───────────────────────────┤      ║
║  │ PROJ-200 │ Authentication Suite       │ Ready       │ PROJ-101, PROJ-102, ...   │      ║
║  │ PROJ-201 │ Bookings CRUD Suite        │ Ready       │ PROJ-110, PROJ-111, ...   │      ║
║  └──────────┴────────────────────────────┴─────────────┴───────────────────────────┘      ║
║                                                                                            ║
║  📋 TEST PLAN (Issue Type)                                                                 ║
║  ┌──────────┬────────────────────────────┬─────────────┬────────┬────────┬────────┐       ║
║  │ Key      │ Summary                    │ Fix Version │ Total  │ Passed │ Rate   │       ║
║  ├──────────┼────────────────────────────┼─────────────┼────────┼────────┼────────┤       ║
║  │ PROJ-300 │ Regression v2.0            │ 2.0.0       │ 45     │ 43     │ 95.5%  │       ║
║  └──────────┴────────────────────────────┴─────────────┴────────┴────────┴────────┘       ║
║                                                                                            ║
║  🔄 TEST EXECUTION (Issue Type)                                                            ║
║  ┌──────────┬────────────────────────────┬─────────────┬────────────┬──────────────┐      ║
║  │ Key      │ Summary                    │ Environment │ Status     │ Test Plan    │      ║
║  ├──────────┼────────────────────────────┼─────────────┼────────────┼──────────────┤      ║
║  │ PROJ-400 │ CI Run #142 - Staging      │ staging     │ Done       │ PROJ-300     │      ║
║  └──────────┴────────────────────────────┴─────────────┴────────────┴──────────────┘      ║
║                                                                                            ║
║  📊 TEST RUN (Not an Issue - Internal Entity)                                              ║
║  ┌───────────┬─────────┬───────────┬────────┬──────────┬─────────────────────────┐        ║
║  │ Test      │ Exec    │ Status    │ Time   │ Defects  │ Comment                 │        ║
║  ├───────────┼─────────┼───────────┼────────┼──────────┼─────────────────────────┤        ║
║  │ PROJ-101  │ PROJ-400│ PASS      │ 1.2s   │ -        │ -                       │        ║
║  │ PROJ-102  │ PROJ-400│ FAIL      │ 2.1s   │ PROJ-500 │ Timeout after 5000ms    │        ║
║  └───────────┴─────────┴───────────┴────────┴──────────┴─────────────────────────┘        ║
║                                                                                            ║
║  🔧 PRE-CONDITION (Issue Type)                                                             ║
║  ┌──────────┬────────────────────────────┬─────────────┬───────────────────────────┐      ║
║  │ Key      │ Summary                    │ Type        │ Associated Tests          │      ║
║  ├──────────┼────────────────────────────┼─────────────┼───────────────────────────┤      ║
║  │ PROJ-050 │ User logged in as Admin    │ Manual      │ PROJ-101, PROJ-102, ...   │      ║
║  └──────────┴────────────────────────────┴─────────────┴───────────────────────────┘      ║
║                                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Schemas de Issue Types (detallado)

### 1. Issue Type Test

El issue type principal para documentar test cases. Soporta tres test types.

| Campo | Tipo | Descripción | Valores |
|-------|------|-------------|--------|
| Key | Auto | Key del issue de Jira | PROJ-101, PROJ-102, ... |
| Summary | Texto | Título del test case | Nombre descriptivo |
| Description | Texto enriquecido | Descripción detallada | Soporta Markdown/wiki |
| Test Type | Selección | Categoría del test | Manual, Cucumber, Generic |
| Status | Workflow | Estado de workflow de Jira | Draft, Ready, Automated, Deprecated |
| Priority | Selección | Prioridad de negocio | Highest, High, Medium, Low, Lowest |
| Labels | Selección múltiple | Etiquetas | regression, smoke, api, e2e |
| Component | Selección | Área de feature | Auth, Bookings, Invoices, etc. |
| Fix Version | Selección | Versión objetivo | 1.0.0, 2.0.0, etc. |
| Linked Issues | Enlaces | Trazabilidad | covers Story, is blocked by Bug |
| Test Repository | Carpeta | Organización | /Module/Feature/Test |
| Manual Steps | Editor de steps | Para tests Manual | Steps con Expected Results |
| Gherkin Definition | Texto | Para tests Cucumber | Feature/Scenario |
| Generic Definition | Texto | Para Generic/Automated | Referencia de ID de automation |

#### Test Types

| Tipo | Descripción | Caso de uso |
|------|-------------|----------|
| **Manual** | Test case tradicional con steps | Tests ejecutados por humanos |
| **Cucumber** | BDD con sintaxis Gherkin | Especificación por ejemplo |
| **Generic** | Sin estructura, referencia de automation | Tests automatizados (Playwright, etc.) |

#### Workflow de Test Status (ciclo de vida IQL)

```
TEST STATUS LIFECYCLE FLOW (Jira Workflow):

  ┌────────┐       ┌───────────┐       ┌─────────┐
  │ Draft  │──────▶│   Ready   │──────▶│ Approved│
  └────────┘       └───────────┘       └────┬────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        │                   │                   │
                        ▼                   ▼                   ▼
                   ┌────────┐         ┌───────────┐       ┌───────────┐
                   │ Manual │         │Automating │       │Deprecated │
                   └────────┘         └─────┬─────┘       └───────────┘
                        │                   │
                        │                   ▼
                        │            ┌──────────────┐
                        │            │  Automated   │
                        │            └──────────────┘
                        │                   │
                        └───────────────────┘
                              (both are final states)
```

**Descripciones de estados:**

| Status | Descripción | Etapa IQL | Quién |
|--------|-------------|-----------|-----|
| **Draft** | Test case creado, esquema inicial | TMLC Etapa 4 | QA Analyst |
| **Ready** | Documentado y listo para revisión | TMLC Etapa 4 | QA Analyst |
| **Approved** | Revisado y aprobado para execution | TMLC | QA Lead |
| **Manual** | Designado solo para execution manual | TMLC | QA Analyst |
| **Automating** | Script en desarrollo | TALC Etapa 2 | QA Engineer |
| **Automated** | Script mergeado, parte de la regression suite | TALC Completo | QA Engineer |
| **Deprecated** | Ya no aplica | Cualquiera | Cualquiera |

### 2. Valores de Test Execution Status

Estos son los estados para los **Test Runs** (no del issue Test en sí):

| Status | Descripción | Color | Acción |
|--------|-------------|-------|--------|
| 📝 **TODO** | Test aún no ejecutado | Gris | Ejecutar en la próxima corrida |
| 🔄 **EXECUTING** | En ejecución actualmente | Azul | En progreso |
| ✅ **PASS** | Test aprobado | Verde | Mantener en regression |
| ❌ **FAIL** | Test fallido | Rojo | Investigar y corregir |
| ⚠️ **ABORTED** | Execution detenida | Naranja | Revisar y reintentar |
| 🚫 **BLOCKED** | No se puede ejecutar (dependencia) | Amarillo | Resolver el bloqueo |

### 3. Issue Type Test Set

Agrupa test cases por feature/module para una execution organizada.

| Campo | Tipo | Descripción | Valores |
|-------|------|-------------|--------|
| Key | Auto | Key del issue de Jira | PROJ-200, PROJ-201, ... |
| Summary | Texto | Nombre del test set | "Authentication Suite" |
| Description | Texto enriquecido | Propósito de la suite | Soporta Markdown |
| Status | Workflow | Estado de Jira | Open, Ready, etc. |
| Tests | Asociación | Test cases enlazados | PROJ-101, PROJ-102, ... |
| Labels | Selección múltiple | Categorización | regression, smoke, sanity |

### 4. Issue Type Test Plan

Rastrea el progreso de tests para una versión o sprint.

| Campo | Tipo | Descripción | Valores |
|-------|------|-------------|--------|
| Key | Auto | Key del issue de Jira | PROJ-300, PROJ-301, ... |
| Summary | Texto | Nombre del plan | "Regression v2.0" |
| Fix Version | Selección | Versión objetivo | 2.0.0 |
| Status | Workflow | Estado de Jira | Open, In Progress, Done |
| Tests | Asociación | Tests planificados | Desde Test Sets o individuales |
| Test Executions | Asociación | Executions enlazadas | PROJ-400, PROJ-401, ... |
| Test Plan Status | Calculado | Progreso general | Barra de progreso |

### 5. Issue Type Test Execution

Contenedor para test runs, representa un ciclo de test.

| Campo | Tipo | Descripción | Valores |
|-------|------|-------------|--------|
| Key | Auto | Key del issue de Jira | PROJ-400, PROJ-401, ... |
| Summary | Texto | Nombre de la execution | "CI Run #142 - Staging" |
| Test Plan | Enlace | Plan asociado | PROJ-300 |
| Test Environments | Selección múltiple | Entorno objetivo | dev, staging, prod |
| Revision | Texto | Build/versión | v2.0.0-beta.1 |
| Begin Date | Fecha/hora | Hora de inicio | Timestamp |
| End Date | Fecha/hora | Hora de fin | Timestamp |
| Status | Workflow | Estado de Jira | Open, In Progress, Done |
| Execution Status | Calculado | Estado general | Barra de progreso |

### 6. Issue Type Pre-Condition

Requisitos de setup reutilizables compartidos entre tests.

| Campo | Tipo | Descripción | Valores |
|-------|------|-------------|--------|
| Key | Auto | Key del issue de Jira | PROJ-050, PROJ-051, ... |
| Summary | Texto | Nombre de la pre-condition | "User logged in as Admin" |
| Pre-Condition Type | Selección | Coincide con el test type | Manual, Cucumber, Generic |
| Definition | Texto/Steps | Instrucciones de setup | Depende del tipo |
| Associated Tests | Enlace | Tests que la usan | PROJ-101, PROJ-102, ... |

---

## Requirements Traceability Matrix (RTM)

Xray provee trazabilidad integrada entre requirements y tests.

### Relaciones de cobertura

```
REQUIREMENT (Story/Epic)          TEST                    DEFECT
        │                           │                        │
        │       "covers"            │     "is tested by"     │
        ▼                           ▼                        ▼
┌─────────────┐              ┌─────────────┐          ┌─────────────┐
│   US-123    │◄─────────────│  PROJ-101   │─────────▶│   BUG-456   │
│   Story     │   covers     │    Test     │  reveals │    Defect   │
└─────────────┘              └─────────────┘          └─────────────┘

FORWARD TRACEABILITY ──────────────────────────────────────────▶
Question: "Does every requirement have test coverage?"

◀────────────────────────────────────────── BACKWARD TRACEABILITY
Question: "What requirement does this test case verify?"
```

### Estado de cobertura

| Estado | Ícono | Descripción |
|--------|------|-------------|
| Cubierto y aprobando | ✅ | Todos los tests pasan |
| Cubierto y fallando | ❌ | Algunos tests fallan |
| Cubierto y no ejecutado | ⏳ | Los tests existen pero no se corrieron |
| No cubierto | ⚠️ | No hay tests enlazados |

---

## Referencia de la Xray API

### Versiones de la API

| Versión | Plataforma | Base URL |
|---------|----------|----------|
| REST v1 | Server/DC | `{jira-base-url}/rest/raven/1.0` |
| REST v2 | Server/DC | `{jira-base-url}/rest/raven/2.0` |
| REST v2 | Cloud | `https://xray.cloud.getxray.app/api/v2` |
| GraphQL | Cloud | `https://xray.cloud.getxray.app/api/v2/graphql` |

### Autenticación

#### Cloud (API Key)

```bash
# 1. Obtener token de autenticación
curl -X POST \
  https://xray.cloud.getxray.app/api/v2/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'

# Respuesta: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Usar el token en requests posteriores
curl -X GET \
  https://xray.cloud.getxray.app/api/v2/tests \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Server/DC (Basic Auth o PAT)

```bash
# Basic Auth
curl -u username:password \
  https://jira.example.com/rest/raven/2.0/api/test

# Personal Access Token (Jira 8.14+)
curl -H "Authorization: Bearer YOUR_PAT" \
  https://jira.example.com/rest/raven/2.0/api/test
```

### Endpoints principales

#### Importar resultados de execution

| Formato | Endpoint (Cloud) | Endpoint (Server) |
|--------|------------------|-------------------|
| JUnit XML | `POST /api/v2/import/execution/junit` | `POST /rest/raven/2.0/import/execution/junit` |
| Cucumber JSON | `POST /api/v2/import/execution/cucumber` | `POST /rest/raven/2.0/import/execution/cucumber` |
| Robot Framework | `POST /api/v2/import/execution/robot` | `POST /rest/raven/2.0/import/execution/robot` |
| Xray JSON | `POST /api/v2/import/execution` | `POST /rest/raven/2.0/import/execution` |
| Multipart | `POST /api/v2/import/execution/junit/multipart` | `POST /rest/raven/2.0/import/execution/junit/multipart` |

#### Ejemplo: importar resultados JUnit

```bash
# Cloud
curl -X POST \
  "https://xray.cloud.getxray.app/api/v2/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300" \
  -H "Authorization: Bearer $XRAY_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @junit-results.xml

# Server/DC
curl -X POST \
  "https://jira.example.com/rest/raven/2.0/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300" \
  -u admin:password \
  -H "Content-Type: application/xml" \
  --data-binary @junit-results.xml
```

#### Respuesta

```json
{
  "id": "10200",
  "key": "PROJ-400",
  "self": "https://jira.example.com/rest/api/2/issue/10200"
}
```

### Rate Limits

| Plataforma | Límite |
|----------|-------|
| Cloud | 10 requests/segundo (varía según el plan) |
| Server/DC | Depende de la configuración de Jira |

---

## Referencia rápida de CLI (alineada con IQL)

### Autenticación

```bash
bun xray auth login --client-id "xxx" --client-secret "xxx"  # Cloud
bun xray auth login --token "xxx" --base-url "https://..."   # Server/DC
bun xray auth status                                          # Verificar la conexión
bun xray auth logout                                          # Limpiar credenciales
```

### Operaciones de Test

```bash
# Listar tests con filtros
bun xray test list                                    # Todos los tests
bun xray test list --status Automated                 # Filtrar por workflow status
bun xray test list --type Generic                     # Filtrar por test type
bun xray test list --label regression                 # Filtrar por label

# Obtener detalles del test
bun xray test get PROJ-101                            # Un solo test

# Crear un nuevo test (vía Jira API)
bun xray test create \
  --summary "Verify login with valid credentials" \
  --type Generic \
  --project PROJ \
  --labels "e2e,auth"
```

### Test Execution

```bash
# Listar executions
bun xray execution list                               # Todas las executions
bun xray execution list --test-plan PROJ-300          # Para un plan específico

# Crear execution
bun xray execution create \
  --summary "CI Run #142" \
  --test-plan PROJ-300 \
  --environment staging
```

### Importación de resultados

```bash
# Importar desde JUnit XML (default de Playwright)
bun xray import junit.xml --project PROJ --test-plan PROJ-300

# Importar creando la execution automáticamente
bun xray import junit.xml \
  --project PROJ \
  --test-plan PROJ-300 \
  --execution-summary "CI Run #142 - Staging" \
  --environment staging

# Importar con test info (multipart)
bun xray import junit.xml \
  --project PROJ \
  --test-plan PROJ-300 \
  --test-info '{"fields":{"labels":["automated"]}}'
```

### Test Plans

```bash
bun xray plan list                                    # Listar todos los plans
bun xray plan get PROJ-300                            # Obtener detalles del plan
bun xray plan add-tests PROJ-300 --tests PROJ-101,PROJ-102
```

---

## Flujo de datos: del código a Xray

```
╔═══════════════════════════════════════════════════════════════════════════════════════════╗
║                         DATA FLOW: PLAYWRIGHT → XRAY                                       ║
╚═══════════════════════════════════════════════════════════════════════════════════════════╝

    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                            PLAYWRIGHT TEST EXECUTION                                │
    │                                                                                     │
    │   test('PROJ-101 | login flow', async ({ fixture }) => {                            │
    │     await fixture.api.auth.loginWithValidCredentials({  ◄── Generic Test ID        │
    │       email: 'user@test.com',                                                       │
    │       password: 'Pass123!'                                                          │
    │     });                                                                             │
    │   });                                                                               │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Generates
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                            TEST RESULTS (JUnit XML)                                 │
    │                                                                                     │
    │   <testcase name="PROJ-101 | login flow" time="1.234">                              │
    │     <system-out>Passed</system-out>                                                 │
    │   </testcase>                                                                       │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ bun xray import OR CI/CD
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                              XRAY API PROCESSING                                    │
    │                                                                                     │
    │   POST /api/v2/import/execution/junit?projectKey=PROJ&testPlanKey=PROJ-300          │
    │                                                                                     │
    │   [PARSE]  Reading junit.xml...                                                     │
    │   [MATCH]  Matching "PROJ-101" to existing Test issue...                            │
    │   [CREATE] Creating Test Execution PROJ-400...                                      │
    │   [UPDATE] Creating Test Runs with statuses...                                      │
    │   [DONE]   Results imported successfully                                            │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ Jira Updated
                                              ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                               XRAY ENTITIES UPDATED                                 │
    │                                                                                     │
    │   Test Execution PROJ-400 created:                                                  │
    │   → Linked to Test Plan PROJ-300                                                    │
    │   → Environment: staging                                                            │
    │   → Contains Test Runs for matched tests                                            │
    │                                                                                     │
    │   Test Runs updated:                                                                │
    │   → PROJ-101: PASS (1.234s)                                                         │
    │   → PROJ-102: FAIL (2.1s) - "Timeout after 5000ms"                                  │
    │                                                                                     │
    │   Test Plan PROJ-300 status bar updated:                                            │
    │   → Progress: 43/45 tests passing (95.5%)                                           │
    │                                                                                     │
    └─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquitectura de Dual Reporting

El TMS trabaja junto al reporting del Automation Framework:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL REPORTING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │   AUTOMATION FRAMEWORK REPORTS  │  │      TMS REPORTS (XRAY)         │  │
│  │   (Allure / CI-Generated)       │  │      (Manual + Automated)       │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │                                 │  │                                 │  │
│  │  WHERE: Allure Server / S3     │  │  WHERE: Jira + Xray             │  │
│  │         (Dev team access)       │  │         (Full team access)      │  │
│  │                                 │  │                                 │  │
│  │  WHAT:                          │  │  WHAT:                          │  │
│  │  • Smoke executions             │  │  • Regression cycles only       │  │
│  │  • Sanity executions            │  │  • Manual + Automated tests     │  │
│  │  • Regression (automated only)  │  │  • Linked to requirements       │  │
│  │  • By environment               │  │  • Defect tracking              │  │
│  │  • Historical trends            │  │  • Coverage metrics             │  │
│  │                                 │  │  • Test lifecycle tracking      │  │
│  │  AUDIENCE:                      │  │                                 │  │
│  │  • Dev team (quick feedback)    │  │  AUDIENCE:                      │  │
│  │  • DevOps (pipeline health)     │  │  • QA team (full picture)       │  │
│  │  • QA (automation health)       │  │  • PMs/Stakeholders (status)    │  │
│  │                                 │  │  • Management (go/no-go)        │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Variables de entorno

| Variable | Descripción | Requerida |
|----------|-------------|----------|
| `XRAY_CLIENT_ID` | Client ID de la API (Cloud) | Sí (Cloud) |
| `XRAY_CLIENT_SECRET` | Client secret de la API (Cloud) | Sí (Cloud) |
| `XRAY_TOKEN` | Personal Access Token (Server/DC) | Sí (Server) |
| `ATLASSIAN_URL` | URL del sitio de Atlassian | Sí |
| `ATLASSIAN_EMAIL` | Email de la cuenta de Atlassian | Sí |
| `ATLASSIAN_API_TOKEN` | API token de Atlassian | Sí |
| `JIRA_PROJECT_KEY` | Project key por defecto | Opcional |
| `XRAY_TEST_PLAN_KEY` | Test plan por defecto | Opcional |
| `XRAY_ENVIRONMENT` | Test environment por defecto | Opcional |

---

## Integración CI/CD

### Ejemplo de GitHub Actions

```yaml
name: Test and Report to Xray

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps

      - name: Run tests
        run: bun run test
        env:
          CI: true

      - name: Get Xray Token
        if: always()
        id: xray-auth
        run: |
          TOKEN=$(curl -s -X POST \
            https://xray.cloud.getxray.app/api/v2/authenticate \
            -H "Content-Type: application/json" \
            -d '{"client_id":"${{ secrets.XRAY_CLIENT_ID }}","client_secret":"${{ secrets.XRAY_CLIENT_SECRET }}"}' | tr -d '"')
          echo "token=$TOKEN" >> $GITHUB_OUTPUT

      - name: Import results to Xray
        if: always()
        run: |
          curl -X POST \
            "https://xray.cloud.getxray.app/api/v2/import/execution/junit?projectKey=${{ vars.JIRA_PROJECT_KEY }}&testPlanKey=${{ vars.XRAY_TEST_PLAN_KEY }}" \
            -H "Authorization: Bearer ${{ steps.xray-auth.outputs.token }}" \
            -H "Content-Type: application/xml" \
            --data-binary @test-results/junit.xml
```

### Reporter de Playwright (playwright-xray)

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['playwright-xray', {
      cloud: true,
      client_id: process.env.XRAY_CLIENT_ID,
      client_secret: process.env.XRAY_CLIENT_SECRET,
      projectKey: 'PROJ',
      testPlan: 'PROJ-300',
    }],
  ],
});
```

---

## Resolución de problemas

### Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| 401 Unauthorized | Token inválido o expirado | Regenerar las credenciales de la API |
| 404 Not Found | Project/issue key incorrecto | Verificar que las keys existan en Jira |
| 400 No valid tests | Los test IDs no coinciden | Asegurar que los nombres de tests incluyan las Jira keys |
| 403 Forbidden | Permisos insuficientes | Revisar los permisos del proyecto en Xray |

### Estrategias de matching de tests

Para que Xray haga match de los resultados de tests con los issues Test:

1. **Por Jira Key en el nombre del test**: `PROJ-101 | test description`
2. **Por Generic Test Definition**: hace match del campo `testKey`
3. **Por Test Summary**: match exacto (menos confiable)

---

## Archivos relacionados

- `cli/xray.ts` — herramienta CLI para operaciones de Xray
- `tests/utils/jiraSync.ts` — utilidad de Sync para resultados de tests
- `config/variables.ts` — configuración de entorno
- `.env` — variables de entorno (XRAY_CLIENT_ID, etc.)

---

## Recursos externos

- [Documentación de Xray (Cloud)](https://docs.getxray.app/display/XRAYCLOUD)
- [Documentación de Xray (Server/DC)](https://docs.getxray.app/display/XRAY)
- [Xray REST API](https://docs.getxray.app/display/XRAYCLOUD/REST+API)
- [Xray Academy](https://academy.getxray.app/)
- [Atlassian Jira REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Playwright Xray Reporter](https://github.com/inluxc/playwright-xray)
- [Metodología IQL](https://upexgalaxy.com/metodologia)
