# Playwright Projects - Guía completa

> _Traducción al español de [playwright-framework.md](playwright-framework.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> Este documento explica cómo funcionan los Projects de Playwright, su configuración y cómo usarlos de forma efectiva en la KATA Architecture.

---

## ¿Qué son los Projects?

Los Projects son **configuraciones de test independientes** dentro de un único setup de Playwright. Cada project puede tener:

- Su propio `testMatch` (qué archivos correr)
- Su propio `testDir` (dónde buscar los tests)
- Sus propias `dependencies` (qué debe correr antes)
- Su propio `teardown` (qué corre después de que este project y todos sus dependientes terminen)
- Su propia configuración `use` (browser, viewport, auth state, etc.)

Pensá los projects como **configuraciones con nombre** que pueden encadenarse entre sí.

---

## Nuestra estructura de Projects

```
┌─────────────────────────────────────┐
│  global-setup                       │  Corre PRIMERO - crea directorios, valida env
│  (teardown: 'global-teardown')      │  ← Enlaza al project teardown
└────────────────┬────────────────────┘
                 │
            ┌────┴────┐
            ▼         ▼
      ┌────────┐ ┌─────────┐
      │ui-setup│ │api-setup│  Auth setup - guarda session/token
      └────┬───┘ └────┬────┘
           │         │
           ▼         ▼
      ┌────────┐ ┌───────────┐
      │  e2e   │ │integration│  Tests reales
      └────────┘ └───────────┘
                 │
                 ▼ (después de que TODOS los dependientes terminen)
         ┌──────────────┐
         │global-teardown│  Corre ÚLTIMO - cleanup, sync a TMS
         └──────────────┘
```

**Importante:** El teardown corre automáticamente después de que `global-setup` Y todos los projects que dependen de él (directa o transitivamente) hayan terminado.

---

## Configuración de Projects

### Project Global Setup
```typescript
{
  name: 'global-setup',
  testMatch: /global\.setup\.ts/,
  testDir: './tests/setup',
  teardown: 'global-teardown',  // ← Activa el teardown después de que todos los dependientes terminen
}
```
- Sin dependencies - corre primero
- Crea los directorios requeridos
- Valida la configuración del entorno
- **Propiedad `teardown`**: Enlaza al project teardown que corre tras finalizar

### Project Global Teardown
```typescript
{
  name: 'global-teardown',
  testMatch: /global\.teardown\.ts/,
  testDir: './tests/teardown',
  // SIN dependencies - se activa por la propiedad `teardown` en global-setup
}
```
- Activado por la propiedad `teardown` en `global-setup`
- Corre después de que `global-setup` Y todos sus dependientes terminen
- Genera reportes, sincroniza al TMS, cleanup

### Projects de Auth Setup
```typescript
{
  name: 'ui-setup',
  testMatch: /ui-auth\.setup\.ts/,
  testDir: './tests/setup',
  dependencies: ['global-setup'],
}
```
- Depende de `global-setup`
- Ejecuta el login y guarda el session state
- La session se reutiliza en los tests E2E

### Projects de Test
```typescript
{
  name: 'e2e',
  testMatch: '**/e2e/**/*.test.ts',
  dependencies: ['ui-setup'],
  use: {
    storageState: config.auth.storageStatePath,
  },
}
```
- Depende del auth setup
- Usa el session state guardado
- Coincide con todos los archivos `.test.ts` en `tests/e2e/`

---

## Cómo funcionan las Dependencies

Cuando corrés un project, Playwright resuelve y corre automáticamente sus dependencies:

```bash
# Corriendo el project e2e
bun run test --project=e2e

# Playwright ejecuta en orden:
# 1. global-setup (dependency de ui-setup)
# 2. ui-setup (dependency de e2e)
# 3. e2e (el project solicitado)
# 4. global-teardown (teardown de global-setup, corre después de todos los dependientes)
```

**Puntos clave:**
- Las dependencies se resuelven recursivamente (hacia arriba / upstream)
- Cada dependency corre una sola vez (aunque varios projects dependan de ella)
- Si una dependency falla, los projects dependientes se saltan
- **El teardown corre después de que el project de setup Y todos sus dependientes terminen**

---

## Dependencies vs Teardown

Estos son **conceptos distintos** que funcionan en direcciones opuestas:

| Propiedad | Dirección | Propósito | Cuándo corre |
|----------|-----------|---------|--------------|
| `dependencies` | Upstream | "Esperá a estos antes de que yo empiece" | Antes del project |
| `teardown` | Downstream | "Corré esto después de que yo y todos mis dependientes terminemos" | Después de todos los dependientes |

### Error común

```typescript
// ❌ INCORRECTO - Esto NO activa el teardown automáticamente
{
  name: 'global-teardown',
  dependencies: ['e2e', 'integration'],  // Solo significa "esperá a estos"
}

// ✅ CORRECTO - Usá la propiedad teardown en el project de setup
{
  name: 'global-setup',
  teardown: 'global-teardown',  // Activa el teardown después de todos los dependientes
}
```

**Por qué `dependencies` no sirve para el teardown:**
- `dependencies` solo significa "no empieces hasta que estos terminen"
- NO significa "corré este project automáticamente"
- Cuando corrés `--project=e2e`, Playwright solo corre los projects de la cadena de dependencies *yendo hacia arriba*
- El project teardown no está en esa cadena, por lo que nunca corre

---

## Correr los Tests

### Comandos de terminal

#### Correr por project
```bash
bun run test --project=e2e           # Solo e2e (con dependencies)
bun run test --project=integration   # Solo integration (con dependencies)
bun run test --project=e2e --project=integration  # Ambos
```

#### Correr un archivo o carpeta específicos
```bash
# Un solo archivo - Playwright auto-detecta el project que coincide
bun run test tests/integration/auth/auth.test.ts

# Todos los tests en una carpeta
bun run test tests/e2e/dashboard/

# Múltiples archivos
bun run test tests/e2e/login.test.ts tests/e2e/logout.test.ts
```

#### Correr por nombre de test (grep)
```bash
# Correr tests que coinciden con un patrón
bun run test --grep "should login"

# Correr tests que NO coinciden con un patrón
bun run test --grep-invert "skip"
```

#### Correr todos los tests
```bash
bun run test  # Corre todos los projects con sus dependencies
```

---

## Extensión de VS Code

### Instalación

Instalá la extensión oficial de Playwright: `ms-playwright.playwright`

```
Extensions (Ctrl+Shift+X) → Buscar "Playwright" → Instalar "Playwright Test for VSCode"
```

### Panel de la barra lateral

La extensión agrega un ícono **Testing** en la barra lateral con:

| Sección | Descripción |
|---------|-------------|
| **Projects** | Checkboxes para habilitar/deshabilitar projects |
| **Test Explorer** | Vista en árbol de todos los archivos y casos de test |
| **Settings** | Show browser, modo headed, etc. |

### Checkboxes de Project

| Estado | Comportamiento |
|-------|----------|
| Marcado | Project activo, los tests pueden correr |
| Desmarcado | Project deshabilitado, los tests no correrán |

**Tip:** Desmarcá `global-teardown` durante el desarrollo para saltar el cleanup después de cada corrida.

### Correr Tests

| Acción | Cómo |
|--------|-----|
| Correr un solo test | Clic en el botón verde de play al lado del test |
| Correr un archivo | Clic en el botón de play al lado del nombre del archivo |
| Correr una carpeta | Clic derecho en la carpeta → "Run Tests" |
| Correr todo | Clic en el botón de play arriba del explorer |

### Settings (ícono de engranaje)

- **Show browser**: Corre los tests en modo headed (browser visible)
- **Pick locator**: Selector de elementos interactivo
- **Record new**: Graba acciones para generar el código del test
- **Record at cursor**: Inserta las acciones grabadas en la posición del cursor

---

## File Matching (coincidencia de archivos)

### Cómo encuentra Playwright los Tests

1. El **`testMatch` global** en la raíz de la config aplica a todos los projects
2. El **`testMatch` del project** sobrescribe o filtra aún más
3. El **`testDir` del project** limita dónde buscar

### Nuestra configuración

```typescript
// Global (aplica a todos)
testMatch: /.*\.test\.ts/

// Específico por project
{
  name: 'e2e',
  testMatch: '**/e2e/**/*.test.ts',  // Solo la carpeta e2e
}
{
  name: 'integration',
  testMatch: '**/integration/**/*.test.ts',  // Solo la carpeta integration
}
```

### Detección automática de Project

Cuando corrés un archivo específico:
```bash
bun run test tests/integration/auth/auth.test.ts
```

Playwright:
1. Chequea qué patrones `testMatch` de qué projects coinciden con el archivo
2. Corre el/los project(s) que coinciden con sus dependencies
3. Si coinciden múltiples projects, corre el archivo en cada project

---

## Escenarios comunes

### Escenario 1: Correr los Tests E2E
```bash
bun run test:e2e
# Equivalente a: bun run test --project=e2e
```
Orden de ejecución:
1. `global-setup`
2. `ui-setup`
3. tests `e2e`
4. `global-teardown` (porque global-setup tiene `teardown: 'global-teardown'`)

### Escenario 2: Correr los Tests de Integration
```bash
bun run test:integration
# Equivalente a: bun run test --project=integration
```
Orden de ejecución:
1. `global-setup`
2. `api-setup`
3. tests `integration`
4. `global-teardown`

### Escenario 3: Correr todos los Tests
```bash
bun run test
```
Orden de ejecución:
1. `global-setup`
2. `ui-setup` y `api-setup` (pueden correr en paralelo si workers > 1)
3. tests `e2e` e `integration`
4. `global-teardown` (corre una sola vez después de que TODOS los tests terminen)

### Escenario 4: Correr un solo archivo de Test
```bash
bun run test tests/e2e/dashboard/dashboard.test.ts
```
Playwright detecta que esto coincide con el project `e2e` y corre:
1. `global-setup`
2. `ui-setup`
3. Solo `dashboard.test.ts`
4. `global-teardown`

---

## Extensión vs Terminal

| Funcionalidad | Terminal | Extensión de VS Code |
|---------|----------|-------------------|
| Seleccionar project | `--project=name` | Checkbox |
| Múltiples projects | Múltiples flags `--project` | Múltiples checkboxes |
| Deshabilitar project | No pasar el flag | Desmarcar la casilla |
| Dependencies | Auto-resueltas | Auto-resueltas |
| Correr un archivo específico | Pasar la ruta del archivo | Clic en el botón de play |
| Modo debug | flag `--debug` | Clic derecho > Debug |

---

## Debugging

### Método 1: Breakpoints de VS Code (Recomendado)

1. Poné breakpoints en tu archivo de test (clic en el margen izquierdo)
2. Clic derecho en el test → **"Debug Test"**
3. La ejecución se pausa en los breakpoints
4. Usá la toolbar de Debug: Step Over, Step Into, Continue

**Tip:** Funciona con la opción "Show browser" de la extensión para ver la UI mientras hacés debug.

### Método 2: page.pause()

Insertá `await page.pause()` en tu test para abrir el Playwright Inspector:

```typescript
test('debug example', async ({ page }) => {
  await page.goto('/dashboard');
  await page.pause();  // Abre el Inspector acá
  await page.click('#submit');
});
```

El Inspector permite:
- Avanzar por las acciones una por una
- Elegir locators interactivamente
- Ver la consola y la red
- Reanudar o grabar nuevas acciones

### Método 3: Traces

Los traces capturan un registro completo de la ejecución del test para debugging post-mortem.

**Habilitar en la config** (ya configurado):
```typescript
trace: 'retain-on-failure'  // Guarda el trace solo en los fallos
```

**Ver traces:**
```bash
# Abrir el trace viewer
bunx playwright show-trace test-results/path-to/trace.zip

# O vía reporte HTML - clic en el test fallido → pestaña "Traces"
```

**Forzar el trace para una corrida específica:**
```bash
bun run test --trace on
```

### Método 4: UI Mode

Modo interactivo con debugging de time-travel:
```bash
bun run test --ui
```

Funcionalidades:
- Modo watch (re-corre al cambiar archivos)
- Avanzar por cada acción visualmente
- Snapshots del DOM en cada paso
- Logs de red y consola

### Resumen de flags de Debug

```bash
--debug          # Corre con Playwright Inspector
--ui             # Abre el modo UI interactivo
--headed         # Muestra la ventana del browser
--trace on       # Fuerza la grabación de trace
--slow-mo=1000   # Ralentiza las acciones 1 segundo
```

---

## Buenas prácticas

### 1. Mantené los Projects de Setup livianos
Los projects de setup deben ser rápidos. Las operaciones pesadas ralentizan cada corrida de tests.

### 2. Usá nombres de Project descriptivos
```typescript
// Bien
name: 'e2e'
name: 'integration'
name: 'ui-setup'

// Mal
name: 'project1'
name: 'tests'
```

### 3. Hacé match de archivos por directorio
Usá matching basado en directorios para una separación clara:
```typescript
testMatch: '**/e2e/**/*.test.ts'      // Todos los tests e2e
testMatch: '**/integration/**/*.test.ts'  // Todos los tests de API
```

### 4. Un único sufijo de archivo de Test
Usá `.test.ts` para todos los archivos de test. La estructura de directorios se encarga de la separación:
```
tests/
├── e2e/
│   └── dashboard/
│       └── dashboard.test.ts
└── integration/
    └── auth/
        └── auth.test.ts
```

### 5. No te saltes las Dependencies
Si necesitás saltar el setup, creá un project separado sin dependencies solo con fines de debugging.

---

## Troubleshooting

### Los Tests no corren

**Síntoma:** El archivo de test existe pero no corre.

**Chequeá:**
1. ¿El archivo coincide con el patrón `testMatch`?
2. ¿El project correcto está marcado/seleccionado?
3. ¿El archivo está en `testIgnore`?

### Las Dependencies no corren

**Síntoma:** El setup no corre antes de los tests.

**Chequeá:**
1. ¿El array `dependencies` está configurado correctamente?
2. ¿Los nombres de los projects de dependency están bien escritos?
3. ¿El project de dependency existe?

### El Teardown no corre

**Síntoma:** El project teardown nunca se ejecuta.

**Chequeá:**
1. ¿El project de setup tiene la propiedad `teardown: 'project-name'`?
2. ¿El nombre del project teardown está bien escrito?
3. ¿Estás usando `dependencies` en el project teardown? (Esto está mal - usá `teardown` en el setup en su lugar)

### Corre el Project equivocado

**Síntoma:** El archivo corre en un project inesperado.

**Chequeá:**
1. ¿La ruta del archivo coincide con el `testMatch` de múltiples projects?
2. Usá `--project=name` para forzar un project específico.

---

## Documentación relacionada

- [Playwright Projects](https://playwright.dev/docs/test-projects)
- [Test Configuration](https://playwright.dev/docs/test-configuration)
- [VS Code Extension](https://playwright.dev/docs/getting-started-vscode)
- [Debugging Tests](https://playwright.dev/docs/debug)
- [Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [UI Mode](https://playwright.dev/docs/test-ui-mode)
