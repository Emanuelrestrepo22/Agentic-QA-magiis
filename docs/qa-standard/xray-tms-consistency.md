# Convención de consistencia TMS en Xray (release-level)

> Origen: retro de la release **17080 / v1.72.6** (primera iteración del TMS).
> Se detectó: artefactos de prueba sin `fixVersion`, Tests sin linkeo a la issue,
> una ATR de regresión vacía, granularidad ATP/ATR asimétrica y **dos nombres de
> fixVersion para la misma release** (`17080` y `v1.72.6 Web`).
> Esta convención define el estado consistente y el **gate** que lo hace cumplir.

## Modelo objetivo (híbrido)

Cada Test case de Xray debe cumplir los 3 eslabones:

1. **Dentro de la ejecución** — el Test vive en un Test Execution (ATR) con su run.
2. **Conectado a la issue** — linkeado al requerimiento/bug que valida (`tests` / `is tested by`).
3. **Conectado a la automatización** *(si es automatizable)* — el spec declara la key del Test y su resultado se importa desde CI.

Dos modos coexisten:

| Modo | Test type | Ejecución | Cuándo |
|---|---|---|---|
| **Manual + evidencia** | `Manual` | QA corre y adjunta evidencia | Casos no automatizables o aún no automatizados |
| **Automatizado (CI-import)** | `Generic` / `Cucumber` | Runs importados por `bun xray import` | Casos con spec en repos hijos |

Regla: una feature no automatizada **no rompe consistencia** si cumple eslabones 1 y 2.

## Reglas obligatorias

### R1 — `fixVersion` en todo artefacto
Todo `Xray Test`, `Test Plan` (ATP) y `Test Execution` (ATR) lleva la `fixVersion`
de la release desde su creación. Sin esto el artefacto es **invisible en el board
de release** → la release "parece" sin QA.

### R2 — Un solo nombre de fixVersion por release
Prohibido convivir alias (`17080` **y** `v1.72.6 Web`). Se elige **uno** canónico y
se aplica a issues **y** artefactos. Si ya existen alias, consolidar antes de cerrar.

### R3 — Linkeo Test ↔ issue
Cada issue funcional (Historia/Error/Subtarea) de la release tiene **≥1 Test linkeado**.
Cada Test apunta a la issue que valida. Es el primer salto de la trazabilidad
requerimiento → test → ejecución → bug.

### R4 — Granularidad ATP/ATR consistente
- **1 ATP por issue** (no agrupar varios bugs en un ATP). Si un ATP cubre back+front,
  se divide en 2 ATP (uno por issue/capa).
- **1 ATR por ATP y por entorno**. Un mismo ATP puede tener N ATR (por entorno o
  ronda), pero la relación por defecto es 1:1 dentro de un mismo entorno.
- La regresión de release usa un **ATP de regresión standing** + su **RTR**; no queda
  huérfana de plan.

### R5 — Ninguna ATR vacía
Un `Test Execution` con **0 runs** es un artefacto hueco. Un RTR (GO/NO-GO) vacío
**invalida la decisión de release**. O se le cargan runs, o se documenta y cierra
como `N/A` — nunca se deja como contenedor vacío.

### R6 — Runs terminados
Ningún run queda en `TODO` al cerrar la release: se ejecuta, o se marca `BLOCKED`
con motivo. `TODO` silencioso = cobertura incompleta encubierta.

## Convención de binding spec ↔ Test (eslabón 3)

Cada spec automatizable declara la key del Test de Xray con la annotation **`tms`**
(convención existente del org — la misma que consumen los links TMS de Allure).
Forma preferida: el objeto de opciones del `test()` (annotation en declaración):

```ts
test(
  '[TS-...] Editar viaje con otherCosts sin 404 rollback',
  { annotation: [
      { type: 'tms', description: 'MX-6133' },   // ← key del Test de Xray
      { type: 'issue', description: 'MX-6024' },  // ← issue que valida
  ] },
  async ({ page }) => { /* ... */ },
);
```

- El nombre de archivo puede referenciar la issue (`mx6024-*.spec.ts`), pero el
  **binding a Xray es por `tms`**, no por el nombre.
- El reporter (fase B) lee `tms` (alias aceptado: `test_key`; fallback: `[KEY]` en
  el título) y emite Xray JSON con `testKey` → import determinístico, sin duplicar
  Tests Generic en cada corrida.

## Enforcement — Release Gate

Antes de cerrar una release:

```bash
bun run xray:gate --version "17080" --tag "v1.72.6" --project MX
# release con alias (mientras se consolida R2):
bun run xray:gate --version "17080" --version "v1.72.6 Web" --tag "v1.72.6" --project MX
```

Checks (exit 1 si falla alguno):

| Check | Regla | Detecta |
|---|---|---|
| `COVERAGE` | R3 | issues sin Test linkeado |
| `VERSION` | R1, R2 | artefactos sin `fixVersion` aceptada |
| `EMPTY_EXEC` | R5 | ATR con 0 runs |

Script: [`scripts/xray-release-gate.ts`](../../scripts/xray-release-gate.ts).
Integrar como job manual pre-cierre o step en el pipeline de release.

## Reconciliación (cuando el layer Jira y Xray divergen)

El CLI ya trae reparadores del binding Jira ↔ Xray:

```bash
bun xray exec sync --execution <ATR> --apply   # re-adjunta tests a la ejecución
bun xray plan sync --plan <ATP> --apply         # re-adjunta tests al plan
bun xray repair --project MX --apply            # reconciliación masiva
```

## Roadmap de implementación

- [x] **A** — Convención (este doc) + **D** — Gate (`xray:gate`).
- [x] **B** — Reporter dedicado `tests/utils/reporters/xray-reporter.ts` (magiis-playwright),
  opt-in `XRAY=1`, emite Xray JSON con `testKey` desde annotation `test_key` o `[KEY]` en título.
- [x] **C** — Step de CI en `.github/workflows/playwright-uat-e2e.yml`: import a Xray Cloud
  vía REST (`authenticate` + `import/execution`), gated en `secrets.XRAY_CLIENT_ID`,
  `if: always()` para registrar también los FAILED. Inputs: `xray_execution`, `xray_version`.
- [~] Anotar los specs reales con `tms` (mapeo verificado contra resúmenes de Test):
  - [x] MX-6132 → `gateway-pg/.../counts-reset.api.spec.ts` (test AC1 "sin ORA-00932")
  - [x] MX-6134 → carrier-v2 `mx6052-othercosts-trip-edit.spec.ts` (ya tenía `tms`)
  - [x] MX-6136 → `flights/specs/mx5825-getflights-app-link.spec.ts` (ya tenía `tms`)
  - [x] MX-6137 → `flights/specs/mx5826-reabrir-modal-reset.spec.ts` (ya tenía `tms`)
  - [ ] MX-6133 (MX-6024 back), MX-6135 (WhatsApp), MX-6138 (SQL drivers) — sin spec claro aún.
- [x] Replicar reporter + step de CI a `magiis-carrier-v2-e2e` (job `xray-import` mergea shards).
- [ ] Extender `extract-tc-map.ts` para mapear **Test key ↔ spec** vía annotation `tms`
  (hoy ya extrae annotations; falta exponer la columna Test-key explícita).

> Equivalente local del import (sin CI), usando el CLI del boilerplate:
> `bun xray import xray --file evidence/<env>/xray-results.json`
