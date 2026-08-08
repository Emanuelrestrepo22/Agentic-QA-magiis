# Portfolio Consistency Standard

> Fuente de verdad del **contrato de consistencia** entre el orquestador (HUB KATA) y
> los repos de automatización satélite del portafolio QA MAGIIS.
> Validable automáticamente: `bun scripts/consistency-check.ts <repos...>`.

## Repos del portafolio

| Repo | Rol | Runtime | Arquitectura |
|---|---|---|---|
| `agentic-qa-boilerplate` | **HUB** — define metodología | Bun | KATA (Component-Action-Test) |
| `magiis-api-e2e` | Capa API | pnpm | Cliente genérico + specs (+ piloto KATA) |
| `magiis-carrier-v2-e2e` | Capa UI (Carrier V2) | npm | Page Object Model |
| `magiis-playwright` | Gateway / multi-portal | pnpm | POM + reporters |

**Principio**: la consistencia se logra por **contrato**, no por runtime idéntico. No se
fuerza Bun en los satélites; se unifican gobernanza, trazabilidad, ambientes, CI e higiene.

## El contrato (lo que valida `consistency-check`)

| # | Check | Valor esperado | Por qué |
|---|---|---|---|
| 1 | **Identidad** | `.agents/project.yaml` con `project_key` + `environments` | Las skills del HUB consumen esta identidad |
| 2 | **Contrato de repo** | `CLAUDE.md` en la raíz | Referencia local a la metodología del HUB |
| 3 | **Higiene** | Sin duplicados OneDrive `*(1)*` | Evita símbolos duplicados y ruido |
| 4 | **Secretos** | `.mcp.json` sin keys en claro (usa `${VAR}`) | Seguridad |
| 5 | **Trazabilidad** | Annotation `type:'tms'` presente (helper o specs) | Puente TC ↔ código ↔ TMS (Xray/jira) |
| 6 | **Gate CI** | Workflow con `lint`/`typecheck` previo a tests | Calidad homogénea |

### Contrato de trazabilidad (detalle)

- `type:'tms'` → key del Test de Jira (**MG-XXXX**). La consume el reporter (sync jira-native).
- `type:'tc'` → subcaso 1:1 con la matriz QA (`MG-XXXX-<TC>`).
- **Migración MX→MG (2026-07-17)**: Carrier pasa a MAGIIS-4 (`MG`, jira-native, **sin Xray**).
  Keys nuevas = `MG-XXXX`; las `MX-XXXX` en specs son históricas (pendiente mapeo). El
  `xray-reporter` queda para el histórico MX/AF; el sync canónico de MG es jira-native.
- Helper canónico: `makeAnnotate(key, route?)` en `tests/utils/traceability.ts`
  (API: `tests/helpers/traceability.ts`). Reemplaza los `annotate()` locales y la
  convención `TS-API-TC###` no aplicada.
- Puente legacy: el `xray-reporter` acepta `type:'jira'` como fallback mientras se migra.

### Vocabulario de ambientes

| HUB | Satélites | Nota |
|---|---|---|
| `qa` | `test` | env de ejecución |
| `staging` | `uat` | pre-prod |
| `production` | `prod` | read-only |

Se **mapea** en `project.yaml`, no se renombran los `.env.*`.

## Estado actual (2026-07-17)

| Check | api-e2e | carrier-v2-e2e |
|---|---|---|
| Identidad | ✅ | ✅ |
| CLAUDE.md | ✅ | ✅ (gitignored por decisión del repo) |
| Higiene | ✅ (15 dups eliminados) | ✅ |
| Secretos | ✅ (`${POSTMAN_API_KEY}`) | ✅ |
| Trazabilidad | ✅ (helper + flow MX-5846) | ✅ (helper + pilot MX-5438) |
| Gate CI | ✅ (pnpm + quality-checks) | ✅ (quality-checks) |

**Pendiente mecánico** (no bloquea el contrato): sweep de imports relativos → aliases
(api), migración del resto de specs al helper `makeAnnotate` (v2: ~40 specs con
`type:'jira'`; api: asignar keys MG a controllers), mapear las keys MX-XXXX históricas
→ MG-XXXX (migración), y `@atc` con decorador (spike de
runtime en tsx/Playwright antes de adoptarlo).

## Uso del validador

```bash
# Desde el HUB, auditar los satélites:
bun scripts/consistency-check.ts \
  ../../Escritorio/automation-projects/magiis-api-e2e \
  ../../Escritorio/automation-projects/magiis-carrier-v2-e2e

# O vía env var:
CONSISTENCY_REPOS="/ruta/a,/ruta/b" bun scripts/consistency-check.ts

# Sin args: audita el repo actual (cwd).
```

Exit code ≠ 0 si algún check falla → usable como gate en CI.
