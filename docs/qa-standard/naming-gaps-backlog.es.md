# Naming Gaps — IMPLEMENTED (los 12 ratificados + documentados)

> _Traducción al español de [naming-gaps-backlog.md](naming-gaps-backlog.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Estado**: las 12 convenciones **RATIFICADAS e IMPLEMENTADAS** (2026-06-26). Cada una está escrita en
> el `references/*.md` de su skill dueña y reflejada en el deck del Naming Codex (EN + ES). REGISTRY
> regenerado. Roll-out solo de documentación — sin nuevos scripts/scaffolds/reglas de lint (esos se declinaron en
> favor de documentación de bajo riesgo; el enforcement de lint queda como un pase futuro opcional).
>
> **Deltas de ratificación vs las propuestas originales** (decididos en la implementación):
> - **Gap 4 (ADR)** — asignación manual vía el Index del README (`max(NNNN)+1`); el script `bun run adr:next`
>   NO se construyó.
> - **Gap 8 (test-execution folders)** — se documentó la convención de sync EXISTENTE
>   `test-executions/{TESTEXEC|RETESTEXEC}-{KEY}-{slug}.md` (NO la rechazada `{EXEC-KEY}-{ts}/`).
> - **Gap 9 (nested defect files)** — se documentó la convención de sync EXISTENTE
>   `defects/DEFECT-{KEY}-{slug}.md` (NO la rechazada `bug.md + evidence/ + related-tests/`).
> - **Gap 10 (DataFactory)** — naming documentado en `kata-architecture.md`; los stub TS files NO se
>   scaffoldearon (eso es una tarea de `/framework-development`).

| # | Gap | Convención aprobada | Superficie dueña |
|---|---|---|---|
| 1 | Test-data files | `{resource}-{variant}.json` → `users-valid.json`, `orders-boundary.json` | `test-automation/references/automation-standards.md` (tests/data) |
| 2 | Evidence / screenshots | `{KEY}-step{NN}-{action}.png` → `UPEX-101-step3-error-shown.png` | `sprint-testing/references/reporting-templates.md` (evidence/) |
| 3 | Mock / stub responses | `tests/data/mocks/{endpoint}/{method}.{status}.json` → `auth/login/200.json` | `test-automation/references` (mocking) |
| 4 | ADR file numbering | `ADR-{NNNN}-{slug}.md` + un preasignador de número `bun run adr:next` | `.context/ADR/README.md` · `agentic-qa-core/references/adr-doctrine.md` |
| 5 | Env identifiers | `local · qa · staging · production` (lowercase, sin abreviaturas) | `.agents/project.yaml` `environments` · CLAUDE.md §7 |
| 6 | Test module folders | `{domain-plural}/` kebab-case → `orders/`, `user-management/` | `test-automation/references/automation-standards.md` (tests/e2e, tests/integration) |
| 7 | Allure suite labels | derivar del Playwright tag (`@smoke`/`@regression`/…) — fuente única, sin duplicación | `regression-testing/SKILL.md` · `test-automation` (tags) |
| 8 | Test-execution folders | `test-executions/{EXEC-KEY}-{ts}/` → `PROJ-555-20260626T1430Z/` | CLAUDE.md §9 PBI tree · `scripts/sync-jira-issues.ts` |
| 9 | Nested defect files | espejo del layout de Story: `bug.md` + `evidence/` + `related-tests/` | CLAUDE.md §9 · `scripts/sync-jira-issues.ts` |
| 10 | Data factory / types | `DataFactory.ts` · `types.ts` · `constants.ts` bajo `tests/data/` | `test-automation/references/kata-architecture.md` |
| 11 | Gherkin variables | `{snake_case}` → `{user_id}`, `{order_amount}` | `test-documentation/references/tms-conventions.md` (Gherkin) |
| 12 | Blocked-test marker | tag `@blocked:{BUG-KEY}` + `test.fail('Blocked by {BUG-KEY}')` | `test-automation/references/planning-playbook.md` · `regression-testing` (GO/NO-GO filter) |

## Batching sugerido (cuando se desbloquee)

- **Fácil / ya implícito** (ratificar casi gratis): 5 (envs), 6 (module folders), 11 (Gherkin vars), 12 (blocked marker).
- **Data & mocks**: 1, 3, 10.
- **Execution & defect folders**: 8, 9 — tocan el sync script + PBI tree (hacer junto con el trabajo de items-over-fields del ladder).
- **Infra / reporting**: 4 (ADR), 7 (Allure).

## Nota de dependencia cruzada

Los gaps **8** y **9** (test-execution folders, nested defect files) se superponen con el trabajo del
planning-ladder (los Plans/Runs se vuelven Jira items; el sync script materializa sus folders). Secuencialos
**junto con** los cambios del `scripts/sync-jira-issues.ts` del ladder, no antes.
