# ADR-0002 — Organización de tests y variantes por repo

- **Status:** Proposed
- **Date:** 2026-09-08
- **Deciders:** Emanuel Restrepo (QA owner)
- **Tags:** test-layout, multi-repo, kata, imports, naming-convention, portfolio-governance
- **Supersedes:** —
- **Superseded by:** —

---

## Context

El padre (`agentic-qa-boilerplate`) define un layout de tests único (§3 de `automation-standards.md` y `kata-architecture.md`): `tests/e2e/{module}` y `tests/integration/{module}`, donde `{module}` es un dominio de negocio en kebab-case plural, 1:1 con un Component de Jira, y `kata-manifest.json` como registro central de componentes. Ese layout se pensó para un consumidor KATA — un repo que corre `bun run up` y hereda framework del padre.

Los tres repos hijos de automatización de MAGIIS (`magiis-playwright`, `magiis-carrier-v2-e2e`, `magiis-api-e2e`) no son consumidores KATA: son repos Playwright preexistentes con estructura propia, sin `kata-manifest.json` ni `.template/` (`README.md` §"Multi-repo orchestration", modelo de "light-layer sharing" — el padre distribuye solo skills + `.context/` + CI, nunca el runtime). El padre no tenía, hasta ahora, una postura explícita sobre qué parte de su canon de organización de tests aplica igual a esos hijos y qué parte puede variar legítimamente por repo.

La presión concreta que fuerza esta decisión es el ingreso del canon de Federico para `magiis-carrier-v2-e2e`: `docs/architecture/CONVENTIONS.md` (medido contra el código real, fecha base 2026-09-02) declara en su §15 seis desviaciones deliberadas respecto al HUB —idioma de artefactos, orden de verificación, registro de componentes, runtime, `.context/` PBI y TMS— y en su §1-§2 fija un layout por dominio sin nivel de suite intermedio, con imports relativos en vez de alias. Ese documento es la fuente medida de un patrón de organización distinto del canónico, y sostenido con evidencia (`path:line`, conteos de archivos), no una improvisación.

El padre tiene, además, tres problemas de fondo que este ADR debe resolver a la vez:

1. **No existe mecanismo de propagación real hacia los hijos.** `bun run up` es `gh`-only y asume forma bun/KATA; los tres hijos no calzan. TD-7 (`README.md`, tabla de deuda técnica) es un placeholder — "pick + wire submodule / subtree / sparse-checkout" — sin implementación.
2. **El propio repo API (`magiis-api-e2e`) ya organiza sus specs por un eje distinto al de dominio de negocio**: por riesgo operativo. `docs/ARCHITECTURE.md:107-111` documenta `tests/specs/controllers/` (69 archivos, solo lectura, ejecutable en producción), `tests/specs/_mutation/` (12, doble guarda `ALLOW_MUTATIONS=1` + UAT) y `tests/specs/_flows/` (11, `describe.serial`) — conteos verificados en este mismo trabajo (`find tests/specs/{controllers,_mutation,_flows} -type f`: 69/12/11). Los nombres de archivo codifican el dominio dentro de cada carpeta de riesgo (~14-16 dominios con cola larga de un archivo), pero el nivel superior de la carpeta es el riesgo, no el dominio.
3. **`magiis-playwright` (V1) es un híbrido sin resolver**, no un canon a imitar ni una desviación a corregir de oficio: cuatro raíces paralelas de page objects, dos arquitecturas de fixtures conviviendo (`TestBase.ts` plano y `tests/components/TestContext.ts` KATA), `tests/features/gateway-pg/` concentrando 186 de 214 archivos del repo, y una reorganización previa incompleta (carpetas vacías, una regla propia — "`features/.../pages/` no debe existir" — incumplida en 3 features). Es deuda de organización real, medida, no una variante declarada con evidencia.

Un hallazgo adicional de esta misma sesión (`.session/framework-development/estandar-estructura-tests/P2-verificacion-alias.md`, medición empírica del 2026-09-08) cambia el fundamento de la desviación de imports de V2: la premisa escrita en `CONVENTIONS.md` §2 y §14 ("no hay resolver conectado a Playwright: un import aliaseado explota en runtime") **no se sostiene** contra el código real. Dos pruebas independientes —un spec temporal corrido con `npx playwright test --project=carrier-v2-desktop` y un script temporal corrido con `npx tsx`— mostraron que el alias `@utils/*` **resuelve correctamente** en ambos motores, con Playwright 1.60.0 y tsx 4.22.0. `tsconfig.json` ya declara `baseUrl: "."` junto a `paths`, y Playwright resuelve `paths` de tsconfig desde su versión 1.35. El hecho medido por Fede sobre el uso real (0 archivos con alias en `tests/specs/` y `tests/pages/`, 77 specs) sigue siendo cierto y queda intacto; lo que no se sostiene es la razón declarada — no hay impedimento técnico, hay consistencia interna con 77 specs ya escritos en el patrón contrario.

Tres decisiones de producto ya fueron tomadas por el usuario y este ADR las formaliza, sin volver a discutirlas: (1) el repo API no se reorganiza — su partición por riesgo se homologa; (2) el padre adopta un canon con variantes declaradas, homologando las seis desviaciones de Fede; (3) V1 recibe diagnóstico medido y una primera ola acotada de mejora, no una reorganización completa.

## Decision

Adoptamos un modelo de **canon universal + variantes declarables**. El canon fija lo que protege la trazabilidad y la navegabilidad del portafolio entre repos; las variantes cubren todo lo que es preferencia de herramienta o de estilo interno, siempre que quede escrito con evidencia medida.

### Canon universal (aplica a todo repo de automatización del portafolio, KATA o no)

1. **Los specs se agrupan por dominio de negocio, sin nivel de suite en la ruta.** La suite (smoke, regression, visual, a11y) se selecciona por **tag** en tiempo de ejecución (`--grep @P1`, `--grep @a11y`), nunca por carpeta. Un repo no debe tener `smoke/`, `regression/`, `visual/` ni `a11y/` como directorios de primer nivel bajo el árbol de specs.
2. **Ningún script deriva la suite del path de un archivo.** La suite se lee de metadata declarada en el propio test (tags del título, o el campo equivalente que el reporter expone), nunca de a qué carpeta pertenece el archivo. Corolario explícito de V2 (`CONVENTIONS.md:30-31`), adoptado como regla de portafolio.
3. **Un page object por pantalla, en el mismo dominio que su spec.** El nombre de carpeta del POM y el nombre de carpeta del spec correspondiente coinciden, para que una pantalla se lea igual desde los dos lados.
4. **Todo repo mantiene un documento de convenciones propio, medido contra el código real, no aspiracional.** Cada regla que declare debe poder señalar su evidencia (`path:line` o un conteo verificable). Este documento es el que un lector — humano o agente — consulta antes de escribir el próximo test en ese repo.

### Variantes declarables (un repo puede diferir del canon si lo documenta con evidencia)

- **Gestor de paquetes y runtime** (bun vs npm vs pnpm, Node vs Bun).
- **Idioma de los artefactos legibles por humanos** (comentarios, títulos de test, motivos de skip/fixme) — la Regla #14 del padre ya reconoce excepciones por decisión de programa; esto extiende el mismo principio a nivel de organización de tests.
- **Orden de los gates de verificación** (tests → typecheck → lint es el default del padre; un repo puede justificar un orden distinto por una restricción operativa real, como un ambiente serializado).
- **Estrategia de imports** (alias vs relativo), cuando se declara como **convención de estilo interno**, no como límite técnico del runner — ver la corrección de fundamento en el punto siguiente.
- **Registro de componentes**, cuando el repo no consume `kata-manifest.json` y sostiene un sustituto igualmente auditable (barrel + mapa de trazabilidad + campo de rol en su propio ledger).
- **Eje de agrupación de specs**, cuando el dominio de negocio no es el eje de mayor riesgo del repo: un repo de API pura puede agrupar primero por **riesgo operativo** (solo lectura vs mutación vs flujo encadenado) y por dominio dentro de cada grupo de riesgo.

### Regla de convivencia

Una variante **documentada y medida** no es deuda técnica y no se corrige de oficio — ni por el padre, ni por otro repo hijo, ni por un agente que la encuentre en tránsito. Corregirla sin que el equipo dueño del repo lo pida es exactamente el error que el ADR-0001 ya nombró en otro contexto: tratar una decisión vigente como si fuera un olvido.

Una **divergencia sin documentar** — código que se aparta del canon sin que ningún archivo de convenciones lo explique ni mida — sí es deuda, y se registra como tal (issue `TECHDEBT`, o directamente en la lista de deuda medida de este ADR si aplica a V1).

## Tabla de variantes homologadas hoy

| Repo | Variante | Razón homologada |
| --- | --- | --- |
| `magiis-carrier-v2-e2e` | Specs por dominio sin nivel de suite intermedio (15 carpetas de dominio + `exploratory/` + `release/`); suite elegida por tag (`--grep @P1`, `--grep @a11y`) | Ya es el canon universal descrito arriba — V2 es la fuente que lo hizo evidente, no una excepción a él |
| `magiis-carrier-v2-e2e` | Imports **relativos con `.js`**, no alias, pese a que `@pages/@utils/…` están declarados en `tsconfig.json:20-25` | **Corregido por P2 (2026-09-08):** no es un límite técnico — el alias resuelve en runtime tanto en Playwright 1.60 como en tsx 4.22, medido empíricamente. El fundamento real es **consistencia de estilo** con 77 specs ya escritos en el patrón relativo; migrar sin beneficio funcional inmediato no se justifica hoy. Queda como recomendación abierta, no como imposición: si V2 decide adoptar alias más adelante, la configuración ya lo soporta sin trabajo previo |
| `magiis-carrier-v2-e2e` | Idioma: comentarios/JSDoc/títulos de test/motivos de skip en español; identificadores/archivos/commits en inglés | Medido sobre 72 specs, 100% español — mismo principio que la Regla #14 del padre para artefactos leídos por personas, aplicado a nivel de repo completo por decisión de programa |
| `magiis-carrier-v2-e2e` | Orden de verificación: typecheck → lint scoped → tests (2x), en vez de tests → typecheck → lint | Ambiente `test` serializado (1 cuenta carrier, 1 `storage/state-carrier-test.json`, `CONVENTIONS.md` §10 "Ladder E2") — correr specs antes de saber que compilan/lintan desperdicia el turno serializado |
| `magiis-carrier-v2-e2e` | Registro de componentes: barrel `tests/pages/carrier-v2/index.ts` + `traceability/tc-map.json` + `targetPoms[].role` de `docs/migration/LEDGER.json`, en vez de `kata-manifest.json` | Framework compartido con colegas fuera del programa de migración; no se introducen cambios de arquitectura de framework fuera de su alcance (decisión de programa C5) |
| `magiis-carrier-v2-e2e` | Runtime: npm + Node ≥20, no Bun | Toolchain (husky, tsx, cross-env) ya estabilizado sobre npm; el propio padre manda leer `package.json` del repo en cuestión, no asumir un stack común (Regla #11 del padre) |
| `magiis-api-e2e` | Eje de agrupación: **riesgo operativo** (`controllers/` 69 archivos solo lectura, `_mutation/` 12 con doble guarda, `_flows/` 11 encadenados con `describe.serial`), dominio de negocio como sub-nivel dentro de cada grupo de riesgo | `docs/ARCHITECTURE.md:107-111`; conteos verificados en esta sesión. El dominio de negocio no es el eje de mayor riesgo de un repo de API pura — el riesgo de ejecutar un endpoint de mutación contra producción por accidente lo es, y ese riesgo debe ser visible en la ruta del archivo antes que el dominio |

> Nota de alcance: la desviación de `.context/` PBI y de TMS de V2 (§15 de `CONVENTIONS.md`: `traceability/` + `LEDGER.json` en vez de árbol `.context/PBI/` sincronizado; Jira-native + Xray Tests con namespace `TM-` en vez de Xray genérico) es real y está documentada, pero pertenece al dominio de trazabilidad/TMS, no al de organización de carpetas de tests que este ADR cubre. Se deja mencionada por completitud del §15 citado; su homologación formal, si se decide necesaria, es candidata a su propio ADR o a una nota en `test-documentation`.

## Consequences

- **Positive:**
  - El padre deja de tener una postura implícita ("todo repo debería verse como KATA") que ningún hijo real cumple, y pasa a tener una postura explícita y auditable: dos listas cortas, canon y variantes, en vez de una lectura caso por caso cada vez que alguien cruza de un repo a otro.
  - El trabajo medido de Fede en V2 se convierte en insumo de mejora del padre en vez de quedar aislado en un repo hijo — el punto 1-3 del canon universal nace directamente de su medición, no de una preferencia del padre impuesta hacia abajo.
  - Corrige una afirmación técnica incorrecta (el supuesto límite de alias) antes de que se propague a otro repo o a una decisión de arquitectura mayor, sin necesidad de tocar el código de V2 ni de forzar una migración no solicitada.
  - El repo API no absorbe una reorganización que le haría perder su propiedad más valiosa — la visibilidad del riesgo operativo en la ruta del archivo — solo para parecerse al canon.
- **Negative / trade-offs:**
  - El canon universal es más delgado de lo que el padre proponía hasta ahora (`{module}` como único eje, `kata-manifest.json` como único registro). Un lector que solo conocía la versión KATA del canon debe aprender que "dominio de negocio" no siempre es "carpeta de primer nivel" — en API es "riesgo operativo, luego dominio".
  - Mantener una tabla de variantes homologadas es trabajo continuo: cada hijo nuevo, o cada cambio grande en un hijo existente, obliga a revisar si sigue siendo una variante válida o si se volvió una divergencia sin fundamento.
  - La corrección del fundamento de imports (P2) no cambia nada en el código de V2 hoy — dos personas leyendo `CONVENTIONS.md` y este ADR en paralelo verán una tensión aparente (uno dice "no hay resolver", el otro dice "sí resuelve, pero no se usa por estilo") hasta que alguien actualice `CONVENTIONS.md` §2/§14 con la evidencia de P2. Ese ADR no edita el repo hijo — queda como trabajo pendiente para quien lo mantiene.
- **Neutral / follow-ups:**
  - **Umbral de componentes: resuelto por P3 (2026-09-08), con medición.** El canon pasa de "siempre plano" a **plano por defecto, agrupación por dominio permitida —no exigida— a partir de ~10 componentes concretos en la carpeta**. Conteos que lo sostienen, medidos sobre los repos locales: padre 3 api + 3 ui (plano, cómodo); `magiis-api-e2e` 7 componentes api (plano, cómodo); `magiis-playwright` 20 archivos en `tests/components/ui/` ya distribuidos en 3 subcarpetas de dominio (`carrier/`, `carrier/card-forms/`, `contractor/`) **sin que ninguna regla lo mandara**; `magiis-carrier-v2-e2e` 57 page objects en 13 carpetas de dominio. Nadie por debajo de 10 agrupó; los dos que superaron ese tamaño agruparon por su cuenta. El umbral describe una práctica observada, no una preferencia impuesta.
  - **Bloqueante técnico que acompañaba a ese umbral: resuelto el 2026-09-08.** `scripts/kata-manifest.ts:201` escaneaba con `new Bun.Glob('*.ts')`, un patrón **no recursivo**, sobre las rutas de `COMPONENT_PATHS`: un repo consumidor que agrupara componentes en subcarpetas dejaba el manifest ciego a ellos y el gate de anti-duplicación perdía validez en silencio, el peor modo de falla posible para esa herramienta. El patrón pasó a `'**/*.ts'` y el criterio de orden incorporó `relativePath` como desempate, para que el listado siga siendo determinístico cuando dos dominios tengan componentes homónimos. Verificado con dos pruebas: el manifest regenerado sobre la estructura plana actual es idéntico salvo el sello de tiempo, y un componente sembrado en una subcarpeta pasa a ser detectado. Los tres hijos actuales no consumen el manifest; el riesgo remanente es solo el de un repo anclado a una versión anterior del boilerplate.
  - El mecanismo real de propagación (TD-7 — submodule / subtree / sparse-checkout de skills + `.context/`) sigue sin resolver. Este ADR fija qué se propaga en materia de organización de tests; no resuelve cómo se distribuye.
  - V1 (`magiis-playwright`) queda fuera del alcance de reorganización de este ADR por decisión ya tomada. Su diagnóstico medido (cuatro raíces de POMs, dos arquitecturas de fixtures, `features/gateway-pg/` con 186/214 archivos, regla propia incumplida en 3 features) se deja registrado aquí como línea base; la primera ola acotada de mejora es trabajo de una tarea separada (no de este ADR), y debe releer este documento antes de decidir alcance.
  - Queda pendiente decidir si la desviación de `.context/`/TMS de V2 (nota de alcance arriba) merece su propio ADR o alcanza con una nota en la doctrina de `test-documentation`.

## Alternatives considered

- **Imponer el canon KATA sin variantes, exigiendo que los tres hijos se reorganicen para calzar.** Rechazada: ninguno de los tres hijos es un consumidor KATA hoy (no corren `bun run up`, no tienen `kata-manifest.json`), y forzar el layout rompería el modelo de "light-layer sharing" que el propio padre eligió para el multi-repo (`README.md`). Además desconocería trabajo ya medido y en producción — reorganizar 77 specs de V2 o 92 de API sin beneficio funcional sería puro costo.
- **Dejar cada repo completamente libre, sin canon de portafolio.** Rechazada: sin un canon mínimo compartido, cruzar de un repo a otro exige releer la convención completa de cada uno desde cero, y no hay manera de distinguir una variante deliberada de una divergencia accidental — exactamente el vacío que forzó esta decisión.

## References

- `docs/architecture/CONVENTIONS.md` (rama `origin/main` de `magiis-carrier-v2-e2e`, medición base 2026-09-02) — fuente del canon de layout por dominio (§1), la desviación de imports (§2), idioma (§3), tags (§4) y la tabla de seis desviaciones frente al HUB (§15).
- `.session/framework-development/estandar-estructura-tests/P2-verificacion-alias.md` (2026-09-08) — corrección empírica del fundamento de la variante de imports: el alias resuelve en runtime en Playwright 1.60.0 y tsx 4.22.0; la variante se sostiene como estilo, no como límite técnico.
- `magiis-api-e2e/docs/ARCHITECTURE.md:95-118` — layout por riesgo operativo (`controllers/`, `_mutation/`, `_flows/`); conteos de archivos verificados en esta sesión (69/12/11).
- `.claude/skills/test-automation/references/automation-standards.md` (líneas ~250-309) — canon vigente de `{module}` como dominio de negocio, kebab-case plural, 1:1 con Component de Jira.
- `.claude/skills/test-automation/references/kata-architecture.md` (líneas ~40-85) — layout KATA con componentes planos, sin agrupación por dominio.
- `.claude/skills/test-automation/SKILL.md:402` — anti-patrón T5 ("NEVER use relative imports"), matizado por este ADR para repos que documenten la variante de imports con evidencia.
- `README.md`, sección "Multi-repo orchestration (parent + automation children)" (~líneas 651-739) — modelo de light-layer sharing, tabla de deuda técnica (TD-1 a TD-11), TD-7 sin implementar.
- `.context/ADR/ADR-0001-test-case-lifecycle-and-layer-credit.md` — precedente de portafolio: una decisión vigente no se corrige de oficio solo porque un agente la encuentra en tránsito.
