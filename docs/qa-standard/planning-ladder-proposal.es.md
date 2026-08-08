# QA Planning Ladder — Propuesta de nomenclatura (RATIFICADA, pendiente de implementación)

> _Traducción al español de [planning-ladder-proposal.md](planning-ladder-proposal.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Estado**: las decisiones núcleo **RATIFICADAS** por el usuario (2026-06-26) — listas para propagar a los
> `references/*.md` de las skills, `.agents/project.yaml` (`qa.qa_epics`), el sync script, la
> doctrina de traceability y el deck del Naming Codex. Implementación aún no iniciada.
>
> **Decisiones ratificadas**: (A) MTP Epic = **`QA Master Test Plan`** · (B) el Test Set mantiene **`Validate`**
> → `TS: {scope}: Validate {feature}` · (C) gramática de prefijo por acrónimo `{ACRONYM}: {scope}: {desc}`
> **aprobada** como el estándar único · (D) **items-over-fields** confirmado (Test Plan / Test
> Execution issues por excelencia; el Story custom field = solo fallback) · (E) scope-id de sprint =
> **`Sprint#{N}`** (ej. `Sprint#30`); término del título STR = `Regression Testing` ("Sprint" viene del
> scope-id, sin redundancia) → `STR: Sprint#30: Regression Testing`.
>
> **Alcance**: la jerarquía de test-PLANNING (MTP / FTP / STP / ATP) y sus RUNNERS
> (FTR / STR / ATR), los cuatro Epics de QA-process que los contienen, la regla de Jira-item-sobre-
> custom-field, más el naming de Test Set y Precondition. El naming de test-CASE
> (`should …`), `@atc`, components, tags, branches — ya ratificados, ver el Naming Codex.

---

## 0. Objetivos de diseño (la justificación, por adelantado)

1. **Una gramática, cada altitud.** Hoy el mismo work type "Test Plan" de Jira se titula
   de tres formas distintas (`Test Plan: PROJ-123`, `QA: TestPlan: Regression S50`,
   `<Strategy>: <ID>: <sum>`). Un lector/JQL no puede distinguir la altitud por el título. La
   propuesta le da a cada Plan y Run un **prefijo de acrónimo de 3 letras** para que la altitud + plan-vs-run
   sea legible en el primer token y empareje Plan↔Run visualmente.
2. **Items, no fields, por excelencia.** Un Jira issue dedicado da issue-links reales,
   un ciclo de vida de status independiente, historial de runs y cero bloat de Story-field. Los custom fields
   en la Story se vuelven un *fallback degradado*, usado solo cuando la instancia carece del work type.
3. **Todo tiene exactamente un hogar + cross-links (3-axis, extendido).** El repo ya
   parenta las quality issues a un *QA-process Epic* (no a un product Epic) y lleva el origen vía
   un issue-link y el área de producto vía components. Extendemos ese modelo probado de 2
   governance Epics a 4 — para que Plans, Runs, Test Cases, Artifacts y Defects tengan cada uno un
   bucket, y la traceability quede en el eje de links.
4. **El "testing term" embebido mapea a la actividad.** FTR = *Feature Testing*,
   STR = *Sprint Regression Testing*, ATR = *Story Testing* — el título del run declara qué
   actividad de sprint-testing lo produjo.
5. **Agnóstico de Xray.** Test Plan / Test Execution / Test Set / Precondition son work types nativos de Jira
   en el workspace UPEX esté o no instalado Xray. Por eso el estándar
   no bifurca por modality para la *estructura* — solo el motor de run/coverage de Xray es opcional.

---

## 1. Los cuatro Epics de QA-process (extiende el modelo 3-axis existente)

El repo ya define dos Epics de QA-process en `.agents/project.yaml` bajo `qa.qa_epics`:
**QA Defect Management** y **QA Test Repository**. Esta propuesta agrega dos más para que cada
tipo de artefacto QA tenga un governance Epic dedicado.

| Epic de QA-process | `qa.qa_epics.<key>` | Contiene (child work types) | Estado |
|---|---|---|---|
| **QA Master Test Plan** (el MTP) | `master_test_plan_epic` | cada **Test Plan** (FTP · STP · ATP) | NEW |
| **QA Test Repository** | `test_repository_epic` | cada **Test** (Test Case) | existe |
| **QA Test Artifacts** | `test_artifacts_epic` | cada **Test Execution** (FTR · STR · ATR), **Precondition**, **Test Set** | NEW |
| **QA Defect Management** | `defect_epic` | cada **Bug / Defect / Improvement** | existe |

**El prefijo `QA ` es deliberado** (convención existente): un lector que escanea la lista de Epics
ve `QA …` y sabe que es un Epic de *process*, no un product feature. El MTP Epic por lo tanto
se lee **`QA Master Test Plan`** por consistencia de familia (la intención del usuario — "Master Test Plan
+ QA Engineering hub" — se captura en la *description* del Epic, ver §1.1). Los cuatro están
**excluidos del módulo Components** (buckets de process, nunca un product component seleccionable).

> **Decisión A — RATIFICADA**: nombre del MTP Epic = **`QA Master Test Plan`** (mantiene la familia `QA `).
> La intención "QA Engineering hub + repo QA oficial" vive en la description del Epic (§1.1).

### 1.1 El MTP Epic — rol especial

`QA Master Test Plan` es **a la vez** un Epic **y** el archivo local `.context/master-test-plan.md`
(se espejan mutuamente). El Epic NO es un work type Test Plan — es el Epic paraguas
cuyos **hijos son cada Test Plan del proyecto** (FTP/STP/ATP). Su description contiene:

- la master test strategy (mismo contenido que `.context/master-test-plan.md`: qué testear, por qué,
  ranking de riesgo, puntero al regression Epic, SLOs de pass-rate);
- un puntero al **repositorio oficial del equipo QA** (este clone del boilerplate — el hogar de
  Agentic Testing + Test Automation del proyecto).

Está **cross-linkeado a sus tres Epics QA hermanos** (`relates to`): QA Test Repository,
QA Test Artifacts, QA Defect Management — para que los cuatro formen un cluster de QA-governance navegable.

### 1.2 Los tres ejes por artefacto (modelo sin cambios, buckets extendidos)

```
parent / Epic Link  ->  QA-PROCESS EPIC   (qué QA bucket trackea esto)
issue link          ->  SCOPE under test  (Story / feature-Epic / Sprint — traceability)
components          ->  PRODUCT module     (qué parte del producto toca)
```

| Artefacto | Work type | Parent Epic (eje 1) | Issue-link / scope (eje 2) |
|---|---|---|---|
| MTP | **Epic** | — (tope del cluster QA) | `relates to` los 3 Epics QA hermanos |
| FTP | Test Plan | QA Master Test Plan | `tests` el **feature Epic** de producto |
| STP | Test Plan | QA Master Test Plan | `relates to` el **Sprint** (+ regression scope) |
| ATP | Test Plan | QA Master Test Plan | `tests` la **User Story** |
| FTR | Test Execution | QA Test Artifacts | `is tested by` feature Epic · `testPlan` → FTP |
| STR | Test Execution | QA Test Artifacts | `relates to` Sprint · `testPlan` → STP |
| ATR | Test Execution | QA Test Artifacts | `is tested by` Story · `testPlan` → ATP |
| Test Set | Test Set | QA Test Artifacts | agrupa Tests por feature/module |
| Precondition | Precondition | QA Test Artifacts | `relates to` los Tests que prepara |
| Test (TC) | Test | QA Test Repository | ATP `designs` · ATR `executes` |
| Bug/Defect/Improvement | Bug/… | QA Defect Management | `is caused by` / `blocks` la source Story |

**Roll-up links** opcionales para agregación de coverage: ATP `is part of` FTP `is part of` STP.
El parent queda como el MTP Epic para todos los Plans sin importar el roll-up.

---

## 2. El ladder — Plan + Runner por altitud

| Altitud | Plan | Runner | Jira work type | Cuándo / quién | Cardinalidad |
|---|---|---|---|---|---|
| **Product** | **MTP** Master Test Plan | — | **Epic** (+ archivo local) | bootstrap una vez; refrescar vía `/master-test-plan` | 1 por proyecto |
| **Feature / Epic** | **FTP** Feature Test Plan | **FTR** Feature Test Results | Test Plan → Test Execution | `feature-test-planning` (sprint-testing) cuando un feature entra a testing | FTP 1 por feature · FTR ≥1 por sprint ("Feature Testing") |
| **Sprint** | **STP** Sprint Test Plan | **STR** Sprint Test Results | Test Plan → Test Execution | regression-testing al cierre del sprint | 1 por sprint (término: "Regression Testing"; "Sprint" viene del scope-id `Sprint#{N}`) |
| **User Story** | **ATP** Acceptance Test Plan | **ATR** Acceptance Test Results | Test Plan → Test Execution | sprint-testing S1 (ATP) / S3 (ATR) | ATP 1 por Story · ATR 1 run ("Story Testing") |

---

## 3. La gramática de título unificada

```
{ACRONYM}: {scope-id}: {descriptor}
```

- **ACRONYM** — `MTP` (epic) · `FTP` · `STP` · `ATP` (plans) · `FTR` · `STR` · `ATR` (runs).
- **scope-id** — la key de lo que está bajo test en esa altitud (feature-Epic key, `Sprint N`, Story key).
- **descriptor** — legible por humanos, embebe el testing-term donde el usuario lo requiere.

| Artefacto | Jira type | Patrón de título | Ejemplo |
|---|---|---|---|
| **MTP** | Epic | `QA Master Test Plan` (singleton) | `QA Master Test Plan` |
| **FTP** | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| **FTR** | Test Execution | `FTR: {EPIC-KEY}: Feature Testing — {feature}{ · run N}` | `FTR: PROJ-42: Feature Testing — Checkout · run 2` |
| **STP** | Test Plan | `STP: Sprint#{N}: Regression` | `STP: Sprint#30: Regression` |
| **STR** | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#30: Regression Testing` |
| **ATP** | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| **ATR** | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| **ATP DRAFT** (shift-left) | Test Plan | `ATP: {STORY-KEY}: {story title} (Shift-Left DRAFT)` | `ATP: PROJ-123: Apply discount at checkout (Shift-Left DRAFT)` |

### 3.1 Artefactos de soporte (epic QA Test Artifacts)

| Artefacto | Jira type | Patrón de título | Ejemplo | Notas |
|---|---|---|---|---|
| **Test Set** | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature/module}` | `TS: PROJ-42: Validate Checkout` | agrupa TCs por feature/module; opcional pero las skills deben respetarlo + nombrarlo así |
| **Precondition** | Precondition | `PRC: {COMPONENT}: {required state}` | `PRC: Payment: Authenticated user with a saved card` | **título = el state**; **contenido = los setup steps** (se mantienen distintos) |

> **Decisión B — RATIFICADA**: el Test Set **mantiene `Validate`** → `TS: {scope}: Validate {feature}`.
> `Validate` por lo tanto queda como la palabra de agrupamiento TANTO en la capa Jira Test Set como en el
> `describe()` del código — totalmente consistente con la ley "Validate = group" del Naming Codex. El prefijo
> `TS:` agrega la señal de work-type/altitud encima.

---

## 4. Items sobre custom fields (cambio de comportamiento estándar)

**Por excelencia, cada Plan y cada Run es un Jira issue real** — un item **Test Plan** para
FTP/STP/ATP y un item **Test Execution** para FTR/STR/ATR — en AMBAS modalities (son
work types nativos de Jira en el workspace UPEX, independientes de Xray).

**Fallback (solo modo degradado):** ATP/ATR PUEDEN vivir como custom fields en la User Story
**solo cuando** los work types Test Plan / Test Execution no están disponibles en la instancia y
por lo tanto no se pueden crear/linkear. Apenas los items existen, ellos son la fuente única de
verdad y los fields no se usan.

**Por qué:** los items dedicados dan issue-links reales (Plan→scope, Run→Plan, Run→TC), un
ciclo de vida de status independiente e historial de runs, y evitan el bloat de Story-field. También colapsa la
división estructural `jira-xray` vs `jira-native` — ambos crean items; Xray solo agrega el
motor de run/coverage encima.

---

## 5. Qué cambia vs hoy (mapa de migración)

| Hoy | Se vuelve | Por qué |
|---|---|---|
| `Test Plan: PROJ-123` (ATP, a menudo un Story field) | `ATP: PROJ-123: {title}` (item Test Plan; field = fallback) | gramática de acrónimo + items-first |
| `Test Results: PROJ-123` (ATR field) | `ATR: PROJ-123: Story Testing` (item Test Execution) | gramática de acrónimo + items-first + término de actividad |
| `QA: TestPlan: Regression S50` (strategy plan) | `STP: Sprint#30: Regression` | pliega el "strategy plan" dentro de la altitud Sprint |
| `Regression: TP-50: Sprint 50 Regression` (exec) | `STR: Sprint#30: Regression Testing` | gramática de acrónimo; "Sprint" viene del scope-id |
| `Sanity: GX-101: Validate credit card payment` (Test Set) | `TS: GX-101: Validate credit card payment` | los Test Sets agrupan por feature/module, no por strategy; el prefijo `TS:` reemplaza la palabra de strategy |
| `Checkout: Payment: PRC: For credit card flow` | `PRC: Payment: Authenticated user with a saved card` | el título declara el *state*, no "For <flow>" |
| (nada) FTP/FTR/STP/STR | nuevos artefactos en la altitud Feature & Sprint | llena los gaps del ladder |
| `qa.qa_epics` = 2 epics | 4 epics (`+ master_test_plan_epic`, `+ test_artifacts_epic`) | cada tipo de artefacto tiene un hogar |

---

## 6. Superficies impactadas (para el pase de implementación, post-ratificación)

- `.agents/project.yaml` — agregar `qa.qa_epics.master_test_plan_epic` + `test_artifacts_epic`.
- `agentic-qa-core/references/defect-management-doctrine.md` — la Parte 4 crece de 2→4 QA epics.
- `agentic-qa-core/references/traceability-linking.md` — links de item Plan/Run, roll-up edges.
- `test-documentation/references/tms-conventions.md` · `tms-architecture.md` · `jira-test-management.md` · `xray-platform.md` — naming + items-over-fields.
- `sprint-testing/references/acceptance-test-planning.md` · `reporting-templates.md` · `SKILL.md` — items ATP/ATR, FTP/FTR (Feature Testing), término Story Testing.
- `shift-left-testing/references/atp-draft-template.md` · `handoff-protocol.md` — título ATP DRAFT.
- `regression-testing/SKILL.md` — STP/STR (Sprint Regression Testing).
- `scripts/sync-jira-issues.ts` — Plan/Run como items; precedencia de field-fallback.
- `.claude/skills/agentic-qa-core/naming-conventions.es.html` — nueva capa/slide "Planning Ladder".
- `.agents/jira-required.yaml` / `jira-fields.json` — config de work-type Test Plan / Test Execution / Test Set / Precondition.

---

## 7. Log de decisiones

- **A — RATIFICADA** — nombre del MTP Epic = `QA Master Test Plan` (mantiene la familia de process-epic `QA `).
- **B — RATIFICADA** — el Test Set mantiene `Validate` → `TS: {scope}: Validate {feature}`.
- **C — RATIFICADA** — la gramática de prefijo por acrónimo `{ACRONYM}: {scope}: {desc}` es el estándar único para todos los Plans/Runs.
- **D — RATIFICADA** — items-over-fields es el default duro; el Story custom field = solo fallback.
- **E — RATIFICADA** — scope-id de sprint = `Sprint#{N}` (ej. `Sprint#30`). Término del título STR = `Regression Testing` (no "Sprint Regression Testing" — "Sprint" ya está en el scope-id). → `STP: Sprint#30: Regression` / `STR: Sprint#30: Regression Testing`.
