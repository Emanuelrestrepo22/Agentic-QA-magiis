# Estrategia de Dependency Injection en KATA

> _Traducción al español de [dependency-injection.md](dependency-injection.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> **Propósito**: Explica cómo los drivers de Playwright fluyen a través de la arquitectura KATA y por qué este diseño habilita un rendimiento óptimo de los tests.
>
> **Audiencia**: QA Engineers, agentes de IA que implementan components de KATA.
>
> **Prerrequisitos**: Leer `kata-fundamentals.md` para la filosofía de KATA.

---

## Visión general

KATA usa **dependency injection (inyección de dependencias) basada en constructor** para propagar los drivers de Playwright (`page` y `request`) a través de la jerarquía de components. Este diseño, combinado con la **inicialización lazy de fixtures de Playwright**, garantiza:

1. Los **tests E2E** comparten el mismo browser context para operaciones de UI y API
2. Los **tests solo-API** nunca abren un browser (cero overhead)
3. Los **Components permanecen desacoplados** del sistema de fixtures de Playwright

---

## El problema que esto resuelve

### Anti-patrón: acceso directo al fixture

```typescript
// MAL: el Component depende directamente del sistema de fixtures de Playwright
class BookingsPage {
  constructor(private page: Page) {} // ¿De dónde viene page?
}

// El test debe cablear todo manualmente
test('example', async ({ page }) => {
  const bookingsPage = new BookingsPage(page);
  // ¿Y las llamadas a la API? ¿Necesito otra instancia?
});
```

**Problemas:**
- Los Components están fuertemente acoplados a Playwright
- No hay contexto compartido entre operaciones de UI y API
- Los tests se llenan de boilerplate

### Anti-patrón: inyección por setter

```typescript
// MAL: el patrón setter rompe la inmutabilidad
class ApiClient {
  private request?: APIRequestContext;

  setRequestContext(request: APIRequestContext) {
    this.request = request;
  }
}
```

**Problemas:**
- El objeto puede usarse antes de inicializarse
- El estado mutable complica el debugging
- Sin seguridad en tiempo de compilación

---

## La solución KATA

### Principio central: un único punto de entrada, contexto compartido

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Playwright Test Runner                          │
│                                                                      │
│  ┌─────────┐     ┌─────────┐                                        │
│  │  page   │     │ request │  ← Playwright creates these lazily     │
│  └────┬────┘     └────┬────┘                                        │
│       │               │                                              │
│       └───────┬───────┘                                              │
│               ▼                                                      │
│  ┌────────────────────────┐                                          │
│  │   TestContextOptions   │  ← Interface for driver passing         │
│  │  { page?, request? }   │                                          │
│  └───────────┬────────────┘                                          │
│              │                                                       │
└──────────────┼───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        KATA Architecture                             │
│                                                                      │
│  Layer 1: TestContext                                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  _page?: Page          (stored, not used directly)             │  │
│  │  _request?: APIRequestContext                                  │  │
│  │  config, faker, env    (shared utilities)                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│              │ extends                                               │
│              ▼                                                       │
│  Layer 2: Base Classes                                               │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │       UiBase           │    │       ApiBase          │           │
│  │  get page(): Page      │    │  get request(): API... │           │
│  │  (validates + returns) │    │  (validates + returns) │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ extends                    │ extends                  │
│              ▼                            ▼                          │
│  Layer 3: Components (ATCs)                                          │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │     LoginPage          │    │     BookingsApi        │           │
│  │     BookingsPage       │    │     InvoicesApi        │           │
│  │  (uses this.page)      │    │  (uses this.request)   │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ composed by                │ composed by              │
│              ▼                            ▼                          │
│  Layer 4: Fixtures                                                   │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │      UiFixture         │    │      ApiFixture        │           │
│  │  .login, .bookings     │    │  .bookings, .invoices  │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ combined in                │                          │
│              └──────────┬─────────────────┘                          │
│                         ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    FullTestFixture                             │  │
│  │  .ui  → UiFixture                                              │  │
│  │  .api → ApiFixture                                             │  │
│  │  .page → Direct access for assertions                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Detalles de implementación

### 1. La interface TestContextOptions

El puente entre Playwright y KATA:

```typescript
// tests/components/TestContext.ts

export interface TestContextOptions {
  page?: Page;
  request?: APIRequestContext;
  environment?: Environment;
}
```

**¿Por qué opcional (`?`)?**
- Los tests de API no necesitan `page`
- Los scripts de setup podrían no necesitar `request`
- Flexibilidad para distintos escenarios de test

### 2. TestContext: la base

```typescript
export class TestContext {
  // Protected: accesible por las subclases, no por código externo
  protected readonly _page?: Page;
  protected readonly _request?: APIRequestContext;

  // Utilidades públicas disponibles para todos los components
  readonly env: Environment;
  readonly config = config;
  readonly faker = faker;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }
}
```

**Decisiones de diseño clave:**
- `_page` y `_request` son **protected**: solo las base classes las exponen vía getters
- `readonly`: inmutable después de la construcción
- `options = {}`: el objeto vacío por defecto permite instanciar sin argumentos

### 3. Base Classes: acceso validado

```typescript
// tests/components/ui/UiBase.ts

export class UiBase extends TestContext {
  constructor(options: TestContextOptions) {
    super(options);
  }

  get page(): Page {
    if (!this._page) {
      throw new Error(
        'Page is not available. Ensure you are using the `ui` fixture ' +
        'or passed { page } in TestContextOptions.'
      );
    }
    return this._page;
  }
}
```

```typescript
// tests/components/api/ApiBase.ts

export class ApiBase extends TestContext {
  constructor(options: TestContextOptions) {
    super(options);
  }

  get request(): APIRequestContext {
    if (!this._request) {
      throw new Error(
        'Request context is not available. Ensure you are using the `api` fixture ' +
        'or passed { request } in TestContextOptions.'
      );
    }
    return this._request;
  }
}
```

**¿Por qué getters en vez de acceso directo a la propiedad?**
1. **Validación en runtime**: mensajes de error claros cuando está mal configurado
2. **Encapsulamiento**: el código externo no puede setear estas propiedades
3. **Type narrowing**: el tipo de retorno es `Page`, no `Page | undefined`

### 4. TestFixture: el punto de entrada

```typescript
// tests/components/TestFixture.ts

export const test = base.extend<{
  test: FullTestFixture;
  api: ApiFixture;
  ui: UiFixture;
}>({
  // Fixture completo: UI + API con contexto compartido
  test: async ({ page, request }, use) => {
    const fixture = new FullTestFixture(page, request);
    await use(fixture);
  },

  // Fixture solo-API: NO se abre browser
  api: async ({ request }, use) => {
    const apiFixture = new ApiFixture({ request });
    await use(apiFixture);
  },

  // Fixture UI: tiene page y request para tests híbridos
  ui: async ({ page, request }, use) => {
    const uiFixture = new UiFixture({ page, request });
    await use(uiFixture);
  },
});
```

---

## Inicialización lazy de fixtures de Playwright

### Cómo funciona

De la [documentación de Playwright Test Fixtures](https://playwright.dev/docs/test-fixtures):

> "Los fixtures se crean bajo demanda. Solo se crean los fixtures que realmente requiere un test."

Esto significa:

```typescript
// Este test NUNCA abre un browser
test('API test', async ({ api }) => {
  // Solo se inicializa `request`, no `page`
  await api.bookings.getAll();
});

// Este test abre un browser
test('E2E test', async ({ ui }) => {
  // Se inicializan tanto `page` como `request`
  await ui.login.authenticate(user, password);
});
```

### Prueba del lazy loading

```typescript
// En TestFixture.ts

api: async ({ request }, use) => {
  //        ^^^^^^^^^ Solo se solicita request a Playwright
  //                  Sin dependencia de `page` = sin browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},
```

**Impacto en el rendimiento:**
- Tests de API: ~50ms de arranque (sin browser)
- Tests de UI: ~2-5s de arranque (lanzamiento del browser)

### Comparación de la salida del test runner

```bash
# Solo tests de API
$ bun run test:integration
Running 50 tests...
Finished in 4.2s  # Rápido: sin browser

# Tests E2E
$ bun run test:e2e
Running 20 tests...
Finished in 45s  # Más lento: operaciones de browser
```

---

## Contexto compartido en tests E2E

### El problema: contextos separados

```typescript
// MAL: API y UI tienen contextos distintos
test('create via API, verify via UI', async ({ api, ui }) => {
  // La API usa un contexto de request
  const booking = await api.bookings.create(data);

  // La UI usa una sesión distinta: ¡podría no ver el booking!
  await ui.bookings.navigateTo();
});
```

### La solución: fixture unificado

```typescript
// BIEN: mismo contexto para ambas operaciones
test('create via API, verify via UI', async ({ test: fixture }) => {
  // Ambos usan el mismo contexto de request (mismo auth token)
  const booking = await fixture.api.bookings.create(data);

  // La UI comparte el contexto: garantizado que verá el booking
  await fixture.ui.bookings.navigateToBooking(booking.id);
});
```

### Cómo funciona el contexto compartido

```typescript
class FullTestFixture extends TestContext {
  api: ApiFixture;
  ui: UiFixture;

  constructor(page: Page, request: APIRequestContext, environment?: Environment) {
    super({ page, request, environment });

    // El MISMO objeto options se pasa a ambos fixtures
    const options = { page, request, environment: this.env };
    this.api = new ApiFixture(options);
    this.ui = new UiFixture(options);
  }
}
```

---

## Visualización del flujo de instancias

### Para un test E2E

```
1. Playwright crea `page` y `request`
   │
2. TestFixture.ts los recibe en la función de fixture
   │
   └─► const fixture = new FullTestFixture(page, request)
       │
3. Constructor de FullTestFixture
   │
   ├─► super({ page, request }) → TestContext almacena _page, _request
   │
   ├─► const options = { page, request, environment }
   │
   ├─► new ApiFixture(options)
   │   │
   │   └─► Pasa las mismas options a ApiBase → BookingsApi, InvoicesApi...
   │
   └─► new UiFixture(options)
       │
       └─► Pasa las mismas options a UiBase → LoginPage, BookingsPage...

4. Todos los components comparten las MISMAS instancias de page y request
```

### Para un test de API

```
1. Playwright crea SOLO `request` (sin browser)
   │
2. TestFixture.ts recibe request
   │
   └─► const apiFixture = new ApiFixture({ request })
       │
3. Constructor de ApiFixture
   │
   └─► Pasa { request } a todos los components de API

4. No hay page involucrada → No se abre browser → Ejecución rápida
```

---

## Buenas prácticas

### SÍ: pasar options a través de los constructores

```typescript
// El Component siempre recibe options en el constructor
export class BookingsPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }
}
```

### NO: crear Components sin contexto

```typescript
// MAL: ¿de dónde saldrá page?
const bookings = new BookingsPage();
```

### SÍ: usar el fixture apropiado

```typescript
// Test de API → usar el fixture `api`
test('get bookings', async ({ api }) => {
  await api.bookings.getAll();
});

// Test E2E → usar el fixture `ui`
test('view bookings page', async ({ ui }) => {
  await ui.bookings.navigateTo();
});

// Test híbrido → usar el fixture `test`
test('create via API, verify via UI', async ({ test: fixture }) => {
  const booking = await fixture.api.bookings.create(data);
  await fixture.ui.bookings.verifyExists(booking.id);
});
```

### NO: solicitar fixtures que no se usan

```typescript
// MAL: solicita page pero nunca la usa
test('API only', async ({ ui }) => {  // ¡ui solicita page!
  await ui.request.get('/api/bookings');  // Solo usa request
});

// BIEN: usar el fixture api para tests solo-API
test('API only', async ({ api }) => {
  await api.bookings.getAll();
});
```

---

## Resolución de problemas

### Error: "Page is not available"

**Causa**: usar un component de UI sin `page` en las options.

**Solución**: usar el fixture `ui` o `test` en vez de `api`:

```typescript
// Antes (incorrecto)
test('example', async ({ api }) => {
  await api.page.goto('/');  // Error: api no tiene page
});

// Después (correcto)
test('example', async ({ ui }) => {
  await ui.page.goto('/');
});
```

### Error: "Request context is not available"

**Causa**: usar un component de API sin `request` en las options.

**Solución**: asegurate de estar usando el fixture `api`, `ui` o `test`:

```typescript
// Los tres fixtures proveen request
test('example', async ({ api }) => {
  await api.bookings.getAll();  // Funciona
});
```

### El browser se abre en los tests de API

**Causa**: el fixture solicita `page` aunque el test no la use.

**Verificar**: la definición de tu fixture en TestFixture.ts:

```typescript
// INCORRECTO: solicita page innecesariamente
api: async ({ page, request }, use) => {  // <-- page aquí dispara el browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},

// CORRECTO: solo se necesita request
api: async ({ request }, use) => {  // <-- Sin page, sin browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},
```

---

## Resumen

| Principio | Implementación |
|-----------|----------------|
| **Única fuente de verdad** | Playwright crea los drivers una sola vez |
| **Inyección por constructor** | Las options se pasan en la instanciación |
| **Inmutabilidad** | propiedades `readonly`, sin setters |
| **Acceso validado** | getters con validaciones en runtime |
| **Inicialización lazy** | solo se crean los fixtures solicitados |
| **Contexto compartido** | el mismo objeto options para todos los components |

---

## Documentos relacionados

| Documento | Ubicación | Propósito |
|----------|----------|---------|
| KATA Fundamentals | `/docs/testing/test-architecture/kata-fundamentals.md` | Filosofía de KATA y diseño de components |
| KATA Architecture | `/test-automation` skill -- `references/kata-architecture.md` | Estructura de capas y referencia del proyecto |
| TypeScript Patterns | `/test-automation` skill -- `references/typescript-patterns.md` | Patrones de código y principios DRY |
| KATA AI Guide | `/test-automation` skill -- `references/kata-ai-index.md` | Referencia rápida para agentes de IA |

### Código fuente

| Archivo | Propósito |
|------|---------|
| `tests/components/TestContext.ts` | Capa 1: interface TestContextOptions |
| `tests/components/ui/UiBase.ts` | Capa 2: getter de Page con validación |
| `tests/components/api/ApiBase.ts` | Capa 2: getter de Request con validación |
| `tests/components/TestFixture.ts` | Capa 4: definiciones de fixtures de Playwright |

---

**Última actualización**: febrero de 2026
