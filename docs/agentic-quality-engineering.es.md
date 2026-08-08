# Agentic Quality Engineering

> _Traducción al español de [agentic-quality-engineering.md](agentic-quality-engineering.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Propósito**: La única fuente de verdad sobre qué es este repositorio y cómo funciona — la estrategia, la arquitectura, las skills, el modelo de orquestación y la disciplina de ingeniería que respaldan cada test automatizado.
> **Audiencia**: Ingenieros, practicantes de QA y líderes técnicos que evalúan o adoptan este boilerplate. Leé esto antes de leer cualquier otra cosa.
> **Alcance**: Context Engineering, skills y commands de Claude Code, integraciones MCP, orquestación de agentes con human-in-the-loop, arquitectura de test automation KATA y el quality gate de release.
> **¿Por qué "agentic"?** Esta práctica no es "IA como chatbot". Se apoya en skills que se auto-activan, subagents despachados para tareas puntuales, uso de herramientas en vivo a través de MCPs y CLIs, y supervisión humana con checkpoints. Esos son los rasgos definitorios de los sistemas *agentic* — de ahí el nombre.

---

## Tabla de contenidos

1. [Descripción general](#1-descripción-general)
2. [Por qué existe este boilerplate](#2-por-qué-existe-este-boilerplate)
3. [Estrategia: Agentic Shift-Left Testing](#3-estrategia-agentic-shift-left-testing)
4. [Glosario: términos usados a lo largo de este documento](#4-glosario-términos-usados-a-lo-largo-de-este-documento)
5. [Arquitectura del sistema](#5-arquitectura-del-sistema)
6. [Context Engineering: la capa de conocimiento](#6-context-engineering-la-capa-de-conocimiento)
7. [Fuentes de verdad: de dónde viene el contexto](#7-fuentes-de-verdad-de-dónde-viene-el-contexto)
8. [Trabajar con Claude Code: flujo de trabajo diario](#8-trabajar-con-claude-code-flujo-de-trabajo-diario)
9. [El modelo de orquestación: la IA trabaja, el humano decide](#9-el-modelo-de-orquestación-la-ia-trabaja-el-humano-decide)
10. [Flujo de las etapas 1–3: Inicio de sesión → Planificación → Ejecución → Reporte](#10-flujo-de-las-etapas-13-inicio-de-sesión--planificación--ejecución--reporte)
11. [Ingeniería de Test Automation](#11-ingeniería-de-test-automation)
12. [El toolkit de IA: skills, commands, integraciones](#12-el-toolkit-de-ia-skills-commands-integraciones)
13. [El quality gate: GO / CAUTION / NO-GO](#13-el-quality-gate-go--caution--no-go)
14. [Anatomía de una sesión de testing](#14-anatomía-de-una-sesión-de-testing)
15. [Métricas: plantilla de instrumentación](#15-métricas-plantilla-de-instrumentación)
16. [Resumen de lo que entrega la práctica](#16-resumen-de-lo-que-entrega-la-práctica)

---

## 1. Descripción general

Este repositorio no es una suite de tests tradicional. Es una **práctica de agentic quality engineering** construida sobre Playwright, TypeScript y Bun, orquestada a través de skills y commands de Claude Code, y respaldada por una capa de conocimiento estructurada que permite a los agentes de IA entender el sistema bajo prueba sin que el ingeniero de QA tenga que re-explicarlo en cada sesión.

Las skills están escritas en el formato abierto SKILL y son compatibles con los runtimes de Claude Code, Copilot, Cursor, Codex y OpenCode — Claude Code es la implementación de referencia usada a lo largo de este documento.

La práctica está organizada en torno a un **pipeline de etapas** que lleva una Story desde el refinamiento pre-sprint de ACs hasta una decisión de release basada en datos. La Etapa 0 corre PRE-SPRINT sobre un lote de Stories del backlog; las Etapas 1-6 corren IN-SPRINT por ticket:

```
                          ┌──── PRE-SPRINT ────┐  ┌──────────────────────── IN-SPRINT ──────────────────────────┐
ONBOARDING (one-time)  →  STAGE 0           →  SESSION START  →  STAGE 1   →  STAGE 2   →  STAGE 3   →  STAGE 4    →  STAGE 5   →  STAGE 6
  (project-discovery)     (Shift-Left QA)      (Context)         (Planning)   (Execution)  (Reporting)  (Documentation) (Automation) (Regression)
```

| Etapa | Skill responsable | Salida |
| ----- | ------------ | ------ |
| **Onboarding** (única vez) | `project-discovery` (discovery) + `/adapt-framework` (adaptación KATA) | `CLAUDE.md`, artefactos de `.context/` y KATA conectado al stack objetivo |
| **0 — Shift-Left QA** (pre-sprint, por lote) | `shift-left-testing` | ACs refinados + detección de gaps + esquemas de ATP DRAFT por Story, label `shift-left-reviewed`, Story transicionada `backlog → shift_left_qa → estimation` para que PO/Dev estimen |
| **1 — Planning** (in-sprint) | `sprint-testing` | ATP + TCs enlazados a ACs (hace short-circuit de las Fases 1-3 cuando la Story trae un label `shift-left-reviewed` reciente) |
| **2 — Execution** | `sprint-testing` | Exploración smoke + trifuerza (UI/API/DB), evidencia capturada |
| **3 — Reporting** | `sprint-testing` | ATR, tickets de bug, comentario de QA en el ticket origen |
| **4 — Documentation** | `test-documentation` | Artefactos de TMS con veredicto de ROI (Candidate / Manual / Deferred) |
| **5 — Automation** | `test-automation` | Tests KATA de Playwright, decorados con `@atc` y trazables |
| **6 — Regression** | `regression-testing` | Pass-rate de CI, clasificación de fallos, veredicto GO / CAUTION / NO-GO |

Cada etapa está impulsada por una skill de IA, cada skill opera con un checkpoint de human-in-the-loop, y cada artefacto producido es trazable desde la user story original hasta el run de regression en CI que valida el release.

Este documento recorre el sistema completo — el problema que resuelve, la estrategia detrás, la arquitectura que lo soporta y el rigor de ingeniería aplicado a cada capa.

---

## 2. Por qué existe este boilerplate

La mayoría de los productos en etapa temprana empiezan en el mismo lugar:

- **Cero tests automatizados.** Toda verificación es manual y no repetible.
- **Sin Test Management System.** No hay registro central de test plans, test cases ni resultados de test.
- **Sin trazabilidad.** Se encuentran bugs, pero no hay enlace desde el requerimiento al test y al release.
- **Sin estrategia de test.** No hay respuesta documentada a "¿qué deberíamos estar testeando, y por qué?"

Eso funciona hasta que deja de funcionar. En el momento en que el producto maneja **dinero real**, **datos regulados** o **aislamiento multi-tenant**, el costo de una regression silenciosa explota. Un criterio de aceptación omitido se convierte en un reembolso a un cliente, una respuesta a incidentes o un hallazgo de compliance.

El objetivo de este boilerplate no es, por lo tanto, "agregar algunos tests" a un proyecto, sino instalar — de punta a punta — la **infraestructura, el conocimiento y los flujos de trabajo** que hacen posible el quality engineering en absoluto. Una empresa que adopta este repositorio obtiene, desde el día uno:

- Un pipeline de 6 etapas propiedad de skills de IA, con checkpoints humanos entre etapas.
- Una capa de contexto estructurada (`.context/`) que la IA lee antes de actuar.
- Una arquitectura de test KATA lista para recibir los primeros tests.
- Una integración de TMS (Jira/Xray por defecto, intercambiable) con trazabilidad programática.
- Un quality gate impulsado por CI que emite veredictos GO / CAUTION / NO-GO, no corazonadas.

El resto de este documento describe cómo está construido ese boilerplate y cómo opera en la práctica.

---

## 3. Estrategia: Agentic Shift-Left Testing

La estrategia guía es **Shift-Left Testing**: cuanto más temprano en el ciclo de vida del desarrollo de software se encuentra un bug, más barato es corregirlo. Esto no es una idea nueva — se entiende bien desde hace décadas. Lo que cambió es la economía.

### La curva del costo del defecto

```
   Cost / Effort to Fix
          ▲
          │                                                    ╱
          │                                                 ╱       ← Without QA gate
          │                                             ╱             (exponential rise)
          │                                         ╱
          │                                     ╱
          │                        inflection
          │                            ●
          │                  ╱──────────────────
          │                ╱                        ← With Agentic Shift-Left
          │              ╱                            (small early effort, then flat)
          │            ╱
          ●──────────────────────────────────────────────────▶  SDLC phase
        Requirements  Design   Dev    Test    Pre-Prod    Production
        [AC Review]   [ATP]   [Smoke] [UI+API+DB]         [Too late]
```

- La **curva roja** representa la trayectoria tradicional: un bug atrapado en producción cuesta dramáticamente más que uno atrapado durante la revisión de requerimientos. Un solo criterio de aceptación omitido que llega a producción puede significar una migración de datos, un reembolso a un cliente o una respuesta a incidentes.
- La **curva verde** representa la trayectoria Shift-Left: invertí un pequeño esfuerzo por adelantado en revisiones de ACs, test plans y validación temprana, y la curva de costo se aplana.

### Por qué los agentes hacen que Shift-Left sea económicamente viable

Siempre se supo que Shift-Left funciona. Lo que históricamente impidió a los equipos adoptarlo es el **costo**: un analista tiene que leer cada criterio de aceptación, diseñar cada test plan, perseguir cada enlace de trazabilidad. La mayoría de las organizaciones no puede costear ese trabajo manual.

Los agentes cambian la ecuación:

- **La carga de contexto es automática.** Las skills leen las reglas de negocio, la documentación de API y las prioridades de test relevantes al inicio de la sesión — ningún humano tiene que preparar un briefing.
- **La generación de test plan es en minutos, no horas.** La IA redacta un triage de riesgo, escenarios y requisitos de datos de test a partir del ticket y su contexto.
- **La trazabilidad se verifica programáticamente.** El command `fix-traceability` y la skill `xray-cli` recorren la cadena completa — story → ATP → ATR → TCs — y detectan enlaces faltantes automáticamente.

El resto de este documento describe cómo se implementa esa estrategia en código y skills.

---

## 4. Glosario: términos usados a lo largo de este documento

| Término               | Definición                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Token**             | La unidad que un modelo de IA lee y escribe. Los tokens tienen costo directo y ocupan espacio en la context window.          |
| **Context Window**    | La memoria disponible dentro de una sola conversación. Todo lo que la IA puede "ver" en este momento.                        |
| **MCP**               | Model Context Protocol. Un estándar que permite a las herramientas de IA hablar con sistemas en vivo — base de datos, browser, API, TMS. |
| **Skill**             | Una capacidad de IA reutilizable, guardada bajo `.claude/skills/<name>/`. Se auto-activa cuando la intención del usuario coincide con su description. |
| **Command**           | Una utilidad de un solo disparo guardada bajo `.claude/commands/<name>.md`. Se invoca explícitamente con `/<name>`. Sin auto-activación. |
| **Subagent**          | Un worker especialista despachado por una skill para una tarea puntual (planning, execution, reporting, verificación).       |
| **Persistent Memory** | Hechos que sobreviven a través de conversaciones — preferencias del usuario, reglas del proyecto, decisiones del equipo.      |
| **ATP**               | Acceptance Test Plan. El triage de riesgo y el diseño de escenarios producidos en la Etapa 1 (Planning).                     |
| **ATR**               | Acceptance Test Results. El reporte presentado en la Etapa 3 (Reporting).                                                    |
| **TC**                | Test Case. Una verificación única y trazable enlazada a un criterio de aceptación.                                           |
| **ATC**               | Acceptance Test Case. Un TC implementado como código, portando un decorador `@atc('{{PROJECT_KEY}}-XXX-TC#')`.               |
| **PBI**               | Product Backlog Item. En este repo, la carpeta local (`.context/PBI/...`) que almacena el conocimiento por ticket y por módulo. |
| **KATA**              | Komponent Action Test Architecture. El patrón de cuatro capas usado para organizar los tests automatizados.                  |
| **Subagent Dispatch Strategy** | Tabla por skill que declara qué etapas delegan a subagents y con qué patrón (Single / Sequential / Parallel / Background). Vive en cada `SKILL.md` de workflow bajo `## Subagent Dispatch Strategy`. |

---

## 5. Arquitectura del sistema

La práctica está organizada en tres niveles conceptuales:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      QUALITY ENGINEER (Human)                       │
│         Makes decisions · Reviews AI output · Approves releases     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────┴────────────────────────────────────┐
│                          AI SKILLS LAYER                            │
│                                                                     │
│  Foundation skill                                                   │
│  ┌────────────────┐                                                 │
│  │ agentic-qa-core │  Briefing template · Dispatch patterns ·        │
│  └────────────────┘  Orchestration doctrine · Bootstrap CLI         │
│                                                                     │
│  Workflow skills                                                    │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────┐ │
│  │ project-  │ │  sprint-  │ │   test-   │ │   test-   │ │regres. │ │
│  │discovery  │ │  testing  │ │documentat.│ │automation │ │testing │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └────────┘ │
│                                                                     │
│  Tool / utility skills                                              │
│  acli · xray-cli · playwright-cli                                   │
│                                                                     │
│  Shared Knowledge Layer                                             │
│  Business flows · API docs · Test priorities · Per-ticket memory    │
└──────────────────────┬──────────────────┬──────────────────┬────────┘
                       │                  │                  │
              ┌────────▼─────┐   ┌───────▼────────┐  ┌──────▼───────┐
              │  [TMS_TOOL]  │   │   [DB_TOOL]    │  │   CI / CD    │
              │  (Jira/Xray) │   │ (DBHub MCP…)   │  │(GitHub Act.) │
              └──────────────┘   └────────────────┘  └──────────────┘
```

### Nivel superior — el Quality Engineer

El humano se sitúa arriba de todo. La IA nunca despacha nada por su cuenta. Cada etapa tiene un checkpoint donde un humano revisa, aprueba, modifica o rechaza el trabajo de la IA.

### Nivel intermedio — las skills de IA

Seis skills principales manejan el pipeline de punta a punta (una foundation + cinco de workflow):

- **`agentic-qa-core`** — foundation skill. Aloja el briefing template canónico, los dispatch patterns y la orchestration doctrine citados por cada workflow skill, y provee el bootstrap `init` que escribe `CLAUDE.md`, `.agents/project.yaml` y los scripts `agents-*` al adoptar el boilerplate.
- **`project-discovery`** — onboarding de una sola vez. Genera los archivos de contexto de los que depende cada otra skill.
- **`sprint-testing`** — Etapas 1–3. Planning, Execution y Reporting por ticket. El driver del día a día.
- **`test-documentation`** — Etapa 4. Análisis de ROI que decide qué TCs manuales vale la pena automatizar.
- **`test-automation`** — Etapa 5. Escribir el código de test KATA + Playwright real.
- **`regression-testing`** — Etapa 6. Correr la suite de regression y emitir un veredicto de release.

Las Tool / utility skills — `acli` (Atlassian CLI para operaciones sobre work-items de Jira), `xray-cli` (gestión de tests en Xray Cloud), `playwright-cli` (automatización de browser) — se invocan bajo demanda o se componen dentro de las workflow skills.

Todas las skills comparten la **Knowledge Layer** (el directorio `.context/`): reglas de negocio, arquitectura de API, prioridades de test y memoria por ticket.

### Nivel inferior — los sistemas sobre los que opera la IA

- **`[ISSUE_TRACKER_TOOL]`** — gestión de issues de Jira (Stories, Bugs, Epics) accedida vía la skill `acli` (Atlassian CLI) por defecto; intercambiable vía la tabla de Tool Resolution en `CLAUDE.md`.
- **`[TMS_TOOL]`** — el test management system que aloja ATPs, ATRs y TCs. Resuelve a la skill `xray-cli` en **Modality jira-xray** o a la skill `acli` en **Modality jira-native**. La modality se decide una vez por proyecto en `test-documentation/SKILL.md` §Phase 0.
- **`[DB_TOOL]`** — la base de datos en vivo, accedida a través de un MCP (DBHub por defecto). Se usa para encontrar, generar o verificar datos de test.
- **CI / CD** — la suite de regression, típicamente GitHub Actions, reportando a Allure.

Los corchetes `[TOOL]` no son decorativos. Cada skill en este repo escribe las llamadas a herramientas en pseudocódigo `[TAG_TOOL]`, que resuelve contra la tabla en `CLAUDE.md` "Tool Resolution". Cambiá la fila, cambiás el backend — sin ediciones de skill requeridas.

---

## 6. Context Engineering: la capa de conocimiento

Context Engineering es la disciplina de curar la información que la IA lee **antes** de actuar. Una IA que lee el contexto correcto no necesita adivinar, y no alucina. Una IA que adivina es peligrosa en un sistema de grado productivo.

La capa de conocimiento está organizada en tres niveles, reflejando el alcance en el que la información es relevante:

```
┌──────────────────────────────────────────────────────────────┐
│  PROJECT LEVEL                                               │
│  Business rules · API architecture · Test priorities         │
│  Example: business-data-map.md catalogs every entity and     │
│  flow in the system under test.                              │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  MODULE LEVEL                                                │
│  Routes · DB tables · Shared test data · Module-specific     │
│  conventions.                                                │
│  Example: `PBI/epics/EPIC-<KEY>-<slug>/module-context.md`    │
│  lists the routes, tables, and test-data candidates for the  │
│  module (Module = Epic, 1:1).                                │
└──────────────────────────────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  TICKET LEVEL                                                │
│  Acceptance criteria · Team decisions · Evidence ·           │
│  Session memory.                                             │
│  Example: `PBI/epics/EPIC-<KEY>-<slug>/test-specs/<ID>/      │
│  spec.md`, `automation-plan.md`; story evidence at           │
│  `stories/STORY-<KEY>-<slug>/evidence/*.png`.                │
└──────────────────────────────────────────────────────────────┘
```

### Cómo se ve realmente en disco

```
.context/
├── business/                      # Nivel proyecto — mapas de negocio (generados por command)
│   ├── business-data-map.md      #   Flujos y entidades del sistema    (/business-data-map)
│   ├── business-feature-map.md   #   Catálogo de features, CRUD, flags (/business-feature-map)
│   └── business-api-map.md       #   Modelo de auth, endpoints críticos (/business-api-map)
├── master-test-plan.md           # Nivel proyecto — qué testear y por qué (/master-test-plan)
├── PRD/                          # Nivel proyecto — requisitos de producto (fase 2 de discovery)
│   └── business/                 #   Constitución de negocio, glosario de dominio
├── SRS/                          # Nivel proyecto — requisitos de software (fase 2 de discovery)
├── ADR/                          # Nivel proyecto — decisiones de test-architecture (append-only, nunca se regeneran)
│   ├── README.md                #   Cuándo escribir (two-gate) + ciclo de vida de estado + índice
│   └── ADR-NNNN-template.md     #   Copiar → ADR-NNNN-<slug>.md por decisión
└── PBI/                          # Nivel Epic + Story (Module = Epic, 1:1)
    ├── epic-tree.md              # Índice maestro de cada Epic            [SYNC]
    └── epics/
        └── EPIC-<KEY>-<slug>/
            ├── epic.md                          # Vista general del Epic [SYNC]
            ├── feature-implementation-plan.md   # Plan de dev a nivel feature [SYNC]
            ├── feature-test-plan.md             # Test plan a nivel feature[SYNC]
            ├── module-context.md                # Vista general del módulo (non-Jira)
            ├── test-specs/                      # Nivel EPIC (non-Jira)
            │   ├── ROADMAP.md   # Todos los test IDs + estado de automation
            │   ├── PROGRESS.md  # Progreso actual
            │   └── <ID>/
            │       ├── spec.md            # Especificación de test
            │       ├── automation-plan.md # Plan de automation a nivel código
            │       └── atc/*.md           # Diseños de ATC individuales
            └── stories/
                └── STORY-<KEY>-<slug>/
                    ├── story.md                       # Vista general de la Story [SYNC]
                    ├── acceptance-criteria.md         # Cache por campo  [SYNC]
                    ├── acceptance-test-plan.md        # Cache de ATP     [SYNC]
                    ├── acceptance-test-results.md     # Cache de ATR     [SYNC]
                    ├── comments.md                    # Comentarios de Jira [SYNC]
                    ├── context.md                     # Notas de sesión (non-Jira)
                    └── evidence/*.png                 # Evidencia capturada (non-Jira)
```

Los archivos `[SYNC]` reflejan un campo de Jira y son un cache de solo lectura materializado por `scripts/sync-jira-issues.ts` — nunca escritos a mano. Jira es la fuente de verdad.

La forma canónica está documentada en `.context/README.md`. El razonamiento estratégico detrás de la división en tres niveles vive en `CONTEXT.md` (raíz del repo) — leelo para el rationale completo.

### Referencias cross-skill

Existe una segunda superficie de conocimiento fuera de `.context/`: los archivos `agentic-qa-core/references/*.md`. Alojan el briefing template, la guía de decisión de dispatch patterns y la orchestration doctrine que las workflow skills citan en lugar de duplicar. Se cargan bajo demanda por otras skills y forman parte de la capa de conocimiento de la práctica aunque vivan bajo `.claude/skills/` en lugar de `.context/`.

### Variables de proyecto vs credenciales de runtime

Los valores estáticos del proyecto (`{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, `{{ATLASSIAN_URL}}`, etc.) viven en `.agents/project.yaml` — la IA resuelve las referencias `{{VAR_NAME}}` contra ese archivo una vez por sesión. Las credenciales de test de runtime (`STAGING_USER_EMAIL`, `STAGING_USER_PASSWORD`, etc.) permanecen en `.env` y se leen en tiempo de ejecución. Los dos sistemas están separados por diseño: `.agents/project.yaml` se commitea al repo, `.env` está en gitignore.

### Por qué importa

Cuando la IA abre un ticket una semana después de la última sesión, el contexto sigue ahí — cada AC, cada discusión del equipo, cada pieza de evidencia. No hay costo de re-briefing. Así es como se mantiene la "cero pérdida de contexto" sprint tras sprint.

---

## 7. Fuentes de verdad: de dónde viene el contexto

La capa de conocimiento es documentación estática. Antes de cada test, la IA **también** extrae de siete fuentes en vivo — esto es lo que hace que el sistema se sienta vivo y evita que la IA razone contra suposiciones desactualizadas.

```
                          ┌─────────────────────────┐
                          │      SESSION START      │
                          │   7 sources loaded      │
                          │   automatically         │
                          └──────────┬──────────────┘
                                     │
   ┌──────────┬──────────┬───────────┼───────────┬──────────────┬──────────┐
   ▼          ▼          ▼           ▼           ▼              ▼          ▼
 Frontend   Backend   Knowledge   Database      API          UI runtime   TMS
 codebase   codebase  layer       schema        spec         (browser)    (tickets)
 ({{FRONT   ({{BACK   (.context/) [DB_TOOL]     [API_TOOL]   [AUTOMATION  [TMS_TOOL]
 END_REPO}) END_REPO})                                       _TOOL]
```

Cada fuente le entrega a la IA un tipo específico de verdad:

| Fuente                    | Qué provee                                                    | Mecanismo de acceso                                    |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| **Frontend codebase**     | Routes, gestión de estado, patrones de llamadas a API         | Lecturas directas de archivos contra `{{FRONTEND_REPO}}` |
| **Backend codebase**      | Controllers, services, models, DTOs                           | Lecturas directas de archivos contra `{{BACKEND_REPO}}`  |
| **Knowledge layer**       | Reglas de negocio curadas, documentación de API, prioridades de test | Archivos de `.context/`                                 |
| **Database schema**       | Tablas en vivo, columnas, relaciones, datos de test reales    | `[DB_TOOL]` — DBHub MCP por defecto                     |
| **API spec**              | Cada endpoint, formas de request/response, tipos              | `[API_TOOL]` — OpenAPI MCP por defecto                  |
| **UI runtime**            | Screenshots reales, árbol de accesibilidad, estado de navegación | `[AUTOMATION_TOOL]` — skill `playwright-cli`           |
| **TMS**                   | Tickets, ACs, discusión del equipo, artefactos de test        | `[TMS_TOOL]` — skill `xray-cli` (Jira/Xray) por defecto |

Los corchetes `[TAG_TOOL]` se mapean a implementaciones concretas vía la tabla de **Tool Resolution** en `CLAUDE.md`. Las skills nunca hardcodean un nombre de herramienta — llaman a `[TMS_TOOL]` y dejan que la tabla decida si eso significa el CLI de Xray, el MCP de Atlassian, u otra cosa que el equipo haya conectado.

**TMS modality**: `[TMS_TOOL]` resuelve a la skill `xray-cli` en **Modality jira-xray** o a la skill `acli` en **Modality jira-native**, según `test-documentation/SKILL.md` §Phase 0. En Modality jira-native, los ATPs y ATRs viven como custom fields de la Story con espejos en comentarios y los TCs viven como issues `Test` de Jira; las workflow skills llevan ramas de pseudocódigo paralelas para ambas modalities.

Cada IA opera sobre estas fuentes a través de dos interfaces complementarias:

- **CLIs** — herramientas de línea de comandos first-party incluidas dentro de este repo (`bun xray`, `bun run api:sync`, etc.). Rápidas, deterministas, de bajo consumo de tokens. Preferidas cuando están disponibles.
- **MCPs** — puentes del Model Context Protocol de Anthropic hacia sistemas externos (`dbhub`, `openapi`, `atlassian`, `context7`, `tavily`). Se usan cuando el CLI no cubre la acción, o cuando la IA necesita explorar en lugar de ejecutar un flujo fijo.

Antes de que empiece cualquier diseño de test, la IA ya recorrió el subconjunto relevante de estas siete fuentes. Esa es la razón por la que no necesita adivinar.

---

## 8. Trabajar con Claude Code: flujo de trabajo diario

El flujo de trabajo diario es inglés llano. El ingeniero de QA le dice a Claude Code qué se necesita, y la skill que coincide se auto-activa por coincidencia de description.

### Ejemplos de invocaciones

```text
> Read @.context/reports/SPRINT-10-TESTING.md and process this sprint
  → Auto-activa: skill sprint-testing en modo sprint

> Test {{PROJECT_KEY}}-450
  → Auto-activa: skill sprint-testing en modo single-ticket

> Retest bug {{PROJECT_KEY}}-460
  → Auto-activa: skill sprint-testing en modo bug

> Continue sprint from {{PROJECT_KEY}}-450, mode yolo
  → Auto-activa: skill sprint-testing, resume + batch (sin paradas)

> Run regression suite
  → Auto-activa: skill regression-testing

> Write E2E test for {{module}}
  → Auto-activa: skill test-automation
```

La auto-activación está gobernada por el campo `description` de cada skill, que lista las frases a las que la skill debe responder. El árbol de decisión en `CLAUDE.md` documenta el mapeo completo. La invocación explícita también está soportada — `/sprint-testing`, `/test-automation`, etc. — para casos donde se prefiere determinismo sobre pattern matching.

### Qué pasa al invocar

La skill carga sus references, abre la carpeta PBI del ticket objetivo (o la crea), extrae contexto de las siete fuentes listadas arriba, y despacha el primer subagent de la etapa. Todo lo que pasa después es visible en el transcript.

### Stack recomendado

La práctica corre sobre esta combinación de herramientas. Cada una es reemplazable, pero la combinación es lo que la práctica espera de fábrica:

| Herramienta                       | Rol                                                            |
| --------------------------------- | --------------------------------------------------------------- |
| **Terminal AI-native** (Warp, etc.) | Terminal con entrada por voz, bloques, autocompletado inteligente. |
| **Claude Code**                   | El CLI de IA que corre por encima — despacha skills, subagents, MCPs. |
| **VSCode · Cursor · Windsurf**    | Editor — preferencia personal, no un estándar. Elegí uno.       |
| **Git**                           | Versionado de código y contexto.                                |
| **`[TMS_TOOL]`** (Jira/Xray)      | Test management — tickets, ATPs, ATRs, TCs.                     |

Claude Code es la pieza portante — es el orquestador que dispara skills, despacha subagents y accede a MCPs. Todo lo demás es la superficie de trabajo del ingeniero a su alrededor.

---

## 9. El modelo de orquestación: la IA trabaja, el humano decide

Esta es la decisión arquitectónica más importante de la práctica, y la que más se malinterpreta en QA asistida por IA: **las skills no corren de punta a punta de forma autónoma**.

```
                ┌─────────────────────────┐
                │    MAIN AI (Skill)      │
                │    "Command Center"     │
                │    Dispatches work      │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ Subagent │ ──●→    │ Subagent │ ──●→    │ Subagent │  ──●→ Done
  │ PLANNING │  👤     │EXECUTION │  👤     │REPORTING │   👤
  └──────────┘         └──────────┘         └──────────┘

  ● = Human checkpoint. The QA engineer reviews, approves, modifies, or vetoes.
      Nothing proceeds without review.
```

### Tres garantías

1. **Cada subagent reporta de vuelta.** Sin trabajo silencioso. La main AI presenta un resumen al final de cada etapa.
2. **El humano puede parar, redirigir o modificar en cualquier checkpoint.** Un veto en cualquier gate obliga a la skill a replanificar.
3. **El transcript completo queda registrado.** Cada decisión, cada dispatch, cada salida es auditable a posteriori.

### Por qué existen los checkpoints

La IA comete errores — malinterpretar un AC, seleccionar datos de test equivocados, clasificar mal un fallo. Atrapar esos errores **entre etapas** evita que caigan en cascada. Una decisión equivocada en Planning que llega a Reporting produce un ATR corrupto. Atrapada en el gate de Planning, es una corrección de dos minutos.

Esto es lo que le da a la práctica la **velocidad** de la IA sin perder el **juicio** humano. La skill hace el trabajo mecánico; el ingeniero hace las decisiones.

### Dónde vive la doctrina

El modelo de orquestación no se improvisa por sesión — está capturado en references canónicas que las workflow skills cargan bajo demanda. Los ingenieros y autores de skills deberían saber dónde mirar:

- **`CLAUDE.md` §Orchestration Mode** — enunciado canónico a nivel proyecto de la estrategia (regla de decisión subagent-o-no, formato de briefing, protocolo de errores).
- **`agentic-qa-core/references/orchestration-doctrine.md`** — espejo cacheable cargado por subagents que necesitan la doctrina completa sin re-leer `CLAUDE.md`.
- **`agentic-qa-core/references/briefing-template.md`** — el formato de briefing de seis componentes que usa cada dispatch (Goal · Context docs · Skills to load · Exact instructions · Report format · Rules).
- **`agentic-qa-core/references/dispatch-patterns.md`** — guía de decisión para los cuatro patrones (Single, Sequential, Parallel, Background) y cuándo aplica cada uno.
- Las secciones **`## Subagent Dispatch Strategy`** dentro de cada `SKILL.md` de workflow (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development`) — tablas por etapa que declaran qué pasos delegan a subagents y con qué patrón.

Cuando una skill escribe `Use the dispatch defined in §Subagent Dispatch Strategy: Parallel`, esa línea es una abreviatura del briefing completo ensamblado a partir de las references de arriba. La doctrina es una única fuente, citada desde muchos lugares.

---

## 10. Flujo de las etapas 1–3: Inicio de sesión → Planificación → Ejecución → Reporte

La skill `sprint-testing` maneja el trabajo por ticket a lo largo de las Etapas 1, 2 y 3. Un ciclo completo comprime lo que de otro modo sería un flujo de trabajo manual de varias horas en un proceso por ticket predecible y repetible. La duración exacta depende del alcance y el riesgo, pero la práctica está diseñada para mantener el trabajo mecánico fuera de las manos del ingeniero, de modo que pueda enfocarse en el juicio.

```
  [Session Start]  →  [Stage 1]     →  [Stage 2]        →  [Stage 3]
                      Planning         Execution           Reporting
  Context + data     Risk + design    Smoke + tests      Results + bugs
       │                  │                  │                   │
       ▼                  ▼                  ▼                   ▼
 Load context       Risk triage         Smoke test           Fill ATR
 Fetch ticket       Design scenarios    UI + API + DB        File bugs
 Find test data     Create ATP          Evidence capture     Post QA comment
                    Create TCs                               Close ticket
```

### Inicio de sesión

- Traer el ticket vía `[ISSUE_TRACKER_TOOL]` (título, ACs, comentarios, artefactos enlazados).
- Explicarle la story de vuelta al usuario en inglés llano y esperar confirmación.
- Cargar el contexto del proyecto (`.context/master-test-plan.md`, `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/business/business-api-map.md`).
- Explorar el código de frontend y backend relacionado con el ticket.
- Consultar la base de datos vía `[DB_TOOL]` en busca de candidatos de datos de test (jerarquía **generar > descubrir > modificar** — nunca hardcodear).
- Crear o actualizar la carpeta PBI (`.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`).
- Configurar el entorno de automatización de browser vía la skill `playwright-cli`.

### Etapa 1 — Planning

- Correr un triage de riesgo a través de cada AC.
- Diseñar escenarios con equivalence partitioning y análisis de límites (boundary analysis).
- Identificar los datos de test requeridos y las precondiciones de entorno.
- Crear un registro de ATP en `[TMS_TOOL]`, completar el contenido de Test Analysis y enlazarlo al ticket.
- Crear registros de TC por cada escenario diseñado, enlazados al ATP y a los ACs que cubren.
- Presentar el plan al ingeniero y esperar aprobación.

### Etapa 2 — Execution

- Correr primero el smoke test como gate Go/No-Go. Si el smoke falla, parar y reportar; no gastar tiempo en testing profundo.
- Ejecutar chequeos de UI, API y DB según el plan.
- Capturar evidencia (screenshots, respuestas de API, resultados de queries de DB) en `evidence/`.
- Clasificar cualquier hallazgo como bugs, observaciones o desviaciones aceptables.

### Etapa 3 — Reporting

- Completar el registro de Test Results (ATR) en `[TMS_TOOL]` con el estado por TC.
- Registrar tickets de bug siguiendo la convención de nombres documentada dentro de las references de la skill `sprint-testing`.
- Postear un comentario de QA-done en el ticket original y transicionar el estado del tracker.

### El entregable

Al final del ciclo, cada ticket tiene: una carpeta PBI en disco, un ATP y un ATR en el TMS, TCs enlazados a ACs, evidencia capturada, bugs registrados y un rastro limpio de comentarios en el ticket origen. Nada queda sin documentar.

---

## 11. Ingeniería de Test Automation

La automatización no es el objetivo. **Automatizar los tests correctos con rigor de ingeniería** es el objetivo. Por eso la Etapa 4 (`test-documentation`) corre primero un análisis de ROI — solo los TCs manuales que protegen un riesgo de regression real se automatizan. El resultado es una suite delgada y mantenible, no un test bloat.

La Etapa 5 (`test-automation`) está estructurada como un pipeline de tres fases — Plan, Code, Review:

```
  [1] PLAN          →      [2] CODE          →      [3] REVIEW
  AI designs the           AI writes the             AI runs a quality
  implementation           test code in              checklist. Human
  plan. Human              KATA pattern.             verifies. Maximum
  approves before          Human monitors.           2 revision loops,
  any code is                                        then escalates.
  written.
```

Estas tres fases se mapean limpiamente a los dispatch patterns: **Single** (Plan — un subagent planner), **Sequential** (Code — un subagent por unidad de alcance), **Parallel** (Review — tres subagents verifiers corriendo `bun run test`, `bun run types:check` y `bun run lint:check` simultáneamente). La tabla completa vive en `test-automation/SKILL.md` §Subagent Dispatch Strategy.

### La arquitectura KATA

Los tests automatizados viven en una arquitectura de cuatro capas llamada **KATA** (Komponent Action Test Architecture). La estratificación es intencional: cada capa tiene una única responsabilidad, y cada capa puede testearse o intercambiarse de forma independiente.

```
┌────────────────────────────────────────────────────────────────┐
│  LAYER 4: TestFixture                             [injector]   │
│  Dependency injection — { api } { ui } { test } { steps }      │
│  File: tests/components/TestFixture.ts                         │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 3: Components (domain)                   [your code]    │
│  {{Domain}}Api · {{Domain}}Page · {{Domain}}Flow               │
│  Each ATC carries @atc('{{PROJECT_KEY}}-XXX-TC#')              │
│  Dirs: tests/components/api/  ·  tests/components/ui/          │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 2: ApiBase / UiBase                   [shared helpers]  │
│  HTTP helpers · Playwright helpers · Auth · Assertions         │
│  Files: tests/components/api/ApiBase.ts                        │
│         tests/components/ui/UiBase.ts                          │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│  LAYER 1: TestContext                           [foundation]   │
│  Config · Faker · Environment · Credentials · Utilities        │
│  File: tests/components/TestContext.ts                         │
└────────────────────────────────────────────────────────────────┘

        ▲ Test files orchestrate ATCs across components
```

### Tres principios portantes

**Principio 1 — ATC = flujo completo, no un solo click.**
Un Acceptance Test Case (ATC) es un escenario completo: navegar + actuar + verificar. Los ATCs son atómicos — no se llaman entre sí. Cuando se necesita una cadena reutilizable, vive en el módulo Steps. Las assertions fijas quedan dentro del ATC; las assertions a nivel test viven en el archivo de test.

**Principio 2 — el decorador `@atc` traza al TMS.**
Cada test automatizado porta un decorador `@atc('{{PROJECT_KEY}}-XXX-TC#')`. Cuando CI falla, el decorador hace posible recorrer la cadena en reversa: ATC fallido → TC del TMS → ATP → User Story → Criterio de Aceptación. La IA puede responder "¿qué requerimiento está en riesgo?" en un solo salto.

**Principio 3 — fixtures inteligentes por tipo de test.**
Los fixtures se eligen para minimizar el costo:

| Tipo de test | Fixture    | ¿Browser lanzado? |
| --------- | ---------- | ----------------- |
| Solo API  | `{ api }`  | No (lazy)         |
| Solo UI   | `{ ui }`   | Sí               |
| Híbrido   | `{ test }` | Sí               |

Un test de API puro no abre Chromium. A lo largo de cientos de runs, esto ahorra minutos por ejecución de CI y mantiene la suite rápida.

### Qué tiene permitido hacer la IA

La IA escribe primero el plan de implementación — escenarios, componentes que existen, componentes que hay que crear, datos de test requeridos. El plan se aprueba **antes** de escribir una sola línea de código. Luego se genera el código siguiendo el patrón KATA. Review corre un checklist de calidad (naming, higiene de locators, elección de fixture, ubicación de assertions, presencia del decorador `@atc`). Dos loops de revisión como máximo, y luego el trabajo escala al ingeniero. Este tope evita que la IA se atasque moliendo un diseño malo.

Los detalles completos viven en las propias references de la skill:

- `.claude/skills/test-automation/references/`

---

## 12. El toolkit de IA: skills, commands, integraciones

La práctica usa tres tipos complementarios de capacidad de IA:

- Las **Skills** se auto-activan por intención (una frase del usuario coincide con la description de la skill).
- Los **Commands** se invocan explícitamente con `/<name>` para utilidades de un solo disparo.
- Las **Integraciones** son los sistemas en vivo que la IA puede consultar y sobre los que puede actuar. Se dividen en dos tipos: **MCPs** (el puente externo) y **CLIs** (herramientas de línea de comandos first-party construidas dentro de este repo). Ambos exponen los mismos sistemas — los equipos eligen CLI-first cuando está disponible, MCP como fallback.

### Skills (se auto-activan por intención)

| Skill                 | Etapa        | Cuándo se dispara                                                              |
| --------------------- | ------------ | ------------------------------------------------------------------------------ |
| `agentic-qa-core`      | Foundation   | (auto, citada por otras skills) — host pasivo de references para briefing template, dispatch patterns, orchestration doctrine, estrategia de composición de skills |
| `project-discovery`   | Onboarding   | "set up this project", "onboard this repo", "generate business-data-map", "discover the architecture" |
| `shift-left-testing`  | 0 (pre-sprint) | "shift-left these stories", "groom the backlog", "pre-sprint QA", "refine these N stories", lote de Story IDs en Backlog/Shift-Left QA/Estimation/Ready For Dev |
| `sprint-testing`      | 1 · 2 · 3    | "test {{PROJECT_KEY}}-XXX", "process sprint N", "retest bug", "QA this story", "mode yolo" |
| `test-documentation`  | 4            | "document tests", "ROI analysis", "Candidate vs Manual", "fix traceability"    |
| `test-automation`     | 5            | "automate TC", "write E2E test", "KATA component", "review test code"          |
| `regression-testing`  | 6            | "run regression", "quality report", "GO/NO-GO decision", "analyze failures"    |
| `acli`                | cualquiera   | Atlassian CLI para Jira desde la terminal — crear/editar/transicionar work-items, operaciones bulk, scripting de Jira |
| `xray-cli`            | cualquiera   | Operaciones de CLI del TMS — crear tests, gestionar executions, importar resultados, backup |
| `playwright-cli`      | cualquiera   | Automatización de browser — screenshots, navegación, llenado de formularios, tracing, mocking |

Todas las definiciones de skill viven bajo `.claude/skills/<name>/SKILL.md`, con references detalladas bajo `.claude/skills/<name>/references/`.

### Commands (`/<name>` — utilidad bajo demanda)

Los commands son prompts deterministas y de propósito único invocados explícitamente. A diferencia de las skills, no se auto-activan.

| Command                       | Propósito                                                |
| ----------------------------- | -------------------------------------------------------- |
| `/adapt-framework`            | Adaptar la arquitectura de test KATA de este boilerplate a un proyecto ya reverse-engineered por `/project-discovery` (Plan -> Approval -> Implement) |
| `/sync-ai-memory`             | Sincronizar todos los documentos AI-críticos del repo (README.md, CLAUDE.md, INSTALLER.md, CONTEXT.md, docs/*.md, docs/onboarding.html) para que reflejen consistentemente el estado actual de `.context/` y `package.json` |
| `/master-test-plan`           | Generar o refrescar `.context/master-test-plan.md` — qué testear y por qué, derivado de los artefactos de discovery |
| `/business-data-map`          | Generar o refrescar `.context/business/business-data-map.md` (entidades, flujos, state machines) |
| `/business-feature-map`       | Generar o refrescar `.context/business/business-feature-map.md` (catálogo de features, matriz CRUD, integraciones) |
| `/business-api-map`           | Generar o refrescar `.context/business/business-api-map.md` (modelo de auth, endpoints críticos, arquitectura) |
| `/fix-traceability`           | Reparar enlaces de trazabilidad rotos del TMS (US → ATP → ATR → TC) |
| `/break-down-tests`           | Desglose en inglés llano de los tests automatizados de un módulo / spec dado |

Todas las definiciones de command viven bajo `.claude/commands/<name>.md`.

### Integraciones (acceso a sistemas en vivo)

Los MCPs y CLIs son la forma en que la IA habla con sistemas reales. Sin ellos, la IA solo puede razonar contra texto; con ellos, la IA puede consultar, actuar y verificar.

| Integración        | Proveedor por defecto | Uso                                                   |
| ------------------ | -------------------- | ----------------------------------------------------- |
| `[TMS_TOOL]`       | skill `xray-cli`     | Crear/listar tests, gestionar executions, importar resultados, backup del proyecto |
| `[ISSUE_TRACKER_TOOL]` | Atlassian CLI    | Traer tickets, comentarios, transiciones              |
| `[DB_TOOL]`        | DBHub MCP            | Queries SQL — explorar schema, descubrir y verificar datos de test |
| `[API_TOOL]`       | OpenAPI MCP          | Exploración de contratos, descubrimiento de endpoints |
| `[AUTOMATION_TOOL]`| skill `playwright-cli` | Automatización de browser — screenshots, tracing, mocking |
| `context7` MCP     | Ecosistema Anthropic | Documentación oficial de librerías                     |
| `tavily` MCP       | Ecosistema Anthropic | Búsqueda web de soluciones de la comunidad            |

Cada `[TAG_TOOL]` resuelve vía la tabla de Tool Resolution en `CLAUDE.md`. Cambiá la fila para cambiar el backend — las skills siguen llamando al mismo tag.

**Regla de decisión:**

- `context7` — "cómo usar X" (docs oficiales).
- `tavily` — "cómo resolver X" (soluciones de la comunidad).

Los tokens de autenticación para MCPs de larga duración expiran a su propio ritmo. Los scripts de refresco viven bajo `cli/` y `scripts/` (este último aloja utilidades foundation escritas por `agentic-qa-core` como `agents-setup.ts`, `lint-vars.ts`, `sync-jira-fields.ts` y `check-jira-setup.ts`) y están documentados en la guía de setup de cada MCP (`docs/setup/`).

---

## 13. El quality gate: GO / CAUTION / NO-GO

Cada release candidate pasa por el mismo gate. No hay decisión de despacho tipo "creo que está bien" — el veredicto es basado en datos, propiedad de la skill `regression-testing` (Etapa 6).

### Los tres veredictos

| Veredicto   | Pass rate | Fallos críticos   | Acción                            |
| ----------- | --------- | ----------------- | --------------------------------- |
| **GO**      | ≥ 95%     | 0                 | Despachar.                        |
| **CAUTION** | 85–95%    | Investigar        | Release condicional tras revisión. |
| **NO-GO**   | < 85%     | Cualquier crítico | Bloquear. Corregir antes de despachar. |

### Clasificación de fallos

Cuando un test falla, la IA no solo reporta "fallo". Clasifica el fallo en una de cinco categorías:

- **Regression** — un defecto real introducido en el release candidate.
- **Flaky** — el test es no determinista; corregí el test, no el código.
- **Known** — el fallo coincide con un bug previamente registrado que aún está en progreso.
- **Environment** — el fallo está causado por la infraestructura, no el código (DB caída, token expirado, glitch de red).
- **New Test** — un test recién agregado que aún no se ha estabilizado.

La clasificación decide el veredicto de release. Cinco tests flaky no bloquean un release; una regression real sí.

### Los artefactos

- GitHub Actions corre la suite de regression cada noche y bajo demanda (`.github/workflows/`).
- Allure genera el dashboard del reporte.
- La skill emite una release note con el veredicto, el pass rate, los fallos críticos (si los hay) y el resumen de clasificación.

---

## 14. Anatomía de una sesión de testing

Para ilustrar cómo encajan las piezas, acá está cómo se ve el recorrido de un ticket típico de principio a fin.

Considerá un ticket `{{PROJECT_KEY}}-XXX` con un puñado de criterios de aceptación que cubren una feature con impacto en ingresos:

1. **Inicio de sesión.** La skill `sprint-testing` carga el contexto del proyecto, abre el ticket vía `[ISSUE_TRACKER_TOOL]`, explora los code paths de frontend (`{{FRONTEND_REPO}}`) y backend (`{{BACKEND_REPO}}`) relacionados con la feature, consulta la base de datos vía `[DB_TOOL]` en busca de candidatos de datos de test, y crea la carpeta PBI del ticket.
2. **Etapa 1 — Planning.** Triage de riesgo a través de cada AC. Se diseñan test cases por AC usando equivalence partitioning y análisis de límites (boundary analysis). Se crea un ATP en `[TMS_TOOL]` y los TCs se enlazan al ATP y a los ACs que cubren. El plan se presenta al ingeniero para aprobación.
3. **Etapa 2 — Execution.** El smoke test corre primero como gate Go/No-Go. Si pasa, la skill ejecuta los chequeos planificados de UI, API y DB, capturando evidencia en la carpeta `evidence/` del PBI.
4. **Etapa 3 — Reporting.** El ATR se completa en `[TMS_TOOL]` con el estado por TC. Cualquier bug se registra siguiendo la convención de nombres. Se postea un comentario de QA-done en el ticket y se transiciona el estado del tracker.
5. **Verificación de trazabilidad.** El command `/fix-traceability` (o la operación de trace de la skill `xray-cli`) recorre la cadena y confirma que cada enlace — Story → ATP → ATR → TCs — está presente y correcto.

Cada artefacto vive en el TMS y en la carpeta PBI en disco. La IA produce el plan, corre los tests, registra los resultados y verifica la trazabilidad. El ingeniero revisa y aprueba en cada checkpoint.

---

## 15. Métricas: plantilla de instrumentación

Atrapar bugs es lo básico. El siguiente paso es convertir el flujo de bugs en insight de ingeniería — para que el equipo pueda decidir dónde invertir esfuerzo en tech debt, qué integraciones son frágiles, y si la revisión shift-left de ACs realmente está rindiendo.

Esta sección es un **patrón de instrumentación recomendado**, no un pipeline que se despacha encendido. Los equipos lo adoptan cuando están listos para medir la calidad con tanto rigor como la entregan.

### Instrumentación (inputs)

Tres custom fields en cada ticket de bug:

| Campo                  | Propósito                                           | Ejemplos                                                  |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Component Affected** | Qué módulo golpeó el bug                            | Cualquier nombre de módulo de `PBI/epics/EPIC-<KEY>-<slug>/` (Module = Epic) |
| **Root Cause**         | Por qué existe el bug                               | AC Gap · Code · Integration · Data · Edge Case · Regression |
| **Upstream Ticket**    | Qué feature introdujo el bug                        | La user story en cuyo release apareció el defecto         |

### Insight de ingeniería (outputs)

Cuatro métricas emergen una vez que la instrumentación está en su lugar:

| Métrica                             | Pregunta de negocio respondida                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| **Defect density by component**     | ¿Qué módulos son los más frágiles? ¿Dónde debería aterrizar la inversión en tech debt?       |
| **Root cause distribution**         | ¿Dónde se está fugando la calidad? ¿Gaps de ACs, integraciones o código?                      |
| **First-deploy AC compliance rate** | ¿Qué porcentaje de features cumplen sus ACs en el primer deploy versus requerir iteración?    |
| **Bug escape rate**                 | ¿Cuántos bugs pasan el quality gate de QA y llegan a producción? (El número honesto antes-después.) |

Tratá estas como un punto de partida, no un canon. Agregá campos que se mapeen al modelo de riesgo de tu equipo, descartá campos que no se ganan su lugar.

---

## 16. Resumen de lo que entrega la práctica

### Qué se despacha en este repositorio

- **Una foundation skill (`agentic-qa-core`)** — bootstrapea `CLAUDE.md`, `.agents/project.yaml` y los scripts `agents-*`; aloja la orchestration doctrine canónica, el briefing template y los dispatch patterns citados por cada workflow skill.
- **Un roster de skills de IA conscientes de la etapa** — auto-activadas por la intención del usuario, orquestadas con checkpoints de human-in-the-loop. Cada etapa del pipeline tiene su propia skill. El roster actual está enumerado en la Sección 12.
- **Una librería de commands de utilidad** — deterministas, de propósito único, invocados con `/<name>`. La librería actual está enumerada en la Sección 12.
- **Integraciones con sistemas en vivo** — MCPs para la base de datos, API, TMS y documentación de librerías, más CLIs first-party para operaciones de TMS y automatización de browser. El conjunto actual está enumerado en la Sección 12.
- **Una capa de contexto estructurada** — conocimiento a nivel proyecto, módulo y ticket, en disco y bajo control de versiones. Contiene reglas de negocio, documentación de API, memoria por ticket y guidelines del equipo.
- **Integración de TMS con trazabilidad** — ATPs, ATRs, TCs enlazados a user stories, con verificación programática de trazabilidad vía `/fix-traceability` y la skill `xray-cli`.
- **Un scaffold de suite de test automatizado KATA** — arquitectura de cuatro capas, decoradores `@atc` que trazan cada test a un TC del TMS, fixtures inteligentes, alcance curado por ROI.
- **Un pipeline de CI/CD** — workflows de build, smoke, sanity y regression en GitHub Actions.
- **Un quality gate basado en datos** — GO / CAUTION / NO-GO, con fallos clasificados por la IA.

### La afirmación central

Una práctica de QA que testea más rápido, documenta todo, y le dice al equipo — con datos — cuándo es seguro despachar. Construida sobre la premisa de que la IA maneja el trabajo mecánico, y el ingeniero maneja las decisiones.

El resto es ejecución.

---

> **Estás acá**: análisis profundo de metodología de QA (agentic quality engineering). **Tiempo de lectura**: 45 min. **Siguiente**: [`../CONTEXT.md`](../CONTEXT.md) para ver cómo este repo la aplica.

**Última actualización**: 2026-04-26

**Ver también**:
- `CLAUDE.md` — memoria canónica del proyecto, Tool Resolution y ruteo de skills (espejada en `CLAUDE.md`)
- `CONTEXT.md` — estrategia detrás de la división de contexto en tres niveles (raíz del repo)
- `docs/methodology/IQL-methodology.md` — análisis profundo de la metodología por fases
- `.claude/skills/agentic-qa-core/SKILL.md` — internals de la foundation skill (bootstrap + references compartidas)
- `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md` — orchestration doctrine canónica citada por cada workflow skill
- `.claude/skills/acli/SKILL.md` — integración de Atlassian CLI para operaciones sobre work-items de Jira
- `.claude/skills/test-automation/references/` — arquitectura KATA, decorador `@atc` y cadena de trazabilidad
- `.context/README.md` — layout de contexto canónico
- `.claude/skills/project-discovery/SKILL.md` — internals de la skill de onboarding
- `.claude/skills/sprint-testing/SKILL.md` — internals de la skill de Etapas 1–3
- `.claude/skills/test-documentation/SKILL.md` — internals de la skill de Etapa 4
- `.claude/skills/test-automation/SKILL.md` — internals de la skill de Etapa 5
- `.claude/skills/regression-testing/SKILL.md` — internals de la skill de Etapa 6
