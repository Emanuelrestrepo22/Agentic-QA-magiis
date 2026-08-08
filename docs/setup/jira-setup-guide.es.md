# Guía de configuración de Jira + Xray como TMS

> _Traducción al español de [jira-setup-guide.md](jira-setup-guide.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Propósito**: Guía paso a paso para configurar Jira con Xray como Test Management System (TMS) alineado con la metodología IQL.
> **Prerrequisito**: Leé primero `jira-platform.md` (referencia canónica de IQL para el uso de Jira/Xray).
> **Tiempo estimado**: 2-4 horas para la configuración completa.

---

## Tabla de contenidos

1. [Checklist previo a la configuración](#1-checklist-previo-a-la-configuración)
2. [Instalar Xray](#2-instalar-xray)
3. [Configurar el proyecto](#3-configurar-el-proyecto)
4. [Configurar los tipos de issue](#4-configurar-los-tipos-de-issue)
5. [Configurar los custom fields](#5-configurar-los-custom-fields)
6. [Crear los workflows](#6-crear-los-workflows)
7. [Configurar el Test Repository](#7-configurar-el-test-repository)
8. [Configurar el acceso a la API](#8-configurar-el-acceso-a-la-api)
9. [Crear un Test Plan](#9-crear-un-test-plan)
10. [Validación final](#10-validación-final)

---

## 1. Checklist previo a la configuración
Antes de empezar, asegurate de tener:

- [ ] Una instancia de Jira Cloud o Jira Data Center
- [ ] Permisos de administrador de Jira
- [ ] Licencia de Xray (trial o de pago)
- [ ] Definida tu lista de módulos/features
- [ ] Entendida la distinción entre Test Type y Test Run Status (ver `jira-platform.md`)

### Conceptos clave a recordar

| Concepto | Propósito | Valores de ejemplo |
|---------|---------|----------------|
| **Test Type** | Clasificación del test | Manual, Cucumber, Generic |
| **Test Status** | Estado del workflow de Jira | Draft, Ready, Automated |
| **Test Run Status** | Resultado de la ejecución | TODO, PASS, FAIL, BLOCKED |
| **Requirement** | Tipo de issue que se puede cubrir | Story, Epic, Bug |

---

## 2. Instalar Xray
### Paso 2.1: Instalar desde el Marketplace

**Para Jira Cloud:**
1. Andá a **Settings** (ícono de engranaje) > **Apps** > **Find new apps**
2. Buscá "Xray Test Management"
3. Hacé clic en **Get app** > **Get it now**
4. Esperá a que se complete la instalación
5. Hacé clic en **Get started** para comenzar la configuración

**Para Jira Data Center:**
1. Andá a **Settings** > **Manage apps** > **Find new apps**
2. Buscá "Xray Test Management for Jira"
3. Hacé clic en **Install** y aceptá el acuerdo de licencia
4. Esperá a que se complete la instalación

### Paso 2.2: Activar la licencia

1. Andá a **Settings** > **Manage apps** > **Xray**
2. Ingresá tu clave de licencia o iniciá un trial
3. Hacé clic en **Update**

### Paso 2.3: Verificar la instalación

Después de la instalación, deberías ver:
- Nuevos issue types: Test, Pre-Condition, Test Set, Test Execution, Test Plan
- La sección de Xray en **Settings** > **Apps**
- Los paneles de Xray en las vistas de issues

---

## 3. Configurar el proyecto
### Paso 3.1: Agregar los Xray Issue Types al proyecto

1. Andá a **Project Settings** > **Issue types**
2. Hacé clic en **Actions** > **Add Xray Issue Types**
3. Seleccioná todos los Xray issue types:
   - [ ] Test
   - [ ] Pre-Condition
   - [ ] Test Set
   - [ ] Test Execution
   - [ ] Test Plan
4. Hacé clic en **Add**

### Paso 3.2: Configurar la cobertura de requerimientos (Requirement Coverage)

1. Andá a **Project Settings** > **Apps** > **Xray Settings**
2. Hacé clic en **Test Coverage**
3. Seleccioná qué issue types pueden ser "cubiertos" por tests:
   - [ ] Story
   - [ ] Epic
   - [ ] Bug (opcional)
   - [ ] Task (opcional)
4. Hacé clic en **Save**

### Paso 3.3: Configurar el Issue Type Mapping (global)

1. Andá a **Settings** > **Apps** > **Xray** > **Issue Type Mapping**
2. Configurá:
   - **Requirement Issue Types**: Story, Epic
   - **Defect Issue Types**: Bug
3. Hacé clic en **Save**

---

## 4. Configurar los tipos de issue
### Paso 4.1: Configurar el issue type Test

1. Andá a **Settings** > **Issues** > **Issue types**
2. Buscá el issue type **Test**
3. Configurá las screens y fields (ver Paso 5)

### Paso 4.2: Configuración de los Test Types

Xray soporta tres test types de fábrica:

| Test Type | Descripción | Cuándo usarlo |
|-----------|-------------|-------------|
| **Manual** | Test case paso a paso | Tests ejecutados por humanos |
| **Cucumber** | Sintaxis BDD/Gherkin | Especificación por ejemplo |
| **Generic** | Sin estructura, referencia por ID | Tests automatizados (Playwright, Jest) |

**Para configurar los test types:**
1. Andá a **Settings** > **Apps** > **Xray** > **Test Types**
2. Revisá los tipos por defecto (Manual, Cucumber, Generic)
3. Opcionalmente agregá tipos personalizados si hace falta

### Paso 4.3: Crear los Test Statuses (estados del workflow)

Creá estos estados de workflow para los issues Test:

| Status | Categoría | Descripción | Etapa IQL |
|--------|----------|-------------|-----------|
| Draft | To Do | Estado inicial, en redacción | TMLC |
| Ready | To Do | Listo para revisión | TMLC |
| Approved | In Progress | Revisado y aprobado | TMLC |
| Manual | Done | Permanecerá manual | TMLC |
| Automating | In Progress | En proceso de automatización | TALC |
| Automated | Done | Totalmente automatizado | TALC |
| Deprecated | Done | Ya no es válido | Cualquiera |

---

## 5. Configurar los custom fields
### Paso 5.1: Revisar los custom fields de Xray

Xray crea automáticamente estos custom fields:

| Field | Tipo | Issue Types | Propósito |
|-------|------|-------------|---------|
| Test Type | Select | Test | Manual/Cucumber/Generic |
| Manual Test Steps | Steps Editor | Test | Definición de los pasos del test |
| Cucumber Test Type | Select | Test | Feature/Scenario |
| Generic Test Definition | Text | Test | Referencia de automatización |
| Test Environments | Multi-select | Test Execution | Ambientes objetivo |
| Revision | Text | Test Execution | Información de build/versión |
| Begin Date | DateTime | Test Execution | Hora de inicio |
| End Date | DateTime | Test Execution | Hora de fin |
| Test Execution Status | Progress | Test Execution | Progreso general |
| Test Plan Status | Progress | Test Plan | Progreso general |
| Requirement Status | Status | Story/Epic | Estado de cobertura |

### Paso 5.2: Agregar los custom fields a las screens

1. Andá a **Settings** > **Issues** > **Screens**
2. Buscá **Default Test Screen** o creá una nueva
3. Agregá estos campos:
   - [ ] Test Type
   - [ ] Manual Test Steps
   - [ ] Generic Test Definition
   - [ ] Labels
   - [ ] Components
   - [ ] Priority
   - [ ] Fix Version

### Paso 5.3: Crear campos específicos del proyecto (opcional)

Podés agregar custom fields para tu proyecto:

**Campo Module/Feature:**
1. Andá a **Settings** > **Issues** > **Custom fields**
2. Hacé clic en **Create custom field**
3. Seleccioná **Select List (single choice)**
4. Nombre: `Module`
5. Agregá opciones: Auth, Bookings, Invoices, Reconciliation, etc.
6. Asociá con el issue type Test

---

## 6. Crear los workflows
### Paso 6.1: Crear el Test Workflow

1. Andá a **Settings** > **Issues** > **Workflows**
2. Hacé clic en **Add workflow**
3. Nombre: `Test Lifecycle Workflow`
4. Agregá estados y transiciones:

```
TEST WORKFLOW:

┌─────────┐        ┌─────────┐        ┌──────────┐
│  Draft  │───────▶│  Ready  │───────▶│ Approved │
└─────────┘ Submit └─────────┘ Approve └────┬─────┘
                                            │
              ┌─────────────────────────────┼─────────────────────┐
              │                             │                     │
              ▼                             ▼                     ▼
        ┌──────────┐               ┌─────────────┐        ┌────────────┐
        │  Manual  │               │ Automating  │        │ Deprecated │
        └──────────┘               └──────┬──────┘        └────────────┘
                                          │
                                          ▼
                                   ┌───────────┐
                                   │ Automated │
                                   └───────────┘
```

### Paso 6.2: Definir las transiciones

| Desde | Hacia | Nombre de la transición | Condiciones |
|------|-----|-----------------|------------|
| Draft | Ready | Submit | Summary no vacío |
| Ready | Approved | Approve | - |
| Ready | Draft | Reject | - |
| Approved | Manual | Mark as Manual | - |
| Approved | Automating | Start Automation | - |
| Approved | Deprecated | Deprecate | - |
| Automating | Automated | Complete Automation | - |
| Automating | Approved | Cancel Automation | - |
| Manual | Automated | Automate | - |
| Any | Deprecated | Deprecate | - |

### Paso 6.3: Asignar el workflow al proyecto

1. Andá a **Settings** > **Issues** > **Workflow schemes**
2. Creá un nuevo scheme o editá uno existente
3. Asociá `Test Lifecycle Workflow` con el issue type **Test**
4. Asigná el scheme a tu proyecto

---

## 7. Configurar el Test Repository
El Test Repository es la estructura de carpetas de Xray para organizar los tests.

### Paso 7.1: Acceder al Test Repository

1. Andá a tu proyecto
2. Hacé clic en **Tests** en la barra lateral izquierda
3. Hacé clic en la pestaña **Test Repository**

### Paso 7.2: Crear la estructura de carpetas

Creá una estructura de carpetas que coincida con los módulos de tu aplicación:

```
Test Repository
├── Auth
│   ├── Login
│   ├── Logout
│   └── Password Reset
├── Bookings
│   ├── Create Booking
│   ├── Edit Booking
│   └── Cancel Booking
├── Invoices
│   ├── Generate Invoice
│   └── Export Invoice
├── Reconciliation
│   └── Monthly Close
└── Smoke Tests
    └── Critical Paths
```

**Para crear carpetas:**
1. Hacé clic derecho en la raíz del repositorio
2. Seleccioná **Create folder**
3. Ingresá el nombre de la carpeta
4. Repetí para las subcarpetas

### Paso 7.3: Organizar los tests existentes

1. Seleccioná tests de la lista
2. Arrastrá y soltá en las carpetas correspondientes
3. O usá acciones masivas (bulk actions) para mover varios tests

---

## 8. Configurar el acceso a la API
### Paso 8.1: Crear credenciales de API (Cloud)

1. Andá a **Settings** > **Apps** > **Xray** > **API Keys**
2. Hacé clic en **Create API Key**
3. Ingresá un nombre descriptivo: `QA Automation - CI/CD`
4. Hacé clic en **Generate**
5. **Guardá ambos valores de forma segura:**
   ```
   Client ID: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   Client Secret: YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
   ```

### Paso 8.2: Crear un Personal Access Token (Server/DC)

1. Hacé clic en el avatar de tu perfil > **Profile**
2. Andá a **Personal Access Tokens**
3. Hacé clic en **Create token**
4. Ingresá el nombre: `QA Automation`
5. Establecé la expiración (o sin expiración para CI)
6. Copiá y guardá el token

### Paso 8.3: Probar la conexión con la API

**Cloud:**
```bash
# Obtener el token de autenticación
curl -X POST \
  https://xray.cloud.getxray.app/api/v2/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'

# Debería devolver un token JWT
```

**Server/DC:**
```bash
# Probar con el PAT
curl -H "Authorization: Bearer YOUR_PAT" \
  https://your-jira.com/rest/raven/2.0/api/test

# Debería devolver datos de tests
```

### Paso 8.4: Configurar las variables de entorno

Creá o actualizá tu archivo `.env`:

```bash
# Atlassian credentials (fuente única de verdad — también usada por MCP, acli,
# xray-cli, scripts/sync-jira-*.ts, cli/doctor.ts)
ATLASSIAN_URL=https://your-company.atlassian.net
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=...

# Parámetros operativos específicos de Jira
JIRA_PROJECT_KEY=PROJ

# Autenticación de Xray Cloud
XRAY_CLIENT_ID=your_client_id
XRAY_CLIENT_SECRET=your_client_secret

# Alternativa para Xray Server/DC
# XRAY_TOKEN=your_personal_access_token

# Valores por defecto opcionales de Xray
XRAY_TEST_PLAN_KEY=PROJ-300
XRAY_ENVIRONMENT=staging
```

---

## 9. Crear un Test Plan
### Paso 9.1: Crear tu primer Test Plan

1. Hacé clic en **Create** (botón +)
2. Seleccioná el issue type **Test Plan**
3. Completá los detalles:
   - **Summary**: `Regression v2.0`
   - **Fix Version**: Seleccioná la versión objetivo
   - **Description**: Agregá los objetivos del plan
4. Hacé clic en **Create**

### Paso 9.2: Agregar tests al plan

1. Abrí el Test Plan
2. Andá a la sección **Tests**
3. Hacé clic en **Add Tests**
4. Elegí el método:
   - **Search**: Buscar tests individuales
   - **Test Set**: Agregar todos los tests de un set
   - **Folder**: Agregar todos los tests de una carpeta del repositorio
5. Seleccioná los tests y hacé clic en **Add**

### Paso 9.3: Crear un Test Execution

1. Abrí el Test Plan
2. Hacé clic en **Create Test Execution**
3. Completá los detalles:
   - **Summary**: `Regression Staging Sprint 5`
   - **Test Environments**: Seleccioná `staging`
   - **Revision**: Ingresá la versión del build
4. Los tests se agregan automáticamente desde el plan
5. Hacé clic en **Create**

### Paso 9.4: Configurar los Test Environments

1. Andá a **Settings** > **Apps** > **Xray** > **Test Environments**
2. Agregá los ambientes:
   - `local`
   - `dev`
   - `staging`
   - `production`
3. Hacé clic en **Save**

---

## 10. Validación final
### Paso 10.1: Validar la configuración de los issue types

Ejecutá estas verificaciones:

- [ ] El issue type Test tiene todos los campos requeridos
- [ ] Los Test Types están configurados (Manual, Cucumber, Generic)
- [ ] El workflow está asignado al issue type Test
- [ ] El Test Repository es accesible
- [ ] La cobertura de requerimientos está habilitada para Story/Epic

### Paso 10.2: Validar la conexión con la API

```bash
# Configurar la autenticación
export XRAY_CLIENT_ID="your_client_id"
export XRAY_CLIENT_SECRET="your_client_secret"

# Probar la conexión del CLI
bun xray auth status

# Listar tests (debería devolver datos)
bun xray test list

# Crear un test case
bun xray test create \
  --summary "Verify login flow" \
  --type Generic \
  --project PROJ

# Importar resultados de ejemplo
bun xray import sample-results.xml \
  --project PROJ \
  --test-plan PROJ-300
```

### Paso 10.3: Probar el workflow completo

1. **Crear el Test**: Creá un test Generic con patrón de ID
2. **Agregar al Plan**: Agregá el test a un Test Plan
3. **Ejecutar Playwright**: Ejecutá con el reporter JUnit
4. **Importar resultados**: Usá la API o el CLI para importar
5. **Verificar en Xray**: Verificá que el Test Execution muestre los resultados

### Paso 10.4: Documentar tu configuración

Después de la configuración, guardá tus valores específicos:

```yaml
# Referencia de configuración de Xray
jira:
  base_url: https://your-company.atlassian.net
  project_key: PROJ

xray:
  api_type: cloud  # o server
  client_id: (stored in .env)
  client_secret: (stored in .env)

issue_types:
  test: 10001
  pre_condition: 10002
  test_set: 10003
  test_execution: 10004
  test_plan: 10005

environments:
  - local
  - dev
  - staging
  - production

test_plan_naming: "Regression [Environment] [Sprint/Version]"
test_execution_naming: "CI Run #[number] - [Environment]"
```

---

## Solución de problemas

### Problemas comunes

| Problema | Solución |
|-------|----------|
| Los paneles de Xray no aparecen | Verificá que el issue type scheme incluya los tipos de Xray |
| No se pueden agregar tests al plan | Verificá que los tests existan y que el usuario tenga permisos |
| La API devuelve 401 | Regenerá las credenciales de API |
| La API devuelve 404 | Verificá que la project key y las issue keys existan |
| Los tests no coinciden al importar | Asegurate de que los nombres de los tests incluyan las Jira keys (ej. `PROJ-101 \| test name`) |
| La cobertura no aparece | Habilitá la cobertura de requerimientos en la configuración del proyecto |

### Consultas JQL útiles

```jql
# Encontrar todos los tests automatizados
project = PROJ AND issuetype = Test AND status = Automated

# Encontrar tests sin cobertura
project = PROJ AND issuetype = Test AND "Requirement Status" is EMPTY

# Encontrar ejecuciones de test fallidas
project = PROJ AND issuetype = "Test Execution" AND "Test Execution Status" = FAIL

# Encontrar tests en una carpeta específica
project = PROJ AND issuetype = Test AND "Test Repository Path" ~ "Auth/Login"

# Encontrar tests por label
project = PROJ AND issuetype = Test AND labels in (regression, smoke)
```

---

## Próximos pasos

Después de completar esta configuración:

1. **Crear tests**: Empezá a crear test cases para tu aplicación
2. **Organizar el repositorio**: Estructurá los tests por módulo/feature
3. **Vincular con requerimientos**: Asociá los tests con Stories/Epics
4. **Configurar CI/CD**: Configurá la importación automática de resultados
5. **Capacitar al equipo**: Compartí esta guía con los miembros del equipo

---

## Fuentes y referencias

- [Documentación de Xray Cloud](https://docs.getxray.app/display/XRAYCLOUD)
- [Documentación de Xray Server/DC](https://docs.getxray.app/display/XRAY)
- [Xray Academy - Curso Essentials](https://academy.getxray.app/)
- [Referencia de la REST API de Xray](https://docs.getxray.app/display/XRAYCLOUD/REST+API)
- [Administración de Atlassian Jira](https://support.atlassian.com/jira-cloud-administration/)
- [Integración de Playwright con Xray](https://github.com/inluxc/playwright-xray)

---

**Documento creado**: 2026-02-09
**Versión de IQL**: 2.0
**Compatible con**: jira-platform.md v1.0, cli/xray.ts v1.0.0
