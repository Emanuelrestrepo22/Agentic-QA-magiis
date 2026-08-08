# Guía del Test Management System
## Alineada con la metodología Integrated Quality Lifecycle (IQL)

> _Traducción al español de [test-management-system.md](test-management-system.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

---

## Resumen ejecutivo

Este documento define la **arquitectura, los procesos y las buenas prácticas** para implementar un Test Management System (TMS) siguiendo la metodología **Integrated Quality Lifecycle (IQL)** (ciclo de vida de calidad integrado).

IQL reemplaza al STLC tradicional integrando la calidad a lo largo de todo el ciclo de vida del desarrollo de software, desde los requisitos iniciales hasta el monitoreo en producción.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTEGRATED QUALITY LIFECYCLE (IQL)                        │
│                    "Quality is not a phase, it's a mindset"                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│      │  EARLY-GAME  │────▶│   MID-GAME   │────▶│  LATE-GAME   │            │
│      │  Prevention  │     │  Detection   │     │ Observation  │            │
│      │  Steps 1-4   │     │  Steps 5-10  │     │  Steps 11-16 │            │
│      └──────────────┘     └──────────────┘     └──────────────┘            │
│             │                    │                    │                     │
│             ▼                    ▼                    ▼                     │
│      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│      │  QA Analyst  │     │QA Automation │     │  QA + DevOps │            │
│      │    Leads     │     │   Engineer   │     │     /SRE     │            │
│      └──────────────┘     └──────────────┘     └──────────────┘            │
│                                                                              │
│                         ◀────── FEEDBACK LOOP ──────▶                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Parte 1: IQL vs STLC tradicional

### Por qué IQL reemplaza al STLC

| Aspecto              | STLC tradicional                | IQL moderno                        |
| -------------------- | ------------------------------- | ---------------------------------- |
| Enfoque              | Testing como una fase separada  | Calidad integrada de punta a punta |
| Cuándo               | Solo al final del desarrollo    | Desde los requisitos a producción  |
| Feedback             | Tardío y costoso                | Continuo y temprano                |
| Equipos              | Silos entre Dev y QA            | Colaboración DevOps nativa         |
| Producción           | Ignorada                        | Monitoreada y validada             |
| Detección de defectos| Fin de ciclo                    | 70% más rápida                     |
| Cobertura de automatización | 20-30%                   | 60-80%                             |

### Los 8 enfoques integrados

IQL integra 8 enfoques complementarios que se aplican estratégicamente en distintas fases:

| Enfoque                 | Descripción                                                    | Fase             |
| ----------------------- | -------------------------------------------------------------- | ---------------- |
| **Shift-Left Testing**  | Adelantar las actividades de calidad en el SDLC                | Early-Game       |
| **Shift-Right Testing** | Extender la validación de calidad a producción                 | Late-Game        |
| **Risk-Based Testing**  | Priorizar pruebas según impacto y probabilidad                 | Early + Mid Game |
| **Continuous Testing**  | Testing automatizado en pipelines CI/CD                        | Mid-Game         |
| **Agile Testing**       | Testing rápido y eficiente dentro de los sprints               | Mid-Game         |
| **Exploratory Testing** | Aprovechar la inteligencia humana para hallazgos inesperados   | Mid-Game         |
| **BDD**                 | Especificación colaborativa con Given-When-Then                | Early-Game       |
| **AI-Driven Testing**   | Usar IA para mejorar eficiencia y cobertura                    | Todas las fases  |

---

## Parte 2: Los 16 pasos de IQL

### Timeline completo

```
══════════════════════════════════════════════════════════════════════════════
  EARLY-GAME (Steps 1-4)              "Let's build it right from the beginning"
  PREVENTION - QA Analyst Leads       TMLC Stages 1-3
══════════════════════════════════════════════════════════════════════════════

  Step 1: Requirements Analysis & Planning     [TMLC 1st Stage]
          • AC Review with PO/BA
          • Create Feature Test Plan (FTP)
          • Define test outlines/hypotheses

  Step 2: Development & Implementation         [Parallel Work]
          • Dev codes the feature
          • QA prepares test data and environment

  Step 3: Early Exploratory Testing            [TMLC 2nd Stage]
          • Execute directed exploratory tests
          • Validate US using FTP as guide
          • Provide fast feedback

  Step 4: Defect Reporting                     [TMLC 3rd Stage]
          • Log bugs with clear reproduction steps
          • Include evidence (screenshots, logs)
          • Sign-off US once critical bugs resolved

══════════════════════════════════════════════════════════════════════════════
  MID-GAME (Steps 5-10)               "Does the software meet the requirements?"
  DETECTION - QA Automation Leads     TMLC Stage 4 + TALC Stages 1-4
══════════════════════════════════════════════════════════════════════════════

  Step 5: Async Test Case Documentation        [TMLC 4th Stage]
          • Create formal Test tickets
          • Document steps, data, expected results
          • Link to Test Repository

  Step 6: Automation Candidate Evaluation      [TALC 1st Stage]
          • Review TCs for automation viability
          • Mark as Candidate or Manual
          • Update Automation Backlog

  Step 7: Test Automation Implementation       [TALC 2nd Stage]
          • Create branch, implement scripts
          • Follow framework patterns (TAUS model)
          • Push changes

  Step 8: CI Verification                      [TALC 3rd Stage]
          • Execute in CI pipeline
          • Confirm stable (no flakiness)
          • Fix script failures quickly

  Step 9: Pull Request Review                  [TALC 4th Stage]
          • Create detailed PR
          • Code review by another QA/Dev
          • Merge once approved

  Step 10: Continuous Maintenance              [TMLC + TALC Combined]
           • Run regression (manual + automated)
           • Smoke/sanity in staging
           • Remove obsolete tests

══════════════════════════════════════════════════════════════════════════════
  LATE-GAME (Steps 11-16)             "How does it behave in the real world?"
  OBSERVATION - QA + DevOps/SRE       Shift-Right Testing
══════════════════════════════════════════════════════════════════════════════

  Step 11: Production Deployment & Smoke       [Shift-Right]
           • Smoke/sanity tests in production
           • Validate critical functionalities
           • Monitor system health

  Step 12: Canary Release Monitoring           [Gradual Rollout]
           • Deploy to small % of users
           • Monitor key metrics
           • Decide rollback or expand

  Step 13: A/B Testing & Experimentation       [Optimization]
           • Test feature variations
           • Collect user behavior data
           • Make data-driven decisions

  Step 14: Real User Monitoring (RUM)          [Observability]
           • Monitor Core Web Vitals
           • Track performance by region/device
           • Alert on degradation

  Step 15: Chaos Engineering                   [Resilience]
           • Introduce controlled failures
           • Validate system recovery
           • Document weaknesses

  Step 16: Feedback Loop                       [Continuous Learning]
           • Collect production feedback
           • Analyze error patterns
           • Feed insights to next Early-Game

══════════════════════════════════════════════════════════════════════════════
                              ↻ CYCLE CONTINUES
══════════════════════════════════════════════════════════════════════════════
```

---

## Parte 3: Early-Game Testing (pasos 1-4)

### Filosofía: prevención

> "Let's build it right from the beginning"

**Rol principal:** QA Analyst
**Foco:** prevención mediante colaboración y análisis tempranos
**Enfoques:** Shift-Left, BDD, Risk-Based Testing

### Paso 1: análisis de requisitos y planificación

**TMLC Stage 1** - Entender los requisitos y finalizar los criterios de aceptación

**Input:** User Story con criterios de aceptación en borrador

**Actividades:**
- Discutir ambigüedades con PO/BA
- Crear el Feature Test Plan (FTP)
- Definir esquemas/hipótesis de prueba

**Output:** ACs claros y validados + Feature Test Plan

**Workflow de subtareas:**
```
'QA: AC Review'         →  Open → In Progress → Done
'QA: Feature Test Plan' →  Open → In Progress → Done
```

**⚠️ IMPORTANTE: FTP = hipótesis, NO documentación formal**

Los escenarios del Feature Test Plan son SUPOSICIONES basadas en los criterios de aceptación. Durante el desarrollo, la feature puede cambiar debido a:
- Feedback de QA durante el exploratory testing
- Bugs que alteran el comportamiento esperado
- Cambios en los criterios de aceptación
- Ajustes de UX/UI durante la implementación

El FTP GUÍA la exploración pero NO se convierte automáticamente en Test Cases formales. Los TCs formales se diseñan en Mid-Game después de confirmar el comportamiento real.

### Paso 2: desarrollo e implementación

**Parallel Work** - No es una tarea directa de QA

Mientras Dev implementa la feature:
- Dev: crea la branch, implementa el código, unit tests, despliega a staging
- QA: prepara los test data, configura el ambiente, revisa el FTP

**Resultado:** feature lista para testear

### Paso 3: Early Exploratory Testing

**TMLC Stage 2** - Validación rápida usando el Feature Test Plan

**Propósito:** validar la User Story rápidamente antes del despliegue a producción

**Actividades:**
- Ejecutar pruebas exploratorias dirigidas en áreas críticas/de alto riesgo
- Usar charters o hipótesis del FTP para guiar la exploración
- Reportar hallazgos y defectos de inmediato
- Dar feedback rápido al desarrollo

**Workflow de subtarea:**
```
'QA: Feature Testing' →  Open → In Progress → Done
```

**Resultado:** la User Story puede desplegarse a producción una vez que QA la aprueba

### Paso 4: reporte de defectos

**TMLC Stage 3** - Documentar hallazgos con información clara y reproducible

**Plantilla de reporte de defectos:**
```
ID: BUG-XXX                        Severity: Critical/High/Medium/Low
Title: [Clear, descriptive title]  Priority: P1/P2/P3/P4

ENVIRONMENT:
• Browser/Device: ___________
• OS: ___________
• Build/Version: ___________
• Environment: ___________

STEPS TO REPRODUCE:
1. ___________
2. ___________
3. ___________

EXPECTED RESULT: ___________
ACTUAL RESULT: ___________

ATTACHMENTS: □ Screenshot  □ Video  □ Logs  □ HAR file

LINKED USER STORY: US-XXX
```

**Después de resolver los bugs críticos:**
- QA da el SIGN-OFF
- La User Story queda aprobada para el despliegue a producción
- El comportamiento está confirmado y estable

**→ TRANSICIÓN A MID-GAME:** ahora que el comportamiento está confirmado, es momento de documentar los Test Cases formales para regression y automation.

### Conceptos clave de Early-Game

| Concepto                | Descripción                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **Shift-Left Testing**  | Involucrar a QA desde el inicio para descubrir defectos antes y reducir el retrabajo     |
| **Exploratory Testing** | El Feature Testing en modo 'exploratory' brinda validación rápida antes de cerrar la US  |
| **Async Documentation** | Diseñar test cases DESPUÉS de aprobar la US mantiene el proceso ágil. Planificar ≠ Documentar |

---

## Parte 4: Mid-Game Testing (pasos 5-10)

### Filosofía: detección

> "Does the software meet the requirements?"

**Rol principal:** QA Automation Engineer
**Foco:** detección mediante testing estructurado
**Enfoques:** Continuous Testing, Agile Testing, AI-Driven Testing

### Los dos ciclos de vida: TMLC y TALC

**TMLC (Test Manual Life Cycle):**
- Stage 1: AC Review + FTP (Early-Game, paso 1)
- Stage 2: Exploratory Testing (Early-Game, paso 3)
- Stage 3: Defect Reporting (Early-Game, paso 4)
- Stage 4: TC Documentation (Mid-Game, paso 5)

**TALC (Test Automation Life Cycle):**
- Stage 1: Evaluate Candidates (Mid-Game, paso 6)
- Stage 2: Automate Implementation (Mid-Game, paso 7)
- Stage 3: CI Verification (Mid-Game, paso 8)
- Stage 4: PR Review + Merge (Mid-Game, paso 9)

### Paso 5: documentación asíncrona de Test Cases

**TMLC Stage 4** - Crear tickets de Test formales sin bloquear la entrega

**Trigger:** la User Story recibió el sign-off en Early-Game

**Estructura de Test Case:**
```
ID: TC-XXX                         Status: Draft
Title: [Descriptive test title]    Priority: High/Medium/Low
Type: Functional / E2E / API       Automation: Candidate/Manual

LINKED ITEMS:
• User Story: US-XXX
• Test Suite: TS-XXX
• Epic/Feature: EPIC-XXX

PRECONDITIONS:
• ___________

TEST STEPS (Gherkin Format Recommended):
Given [initial context]
When [action is performed]
Then [expected outcome]

TEST DATA:
• ___________
```

**Workflow de estados:**
```
Draft → In Review → Active → [Manual | Candidate | Automated]
```

### Paso 6: evaluación de candidatos a automatización

**TALC Stage 1** - Determinar qué test cases deberían automatizarse

**Matriz de decisión de automatización:**

| AUTOMATIZAR   | QUIZÁS            | NO AUTOMATIZAR       |
| ------------- | ----------------- | -------------------- |
| Repetitivo    | Frecuencia media  | De una sola vez      |
| Alto riesgo   | Setup complejo    | Exploratorio         |
| Regression    | ROI poco claro    | UX/Visual            |
| Smoke/Sanity  |                   | Cambia con frecuencia|
| Data-driven   |                   | Bajo ROI             |
| API tests     |                   |                      |

**Transición de estado:**
```
In Review → Candidate (if viable)
         → Manual (if not viable)
```

### Paso 7: implementación de test automation

**TALC Stage 2** - Convertir los candidatos en scripts automatizados

**Pirámide de test automation:**
```
           /\
          /  \           E2E / UI Tests (10%)
         / E2E\          • Full user journeys
        /  10% \         • BDD scenarios
       /────────\        • Slowest, most comprehensive
      /          \
     / Integration\      Integration / API Tests (20%)
    /     20%      \     • Service interactions
   /────────────────\    • Component integration
  /                  \
 /    Unit Tests      \  Unit Tests (70%)
/        70%           \ • Individual functions
────────────────────────\• Fastest feedback
```

**Workflow de implementación:**
1. Crear la feature branch
2. Escribir el test script siguiendo los patrones del framework
3. Ejecutar localmente para verificar
4. Push al remoto

**Transición de estado:**
```
Candidate → In Automation
```

### Paso 8: verificación en CI

**TALC Stage 3** - Validar los tests automatizados en el CI pipeline

**Flujo del pipeline CI/CD:**
```
CODE PUSH → BUILD → TEST → REPORT
                      │
           ┌──────────┼──────────┐
           │          │          │
        PASSED     FAILED      FLAKY
           │          │          │
           │          └────┬─────┘
           │               │
           │        INVESTIGATE & FIX
           │               │
           └───────────────┴──────→ STABLE
```

**Actividades clave:**
- Ejecutar la suite de tests automatizados en CI (nightly builds o por commit)
- Confirmar que los tests pasan de forma estable (sin flakiness)
- Corregir rápidamente cualquier falla de script

### Paso 9: revisión del Pull Request

**TALC Stage 4** - Code review y merge

**Checklist de revisión del PR:**
- [ ] Los tests siguen los patrones y convenciones del framework
- [ ] Assertions y manejo de errores adecuados
- [ ] Sin valores hardcodeados (usar config/variables de entorno)
- [ ] Los tests son independientes y aislados
- [ ] Naming y documentación claros
- [ ] El CI pipeline pasa
- [ ] La cobertura de código se mantiene o mejora

**Transición de estado:**
```
In Automation → Merge Request → Automated
```

**Resultado:** los tests ahora forman parte de la suite principal de regression

### Paso 10: mantenimiento continuo

**TMLC + TALC combinados** - Mantener la suite de tests saludable

**Verificación previa a producción:**
- Ejecutar los regression tests manuales (TMLC)
- Correr la suite automatizada completa (TALC)
- Smoke/Sanity en staging
- Revisar y eliminar tests obsoletos
- Corregir tests flaky

**→ TRANSICIÓN A LATE-GAME:** con una suite estable y verificada, estamos listos para desplegar a producción e iniciar la fase de observación.

---

## Parte 5: Late-Game Testing (pasos 11-16)

### Filosofía: observación

> "How does it behave in the real world?"

**Roles principales:** QA + DevOps + SRE
**Foco:** observación, monitoreo y resiliencia en producción
**Enfoques:** Shift-Right, Chaos Engineering, Production Monitoring

### Paso 11: despliegue a producción y Smoke Testing

**Propósito:** asegurar la estabilidad de la aplicación tras el despliegue a producción

**Actividades:**
- Ejecutar smoke/sanity tests en el ambiente de producción
- Validar las funcionalidades críticas post-despliegue
- Registrar los problemas urgentes para su resolución inmediata
- Monitorear en tiempo real las métricas de salud del sistema

**Flujo de decisión:**
```
DEPLOY → SMOKE TEST → MONITOR → VALIDATE
                         │
              ┌──────────┴──────────┐
              │                     │
           PASSED                FAILED → ROLLBACK
```

### Paso 12: monitoreo de Canary Release

**Propósito:** desplegar a un porcentaje pequeño de usuarios para monitorear el comportamiento

**Etapas de rollout:**
```
5% → 10% → 25% → 50% → 100%
 │     │     │     │     │
 └─────┴─────┴─────┴─────┘
      MONITOR AT EACH STAGE
```

**Puntos de decisión:**
- ¿Métricas OK? → Expandir el rollout
- ¿Métricas MAL? → Rollback inmediato

### Paso 13: A/B Testing y experimentación

**Propósito:** probar distintas versiones de una feature para optimizar la experiencia de usuario

**Estructura del experimento:**
```
           USER TRAFFIC
                │
       ┌────────┴────────┐
       │                 │
   VARIANT A         VARIANT B
   (Control)         (Treatment)
      50%               50%
       │                 │
       └────────┬────────┘
                │
         ANALYZE RESULTS
         (Statistical Significance)
                │
       ┌────────┴────────┐
       │                 │
    A WINS            B WINS
 Keep current      Deploy new
```

### Paso 14: Real User Monitoring (RUM)

**Propósito:** monitorear la experiencia real del usuario en producción

**Core Web Vitals:**
| Métrica | Objetivo | Descripción              |
| ------- | -------- | ------------------------ |
| LCP     | < 2.5s   | Largest Contentful Paint |
| FID     | < 100ms  | First Input Delay        |
| CLS     | < 0.1    | Cumulative Layout Shift  |

**Dimensiones de monitoreo:**
- Ubicación geográfica (latencia por región)
- Tipo de dispositivo (mobile vs desktop)
- Tipo y versión de browser
- Tasas de finalización del user journey
- Tasas de error por página/feature

### Paso 15: Chaos Engineering

**Propósito:** introducir fallas controladas para validar la resiliencia del sistema

**Tipos de experimentos de chaos:**
| Agotamiento de recursos | Fallas de red    | Fallas de aplicación  |
| ----------------------- | ---------------- | --------------------- |
| Pico de CPU             | Latencia         | Caída de servicio     |
| Memory leak             | Pérdida de paquetes | Timeout de dependencia |
| Disco lleno             | Falla de DNS     | Inyección de errores  |
| Kill de proceso         | Partición        |                       |

**Workflow del experimento de chaos:**
1. Definir la hipótesis ("El sistema debería recuperarse en 30s")
2. Planificar el experimento (qué falla, alcance, duración)
3. Ejecutar primero en un ambiente controlado
4. Ejecutar en producción (horas no críticas)
5. Observar el comportamiento del sistema
6. Documentar hallazgos y debilidades
7. Mejorar la arquitectura

### Paso 16: Feedback Loop y mejora continua

**Propósito:** analizar el feedback y las métricas para alimentar el siguiente ciclo de Early-Game

**Recolectar datos:**
- Feedback del soporte al cliente
- Reseñas en las app stores
- Métricas de producción
- Patrones y tendencias de errores
- Analítica del comportamiento de usuarios

**Analizar y aprender:**
- Identificar patrones de fallas
- Actualizar los criterios de aceptación
- Influir en el roadmap del producto
- Mejorar la cobertura de tests

**→ EL CICLO CONTINÚA:** los insights de producción informan la siguiente fase de Early-Game, creando un ciclo virtuoso de mejora continua.

### Métricas clave de Late-Game

| Métrica           | Objetivo | Descripción                 |
| ----------------- | -------- | --------------------------- |
| MTTD              | < 5 min  | Mean Time To Detect         |
| MTTR              | < 30 min | Mean Time To Resolution     |
| Error Rate        | < 0.1%   | Application Error Rate      |
| CSAT              | > 4.5/5  | Customer Satisfaction Score |
| SLO Compliance    | > 99.9%  | Service Level Objective     |
| Performance Score | > 90/100 | Core Web Vitals Score       |

---

## Parte 6: artefactos del Test Management

### Jerarquía completa de artefactos

Esta estructura vive en la Management Tool del proyecto (Jira/Xray, Azure DevOps, TestRail, etc.):

```
QA (Main Dashboard)
│
├── 📄 Test Strategy (single document)
│   └── Defines overall testing approach, tools, environments
│
├── 📄 Master Test Plan (single document)
│   └── Scope, schedule, resources, entry/exit criteria
│
├── 📁 Test Repository (like a Roadmap/Epic container)
│   │
│   ├── 📁 Module A
│   │   ├── 📋 Test Suite: Feature A1
│   │   │   ├── TC-001: Test Case 1
│   │   │   ├── TC-002: Test Case 2
│   │   │   └── TC-003: Test Case 3
│   │   └── 📋 Test Suite: Feature A2
│   │
│   ├── 📁 Module B
│   │
│   └── 📁 Module C
│
├── 📁 Test Runs (by Regression)
│   ├── 📋 Regression [Environment] Sprint X
│   ├── 📋 Regression [Environment] Sprint Y
│   └── 📋 Regression [Environment] Sprint Z
│
├── 📊 RTM (Requirements Traceability Matrix)
│   └── Features linked to Test Suites, Test Cases, and Defects
│
└── 📁 Reports
    ├── 📄 Sprint Test Summary
    ├── 📄 Release Test Report
    └── 📊 Additional Dashboards
```

### Test Runs: foco en Regression

En el TMS, **los Test Runs se usan principalmente para ciclos de Regression**, no para ejecuciones de Smoke o Sanity.

**Por qué los Test Runs están enfocados en Regression:**

| Estrategia de test | Dónde ocurre                                | Seguimiento en el TMS                          |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| **Smoke Tests**    | Automatizados en CI/CD, ejecutados a menudo | NO - demasiado frecuentes, se registran en los reportes de CI |
| **Sanity Tests**   | Automatizados en CI/CD, validación post-fix | NO - demasiado frecuentes, se registran en los reportes de CI |
| **Regression**     | Ciclos programados (por sprint, por release)| SÍ - manual + automatizado, seguimiento completo |

**El workflow central:**
```
Document Test Case → Add to Regression Suite → Automate (if applicable) → Execute Regression when needed
```

**Convención de nombres del Regression Test Run:**
```
Regression [Environment] [Sprint/Release]

Examples:
• Regression Staging Sprint 15
• Regression DevStage Sprint 15
• Regression Production Release 2.0
```

### Dos sistemas de reporting

El TMS trabaja junto al reporting del Automation Framework, y cada uno cumple propósitos distintos:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DUAL REPORTING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │   AUTOMATION FRAMEWORK REPORTS  │  │      TMS REPORTS (REGRESSION)   │  │
│  │   (Allure / CI-Generated)       │  │      (Manual + Automated)       │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │                                 │  │                                 │  │
│  │  WHERE: Private website         │  │  WHERE: Management Tool         │  │
│  │         (Google Auth access)    │  │         (Jira, Xray, etc.)     │  │
│  │                                 │  │                                 │  │
│  │  WHAT:                          │  │  WHAT:                          │  │
│  │  • Smoke executions             │  │  • Regression cycles only       │  │
│  │  • Sanity executions            │  │  • Manual + Automated tests    │  │
│  │  • Regression (automated only)  │  │  • Linked to requirements      │  │
│  │  • By environment               │  │  • Defect tracking             │  │
│  │  • Historical trends            │  │  • Coverage metrics            │  │
│  │                                 │  │                                 │  │
│  │  AUDIENCE:                      │  │  AUDIENCE:                      │  │
│  │  • Dev team (quick feedback)    │  │  • QA team (full picture)      │  │
│  │  • DevOps (pipeline health)     │  │  • PMs/Stakeholders (status)   │  │
│  │  • QA (automation health)       │  │  • Management (go/no-go)       │  │
│  │                                 │  │                                 │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  CI/CD Pipeline                          TMS Regression Cycle               │
│  ─────────────                           ────────────────────               │
│  • Runs on every commit/PR               • Runs per sprint or release       │
│  • Automated tests only                  • Manual + Automated tests         │
│  • Fast feedback (minutes)               • Comprehensive (hours/days)       │
│  • Reports to Allure website             • Reports in management tool       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Insight clave:** el automation framework genera reportes técnicos detallados para la ejecución del día a día (Smoke, Sanity), mientras que el TMS lleva el seguimiento de los ciclos formales de Regression que incluyen tanto tests automatizados como manuales con trazabilidad completa.

### Concepto clave: Test Case vs Test Run vs Test Result

| Concepto        | Descripción                                                                                                     | Ejemplo                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Test Case**   | Plantilla estática que define QUÉ testear. Reutilizada entre ejecuciones. Tiene su propio ciclo de vida (Draft → Active → Automated) | TC-001 "Verify user login with valid credentials" |
| **Test Run**    | Ciclo de Regression que agrupa TCs para ejecución. Tiene contexto: sprint, release, environment                 | "Regression Staging Sprint 15"                    |
| **Test Result** | Resultado de ejecutar un TC en un Run específico. Estado: Passed/Failed/Blocked/Skipped. Puede vincularse a un defecto | TC-001 PASSED in "Regression Staging Sprint 15"   |

**Ejemplo práctico:**
```
TC-001 (Login Test)
     │
     ├──▶ Regression Sprint 5 ──▶ Result: PASSED ✓
     │
     ├──▶ Regression Sprint 6 ──▶ Result: FAILED ✗ ──▶ BUG-042
     │
     └──▶ Regression Sprint 7 ──▶ Result: PASSED ✓ (after bug fix)

The TEST CASE remains the same. Each REGRESSION RUN produces a new RESULT.
```

### Ciclo de vida del Test Case

El ciclo de vida completo desde la creación hasta la automatización:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST CASE LIFE CYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────┐   start    ┌───────────┐  ready    ┌─────────┐                 │
│  │ DRAFT  │──────────▶│ IN DESIGN │─────────▶│  READY  │                 │
│  └────────┘   design   └───────────┘  to run   └────┬────┘                 │
│       ▲                      │                      │                       │
│       │                      │                      │                       │
│       │ recover              │ back                 ├────── for manual ────┐│
│       │                      ▼                      │                      ││
│  ┌────────────┐         ┌────────┐                  │                      ││
│  │ DEPRECATED │◀── Any ─│  back  │                  │                      ▼│
│  └────────────┘         └────────┘                  │               ┌────────┐
│                                                     │               │ MANUAL │
│                                                     │               └───┬────┘
│                          automation                 │                   │
│                            review                   │      manual       │
│                              │                      │     execution     │
│                              ▼                      │         │         │
│                        ┌───────────┐                │         │         │
│           ┌───────────│ IN REVIEW │◀───────────────┘         │         │
│           │            └─────┬─────┘                          │         │
│           │                  │                                │         │
│           │ back        approve to                            │         │
│           │              automate                             │         │
│           │                  │                                │         │
│           ▼                  ▼                                │         │
│      ┌────────┐        ┌───────────┐     manual               │         │
│      │  back  │◀───────│ CANDIDATE │────execution─────────────┘         │
│      └────────┘        └─────┬─────┘                                    │
│                              │                                          │
│                         start                                           │
│                        automation                                       │
│                              │                                          │
│                              ▼                                          │
│      ┌────────┐      ┌──────────────┐                                   │
│      │  back  │◀─────│IN AUTOMATION │                                   │
│      └────────┘      └──────┬───────┘                                   │
│                             │                                           │
│                        create PR                                        │
│                             │                          automated        │
│                             ▼                              │            │
│      ┌────────┐      ┌──────────────┐                      │            │
│      │  back  │◀─────│ PULL REQUEST │                      │            │
│      └────────┘      └──────┬───────┘                      │            │
│                             │                              │            │
│           ┌─────────────────┤                              │            │
│           │                 │ merged                       │            │
│           │ Fix             │                              │            │
│           │                 ▼                              │            │
│           │           ┌───────────┐                        │            │
│           └──────────▶│ AUTOMATED │◀───────────────────────┘            │
│                       └───────────┘                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Definiciones de estados:**

| Estado            | Descripción                                          | Quién       |
| ----------------- | ---------------------------------------------------- | ----------- |
| **DRAFT**         | Test case creado, esquema inicial                    | QA Analyst  |
| **IN DESIGN**     | Escribiendo pasos detallados, datos, resultados esperados | QA Analyst  |
| **READY**         | Documentado y listo para ejecución o revisión        | QA Analyst  |
| **MANUAL**        | Designado solo para ejecución manual                 | QA Analyst  |
| **IN REVIEW**     | En evaluación de viabilidad de automatización        | QA Engineer |
| **CANDIDATE**     | Aprobado para automatización, en backlog             | QA Engineer |
| **IN AUTOMATION** | Script en desarrollo                                 | QA Engineer |
| **PULL REQUEST**  | Código enviado, a la espera de revisión              | QA Engineer |
| **AUTOMATED**     | Script mergeado, parte de la regression suite        | QA Engineer |
| **DEPRECATED**    | Ya no aplica (accesible desde cualquier estado)      | Cualquiera  |

**Transiciones clave:**

- **READY → MANUAL**: test no apto para automatización, se ejecutará manualmente
- **READY → IN REVIEW**: test en evaluación de su potencial de automatización
- **CANDIDATE → MANUAL**: tras la revisión, se decide mantenerlo como ejecución manual
- **MANUAL → AUTOMATED**: un test antes manual se automatiza más adelante
- **PULL REQUEST → IN AUTOMATION (Fix)**: PR rechazado, necesita correcciones
- **Any → DEPRECATED**: feature eliminada o test ya no válido
- **DEPRECATED → DRAFT (recover)**: un test deprecado vuelve a ser relevante

### Estado de ejecución del test (Test Result)

```
NOT RUN ──▶ IN PROGRESS ──▶ ┬──▶ PASSED ✓
                            │
                            ├──▶ FAILED ✗ ──▶ DEFECT LOGGED
                            │
                            ├──▶ BLOCKED ⊘
                            │
                            └──▶ SKIPPED ⊖
```

---

## Parte 7: Requirements Traceability Matrix (RTM)

La RTM es una vista/tabla dedicada en el TMS que da visibilidad sobre la cobertura de tests.

### Flujo de trazabilidad completo

```
BUSINESS    USER       FEATURE/      TEST       TEST      DEFECT
NEED        STORY      REQUIREMENT   SUITE      CASE

  │           │            │           │          │          │
  ▼           ▼            ▼           ▼          ▼          ▼
┌─────┐    ┌─────┐      ┌─────┐     ┌─────┐    ┌─────┐    ┌─────┐
│ BN  │───▶│ US  │─────▶│ REQ │────▶│ TS  │───▶│ TC  │───▶│ DEF │
└─────┘    └─────┘      └─────┘     └─────┘    └─────┘    └─────┘

FORWARD TRACEABILITY ──────────────────────────────────────────▶
Question: "Does every requirement have test coverage?"

◀────────────────────────────────────────── BACKWARD TRACEABILITY
Question: "What requirement does this test case verify?"
```

### Estructura de la tabla RTM

| Feature/Requirement | Test Suite      | Test Cases             | Automation % | Last Result | Open Defects | Status        |
| ------------------- | --------------- | ---------------------- | ------------ | ----------- | ------------ | ------------- |
| User Authentication | TS-001 Login    | TC-001, TC-002, TC-003 | 100%         | 3/3 Passed  | -            | ✓ OK          |
| Password Reset      | TS-002 Password | TC-004, TC-005, TC-006 | 66%          | 2/3 Passed  | BUG-042      | ⚠ At Risk     |
| 2FA Implementation  | TS-003 2FA      | TC-007, TC-008         | 50%          | 1/2 Blocked | BUG-045      | ✗ Blocked     |
| Session Management  | -               | -                      | -            | -           | -            | ⊘ No Coverage |

**Leyenda de estados:**
- ✓ OK = requisito totalmente cubierto, tests pasando
- ⚠ At Risk = tiene defectos abiertos o cobertura parcial
- ✗ Blocked = testing bloqueado, problema crítico
- ⊘ No Coverage = gap - ¡necesita test cases!

---

## Parte 8: métricas y dashboards

### Métricas por fase de IQL

**Métricas de Early-Game (prevención):**
- Score de claridad de requisitos
- Defectos encontrados en el AC review (antes de dev)
- Cobertura del FTP por User Story
- Tiempo desde la creación de la US hasta el QA sign-off
- Bugs encontrados durante el exploratory testing

**Métricas de Mid-Game (detección):**
- Progreso de ejecución de test cases
- Tasa de Pass/Fail/Blocked
- Porcentaje de detección de defectos
- Cobertura de automatización (%)
- Pass rate del CI pipeline
- Tasa de flakiness de los tests
- Tiempo desde TC creado hasta Automated

**Métricas de Late-Game (observación):**
- MTTD (Mean Time To Detect) < 5 min
- MTTR (Mean Time To Resolution) < 30 min
- Tasa de errores < 0.1%
- CSAT (Customer Satisfaction) > 4.5/5
- Cumplimiento de SLO > 99.9%
- Score de Core Web Vitals > 90/100

### Componentes del dashboard del TMS

El dashboard principal de QA debería mostrar:

**Salud de Regression:**
- Pass rate de la última regression
- Tendencia de las últimas 5 regressions
- Tests Blocked/Failed que requieren atención

**Estado de cobertura:**
- % de requisitos con cobertura de tests
- % de cobertura de automatización
- Módulos sin tests (gaps)

**Resumen de defectos:**
- Defectos abiertos por severidad
- Defectos por módulo/feature
- Antigüedad de los defectos (días abiertos)

---

## Parte 9: modelo de colaboración de roles

### Simbiosis QA Analyst + QA Automation Engineer

| QA Analyst                    | QA Automation Engineer     |
| ----------------------------- | -------------------------- |
| El "QUÉ" y el "POR QUÉ"       | El "CÓMO" y el "DÓNDE"     |
| Análisis de requisitos        | Diseño del framework       |
| Evaluación de riesgos         | Implementación de scripts  |
| Escritura de BDD/AC           | Integración CI/CD          |
| Planificación de tests        | Mantenimiento de automatización |
| Exploratory testing           | Performance testing        |
| Documentación de test cases   | Reducción de deuda técnica |
| Candidatos a automatización   | Code review                |
| **Principal: Early-Game**     | **Principal: Mid-Game**    |

### La analogía del Navigator y el Driver

**🗺️ QA Analyst = NAVIGATOR**
Usa su conocimiento del producto y del usuario para:
- Dibujar el mapa (test plan)
- Resaltar los destinos más importantes (candidatos a automatización)
- Identificar las rutas riesgosas (áreas de alto riesgo)
- Planificar el viaje (test strategy)

**🚗 QA Automation Engineer = DRIVER**
Usa su expertise técnica para:
- Construir un vehículo rápido y confiable (automation framework)
- Conducir con destreza hacia los destinos definidos (implementar tests)
- Mantener el vehículo (corregir tests flaky)
- Optimizar las rutas (mejorar el pipeline CI/CD)

**JUNTOS:** alcanzan los destinos de calidad más rápido y de forma más eficiente que cualquiera de los dos por separado.

### Workflow asíncrono

1. **Fase 1:** el Analyst define el "QUÉ" - Crea los criterios de aceptación específicos para el equipo de desarrollo
2. **Fase 2:** el Analyst prioriza el "POR QUÉ" - Identifica los candidatos prioritarios para automatización y los documenta
3. **Fase 3:** el Engineer construye el "CÓMO" - Implementa la automatización según la priorización del analyst

**Resultado:** un ciclo virtuoso de calidad donde ambos roles se especializan y escalan de forma eficiente.

---

## Parte 10: Glosario

| Término                | Definición                                                                |
| ---------------------- | ------------------------------------------------------------------------- |
| **IQL**                | Integrated Quality Lifecycle - metodología que reemplaza al STLC          |
| **TMLC**               | Test Manual Life Cycle - stages 1-4 de las actividades de testing manual  |
| **TALC**               | Test Automation Life Cycle - stages 1-4 de las actividades de automatización |
| **FTP**                | Feature Test Plan - hipótesis/esquemas creados antes del testing          |
| **Early-Game**         | Fase de prevención (pasos 1-4) - liderada por el QA Analyst               |
| **Mid-Game**           | Fase de detección (pasos 5-10) - liderada por el QA Automation Engineer   |
| **Late-Game**          | Fase de observación (pasos 11-16) - QA + DevOps/SRE                       |
| **Shift-Left**         | Adelantar las actividades de calidad en el SDLC                          |
| **Shift-Right**        | Extender la validación de calidad a producción                            |
| **Risk-Based Testing** | Priorizar pruebas según impacto y probabilidad                           |
| **BDD**                | Behavior-Driven Development - escenarios Given/When/Then                  |
| **Test Case**          | Plantilla estática que define qué testear                                |
| **Test Run**           | Ciclo de Regression que agrupa TCs para ejecución                         |
| **Test Result**        | Resultado de ejecutar un TC en un Run específico                         |
| **RTM**                | Requirements Traceability Matrix - vincula requisitos con tests y defectos |
| **Regression**         | Ejecución programada de la test suite para verificar que no haya regresiones |
| **MTTD**               | Mean Time To Detect - métrica de monitoreo en producción                 |
| **MTTR**               | Mean Time To Resolution - métrica de respuesta a incidentes              |

---

## Conclusión

El **Integrated Quality Lifecycle (IQL)** no es solo una metodología: es un cambio de mentalidad que integra la calidad a lo largo de todo el ciclo de vida del desarrollo de software.

### Puntos clave para llevarse

1. **La calidad no es una fase, es un ciclo continuo** - Desde la prevención en Early-Game hasta la observación en Late-Game

2. **Los 16 pasos proveen un framework completo** - Cubren todo, desde el análisis de requisitos hasta los feedback loops de producción

3. **Dos ciclos de vida trabajan en armonía** - TMLC (manual) y TALC (automatización) se complementan mutuamente

4. **La documentación asíncrona preserva la agilidad** - Los test cases se documentan DESPUÉS de confirmar el comportamiento, no antes

5. **Regression es el foco del seguimiento del TMS** - Smoke/Sanity corren con frecuencia en CI/CD, pero los ciclos de Regression se registran formalmente

6. **Arquitectura de reporting dual** - CI/CD genera reportes técnicos; el TMS lleva el seguimiento integral de la regression con trazabilidad

7. **Los roles colaboran, no compiten** - Analyst y Engineer forman una relación simbiótica

8. **El feedback loop cierra el círculo** - Los insights de producción se retroalimentan hacia el siguiente ciclo de Early-Game

### La promesa de IQL

> "Quality integrated from the start, detected before release, and observed in the real world."

Este documento sirve como base para implementar un Test Management System alineado con los principios de IQL. Adaptá los detalles a tus herramientas y contexto, pero mantené la filosofía central: **prevención, detección y observación** trabajando juntas en un ciclo continuo de mejora de la calidad.

---

*Versión del documento: 2.0*
*Metodología: Integrated Quality Lifecycle (IQL)*
*Referencia: {{WEBAPP_DOMAIN}}/metodologia*
