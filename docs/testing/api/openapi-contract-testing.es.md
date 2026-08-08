# OpenAPI con Zod: guía completa de contract testing de APIs

> _Traducción al español de [openapi-contract-testing.md](openapi-contract-testing.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

> Una guía didáctica sobre OpenAPI, zod-to-openapi y cómo usarlos para testing de API en proyectos TypeScript/Next.js.

---

## Tabla de contenidos

1. [¿Qué es OpenAPI?](#qué-es-openapi)
2. [¿Por qué Zod + OpenAPI?](#por-qué-zod--openapi)
3. [Arquitectura de la solución](#arquitectura-de-la-solución)
4. [Tipos de TypeScript para testing](#tipos-de-typescript-para-testing)
5. [Testing en repositorios separados](#testing-en-repositorios-separados)
6. [Flujo de trabajo recomendado](#flujo-de-trabajo-recomendado)
7. [Preguntas frecuentes](#preguntas-frecuentes)

---

## ¿Qué es OpenAPI?

OpenAPI (antes conocido como Swagger) es una **especificación estándar** para describir APIs REST de forma legible tanto por máquinas como por humanos.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ¿QUÉ ES OPENAPI?                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   OpenAPI es como un "contrato" que describe tu API:                        │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      openapi.json                                   │   │
│   │                                                                     │   │
│   │   • Endpoints disponibles (/api/checkout/session, etc.)            │   │
│   │   • Métodos HTTP (GET, POST, PATCH, DELETE)                        │   │
│   │   • Parámetros requeridos y opcionales                             │   │
│   │   • Estructura del request body                                    │   │
│   │   • Estructura del response body                                   │   │
│   │   • Códigos de error posibles                                      │   │
│   │   • Autenticación requerida                                        │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   BENEFICIOS:                                                               │
│   ✅ Documentación siempre actualizada                                      │
│   ✅ Generación automática de clientes (SDKs)                               │
│   ✅ Validación de request/response                                         │
│   ✅ Testing automatizado basado en la spec                                 │
│   ✅ Interoperabilidad con herramientas (Postman, MCP, etc.)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ejemplo de spec de OpenAPI

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0

paths:
  /api/checkout/session:
    post:
      summary: Create checkout session
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                booking_id:
                  type: string
                  format: uuid
              required: [booking_id]
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  checkout_url:
                    type: string
                  session_id:
                    type: string
```

---

## ¿Por qué Zod + OpenAPI?

El problema tradicional es que la documentación de la API se desincroniza del código:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROBLEMA: DOCUMENTACIÓN MANUAL                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FLUJO TRADICIONAL (❌ propenso a errores):                                │
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│   │   Código     │      │  Manual      │      │   openapi.yaml           │  │
│   │   route.ts   │ ──── │  escribir    │ ───► │   (¡se desactualiza!)    │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────┘  │
│                                                                             │
│   • El desarrollador cambia el código                                       │
│   • Se olvida de actualizar la documentación                               │
│   • QA prueba con una spec incorrecta                                      │
│   • Errores en producción 💥                                                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FLUJO CON ZOD-TO-OPENAPI (✅ siempre sincronizado):                       │
│                                                                             │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│   │  Zod Schema  │      │  Automática  │      │   OpenAPI Spec           │  │
│   │  (código)    │ ───► │  generación  │ ───► │   (¡siempre correcto!)   │  │
│   └──────────────┘      └──────────────┘      └──────────────────────────┘  │
│         │                                                                   │
│         │                                                                   │
│         ▼                                                                   │
│   ┌──────────────┐                                                          │
│   │  TypeScript  │  ← El mismo schema genera TIPOS y DOCUMENTACIÓN         │
│   │  Types       │                                                          │
│   └──────────────┘                                                          │
│                                                                             │
│   • Cambiás el schema de Zod                                                │
│   • Los tipos de TypeScript se actualizan automáticamente                  │
│   • La spec de OpenAPI se regenera automáticamente                         │
│   • QA siempre tiene la documentación correcta ✓                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Fuente única de verdad

```typescript
// ✅ Este schema de Zod es la ÚNICA fuente de verdad
const CreateCheckoutSessionSchema = z
  .object({
    booking_id: z.string().uuid(),
  })
  .openapi('CreateCheckoutSessionRequest');

// Genera automáticamente:
// 1. Tipo de TypeScript: type CreateCheckoutSessionRequest = { booking_id: string }
// 2. Schema de OpenAPI: { type: 'object', properties: { booking_id: { type: 'string', format: 'uuid' } } }
// 3. Validación en runtime: schema.parse(requestBody)
```

---

## Arquitectura de la solución

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ZOD-TO-OPENAPI                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   src/lib/openapi/                                                          │
│   │                                                                         │
│   ├── registry.ts          ← Configuración central de OpenAPI              │
│   │   • Seguridad (cookieAuth, apiKeyAuth)                                 │
│   │   • Metadatos (title, version, description)                            │
│   │   • Función generateOpenAPIDocument()                                  │
│   │                                                                         │
│   ├── schemas/                                                              │
│   │   ├── common.ts        ← Tipos reutilizables                           │
│   │   │   • UUIDSchema, TimestampSchema, ErrorResponseSchema               │
│   │   │                                                                     │
│   │   ├── checkout.ts      ← Schemas para /api/checkout/*                  │
│   │   │   • CreateCheckoutSessionRequestSchema                             │
│   │   │   • CreateCheckoutSessionResponseSchema                            │
│   │   │   • registry.registerPath(...)  ← Registra el endpoint             │
│   │   │                                                                     │
│   │   ├── bookings.ts      ← Schemas para /api/bookings/*                  │
│   │   ├── stripe.ts        ← Schemas para /api/stripe/*                    │
│   │   ├── mentors.ts       ← Schemas para /api/mentors/*                   │
│   │   ├── messages.ts      ← Schemas para /api/messages/*                  │
│   │   ├── users.ts         ← Schemas para /api/users/*                     │
│   │   ├── system.ts        ← Schemas para /api/cron/*, /api/email/*        │
│   │   │                                                                     │
│   │   └── index.ts         ← Exporta todos los schemas                     │
│   │                                                                         │
│   └── index.ts             ← Punto de entrada principal                    │
│       • Importa todos los schemas                                          │
│       • Exporta generateOpenAPIDocument()                                  │
│       • Exporta todos los tipos                                            │
│                                                                             │
│   src/app/api/openapi/                                                      │
│   │                                                                         │
│   └── route.ts             ← GET /api/openapi                              │
│       • Genera la spec dinámicamente                                       │
│       • Devuelve JSON con headers CORS                                     │
│                                                                             │
│   src/app/api-docu/                                                         │
│   │                                                                         │
│   ├── page.tsx             ← Página de documentación                       │
│   ├── redoc-viewer.tsx     ← Componente de Redoc                           │
│   └── api-doc-selector.tsx ← Selector Next.js / Supabase                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flujo de datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE GENERACIÓN                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. DEFINICIÓN                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  const Schema = z.object({                                         │    │
│   │    booking_id: z.string().uuid()                                   │    │
│   │  }).openapi('CreateCheckoutSessionRequest')                        │    │
│   │                                                                    │    │
│   │  registry.registerPath({                                           │    │
│   │    method: 'post',                                                 │    │
│   │    path: '/checkout/session',                                      │    │
│   │    request: { body: { schema: Schema } },                          │    │
│   │    responses: { 200: { schema: ResponseSchema } }                  │    │
│   │  })                                                                │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│   2. GENERACIÓN (en /api/openapi)                                          │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  const document = generateOpenAPIDocument()                        │    │
│   │  // Devuelve el objeto OpenAPI 3.0 completo                        │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                    │                                        │
│                                    ▼                                        │
│   3. CONSUMO                                                                │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │  • Redoc UI (/api-docu) → Documentación interactiva               │    │
│   │  • Postman → Importa la colección automáticamente                  │    │
│   │  • MCP OpenAPI Server → Expone endpoints como tools               │    │
│   │  • openapi-typescript → Genera tipos para testing                 │    │
│   │  • Playwright → Valida responses contra el schema                 │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tipos de TypeScript para testing

Esta es una de las preguntas más importantes: **¿cómo obtener tipos de TypeScript para testing automatizado?**

### Opción 1: importar los tipos directamente (mismo repositorio)

Cuando el código de testing está en el mismo repositorio que la aplicación:

```typescript
// tests/integration/checkout.spec.ts

// Importar los tipos directamente desde los schemas
import type { CreateCheckoutSessionRequest, CreateCheckoutSessionResponse } from '@/lib/openapi';

test('Create checkout session', async ({ request }) => {
  // TypeScript conoce la estructura exacta del request
  const requestBody: CreateCheckoutSessionRequest = {
    booking_id: '550e8400-e29b-41d4-a716-446655440000',
  };

  const response = await request.post('/api/checkout/session', {
    data: requestBody,
  });

  // TypeScript conoce la estructura exacta de la response
  const data: CreateCheckoutSessionResponse = await response.json();

  // El autocompletado funciona perfectamente
  expect(data.checkout_url).toContain('stripe.com');
  expect(data.session_id).toBeDefined();
});
```

### Opción 2: generar tipos desde OpenAPI (repositorio separado)

Cuando el código de testing está en un repositorio distinto, podés generar los tipos desde la spec de OpenAPI.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 GENERACIÓN DE TIPOS DESDE OPENAPI                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Herramienta: openapi-typescript                                           │
│   Instalación: npm install -D openapi-typescript                           │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  # Generar tipos desde la URL de la spec                            │   │
│   │  npx openapi-typescript http://localhost:3000/api/openapi \         │   │
│   │    --output ./src/types/api.d.ts                                    │   │
│   │                                                                     │   │
│   │  # O desde un archivo local                                         │   │
│   │  npx openapi-typescript ./openapi.json --output ./src/types/api.d.ts│   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Resultado: src/types/api.d.ts                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  export interface paths {                                           │   │
│   │    "/checkout/session": {                                           │   │
│   │      post: {                                                        │   │
│   │        requestBody: {                                               │   │
│   │          content: {                                                 │   │
│   │            "application/json": {                                    │   │
│   │              booking_id: string;                                    │   │
│   │            }                                                        │   │
│   │          }                                                          │   │
│   │        };                                                           │   │
│   │        responses: {                                                 │   │
│   │          200: {                                                     │   │
│   │            content: {                                               │   │
│   │              "application/json": {                                  │   │
│   │                checkout_url: string;                                │   │
│   │                session_id: string;                                  │   │
│   │              }                                                      │   │
│   │            }                                                        │   │
│   │          }                                                          │   │
│   │        }                                                            │   │
│   │      }                                                              │   │
│   │    }                                                                │   │
│   │  }                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Usar los tipos generados en los tests

```typescript
// tests/api/checkout.spec.ts

import type { paths } from '@/types/api';

// Extraer tipos específicos
type CreateCheckoutRequest =
  paths['/checkout/session']['post']['requestBody']['content']['application/json'];

type CreateCheckoutResponse =
  paths['/checkout/session']['post']['responses']['200']['content']['application/json'];

test('Create checkout session', async ({ request }) => {
  const body: CreateCheckoutRequest = {
    booking_id: '550e8400-e29b-41d4-a716-446655440000',
  };

  const response = await request.post('/api/checkout/session', { data: body });
  const data: CreateCheckoutResponse = await response.json();

  // TypeScript valida que accedas a las propiedades correctas
  expect(data.checkout_url).toBeDefined();
});
```

---

## Testing en repositorios separados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  ESCENARIO: REPOSITORIOS SEPARADOS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐          ┌─────────────────────┐                  │
│   │   REPO: app         │          │   REPO: qa-tests    │                  │
│   │   (desarrollo)      │          │   (automatización)  │                  │
│   │                     │          │                     │                  │
│   │   • Next.js app     │          │   • Playwright      │                  │
│   │   • Schemas de Zod  │          │   • API tests       │                  │
│   │   • OpenAPI spec    │          │   • E2E tests       │                  │
│   │                     │          │                     │                  │
│   │   GET /api/openapi  │◀─────────│   ¿Cómo obtener     │                  │
│   │   (endpoint)        │          │   los tipos?        │                  │
│   └─────────────────────┘          └─────────────────────┘                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SOLUCIÓN: pipeline de generación de tipos                                 │
│                                                                             │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │                                                                   │     │
│   │   1. El CI/CD del repo app publica la spec de OpenAPI            │     │
│   │      → Artifact en un GitHub Release                              │     │
│   │      → O endpoint público /api/openapi                            │     │
│   │                                                                   │     │
│   │   2. El repo qa-tests tiene un script de sync                    │     │
│   │      ┌─────────────────────────────────────────────────────────┐  │     │
│   │      │  # package.json                                         │  │     │
│   │      │  {                                                      │  │     │
│   │      │    "scripts": {                                         │  │     │
│   │      │      "sync-types": "npx openapi-typescript              │  │     │
│   │      │        https://staging.myapp.com/api/openapi            │  │     │
│   │      │        --output ./src/types/api.d.ts"                   │  │     │
│   │      │    }                                                    │  │     │
│   │      │  }                                                      │  │     │
│   │      └─────────────────────────────────────────────────────────┘  │     │
│   │                                                                   │     │
│   │   3. Ejecutar antes de los tests                                  │     │
│   │      ┌─────────────────────────────────────────────────────────┐  │     │
│   │      │  # CI pipeline                                          │  │     │
│   │      │  - run: npm run sync-types                              │  │     │
│   │      │  - run: npm run test                                    │  │     │
│   │      └─────────────────────────────────────────────────────────┘  │     │
│   │                                                                   │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Estrategias de sincronización

#### Estrategia 1: fetch dinámico (recomendada)

```typescript
// scripts/sync-api-types.ts
import { execSync } from 'child_process';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Generar tipos desde la spec
execSync(`npx openapi-typescript ${API_URL}/api/openapi --output ./src/types/api.d.ts`, {
  stdio: 'inherit',
});

console.log('✅ API types synchronized');
```

#### Estrategia 2: submódulo de Git

```bash
# El repo de QA incluye la spec como submódulo
git submodule add https://github.com/org/app.git specs/app

# Script que genera tipos desde la spec local
npx openapi-typescript ./specs/app/public/openapi.json --output ./src/types/api.d.ts
```

#### Estrategia 3: paquete NPM

```bash
# El repo de desarrollo publica un paquete con los tipos
npm publish @myorg/api-types

# El repo de QA lo instala
npm install @myorg/api-types

# Uso
import type { CreateCheckoutRequest } from '@myorg/api-types'
```

---

## Flujo de trabajo recomendado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE DESARROLLO CON OPENAPI                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   FASE 1: desarrollo                                                        │
│   ────────────────────                                                      │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  1. Diseñar   │      │  2. Crear     │      │  3. Escribir  │          │
│   │  endpoint     │ ───► │  Zod          │ ───► │  route.ts     │          │
│   │  (spec)       │      │  schema       │      │               │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   FASE 2: documentación (automática)                                        │
│   ──────────────────────────────────                                        │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  4. Commit    │      │  5. OpenAPI   │      │  6. TypeScript│          │
│   │  código       │ ───► │  genera       │ ───► │  tipos        │          │
│   │               │      │  automática   │      │  exportados   │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   FASE 3: testing                                                           │
│   ───────────────                                                           │
│                                                                             │
│   ┌───────────────┐      ┌───────────────┐      ┌───────────────┐          │
│   │  7. QA usa    │      │  8. Playwright│      │  9. CI/CD     │          │
│   │  tipos        │ ───► │  con tipos    │ ───► │  valida       │          │
│   │  generados    │      │  tests        │      │  todo         │          │
│   └───────────────┘      └───────────────┘      └───────────────┘          │
│                                                                             │
│   BENEFICIOS:                                                               │
│   ✅ Tipos siempre sincronizados con el código                              │
│   ✅ Errores detectados en compile time, no en runtime                      │
│   ✅ Autocompletado del IDE para requests y responses                       │
│   ✅ Documentación siempre actualizada                                      │
│   ✅ Tests más robustos y mantenibles                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Preguntas frecuentes

### 1. ¿Qué pasa si un desarrollador cambia el schema?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│   ESCENARIO: el desarrollador agrega un campo requerido                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ANTES:                                                                    │
│   const Schema = z.object({ booking_id: z.string() })                      │
│                                                                             │
│   DESPUÉS:                                                                  │
│   const Schema = z.object({                                                 │
│     booking_id: z.string(),                                                 │
│     user_email: z.string().email()  ← NUEVO campo requerido                │
│   })                                                                        │
│                                                                             │
│   ¿QUÉ PASA?                                                                │
│                                                                             │
│   1. La spec de OpenAPI se actualiza automáticamente                        │
│   2. Si usás tipos generados (openapi-typescript):                          │
│      - Al regenerar, el tipo cambia                                        │
│      - TypeScript marca ERROR en los tests que no incluyen user_email      │
│      - ✅ DETECTÁS EL PROBLEMA ANTES DE CORRER LOS TESTS                   │
│                                                                             │
│   3. Si usás tipos importados del mismo repo:                               │
│      - El tipo ya cambió en el mismo commit                                │
│      - TypeScript marca ERROR inmediatamente                               │
│      - ✅ DETECTÁS EL PROBLEMA EN EL MISMO PR                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. ¿Cómo validar que la response real coincide con el schema?

```typescript
// Podés usar Zod para validar en runtime
import { CreateCheckoutSessionResponseSchema } from '@/lib/openapi';

test('Response matches schema', async ({ request }) => {
  const response = await request.post('/api/checkout/session', {
    data: { booking_id: 'uuid' },
  });

  const data = await response.json();

  // Zod valida que la response coincida con el schema
  const result = CreateCheckoutSessionResponseSchema.safeParse(data);

  if (!result.success) {
    console.error('Schema validation failed:', result.error.format());
  }

  expect(result.success).toBe(true);
});
```

### 3. ¿Cómo manejar versiones de la API?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VERSIONADO DE LA API                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   OPCIÓN 1: versión en la URL                                               │
│   /api/v1/checkout/session                                                  │
│   /api/v2/checkout/session                                                  │
│                                                                             │
│   OPCIÓN 2: versión en el header                                            │
│   X-API-Version: 2025-01-29                                                 │
│                                                                             │
│   OPCIÓN 3: versionado semántico en OpenAPI                                 │
│   openapi: 3.0.3                                                            │
│   info:                                                                     │
│     version: 2.1.0  ← MAJOR.MINOR.PATCH                                    │
│                                                                             │
│   RECOMENDACIÓN:                                                            │
│   • Para breaking changes: incrementar la versión MAJOR                    │
│   • Mantener retrocompatibilidad cuando sea posible                        │
│   • Documentar los cambios en el CHANGELOG                                 │
│   • Generar tipos para cada versión si hace falta                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4. ¿Cómo integrar con MCP para testing con IA?

```json
{
  "mcpServers": {
    "nextjs-api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api",
        "OPENAPI_SPEC_PATH": "http://localhost:3000/api/openapi"
      }
    }
  }
}
```

> El MCP es de solo-lectura de schema (schema-read-only): NO inyectes un header de autenticación (`API_HEADERS`) para el flujo de este repo. Los requests autenticados se ejecutan vía curl con un token de `bun run api:login` (→ `.auth/tokens.env`).

La IA ahora puede (solo-lectura de schema — el MCP no ejecuta):

- Ver todos los endpoints disponibles
- Conocer los parámetros requeridos
- Construir requests con el formato correcto (para ejecutar vía curl)
- Entender las responses esperadas

### 5. ¿Qué herramientas puedo usar con la spec de OpenAPI?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ECOSISTEMA DE OPENAPI                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   DOCUMENTACIÓN                                                             │
│   ├── Redoc          → Documentación estática y elegante                   │
│   ├── Swagger UI     → Documentación interactiva con "Try it"              │
│   └── Stoplight      → Documentación colaborativa                          │
│                                                                             │
│   TESTING                                                                   │
│   ├── Postman        → Importa la colección desde la spec                  │
│   ├── Insomnia       → Importa la colección desde la spec                  │
│   ├── Dredd          → Contract testing automático                         │
│   └── Prism          → Mock server desde la spec                           │
│                                                                             │
│   GENERACIÓN DE CÓDIGO                                                      │
│   ├── openapi-typescript     → Tipos de TypeScript                         │
│   ├── openapi-generator      → SDKs en múltiples lenguajes                │
│   └── orval                  → Cliente React Query/Axios                   │
│                                                                             │
│   IA/AUTOMATIZACIÓN                                                         │
│   ├── MCP OpenAPI Server     → Expone endpoints como tools                │
│   └── LangChain              → Tools para agentes                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PUNTOS CLAVE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. ZOD ES LA FUENTE DE VERDAD                                             │
│      • Definís los schemas una sola vez                                     │
│      • Genera los tipos de TypeScript automáticamente                       │
│      • Genera la spec de OpenAPI automáticamente                            │
│      • Valida los requests en runtime                                       │
│                                                                             │
│   2. OPENAPI HABILITA TODO EL ECOSISTEMA                                    │
│      • Documentación siempre actualizada                                    │
│      • Importar a Postman/Insomnia                                          │
│      • Testing con MCP/IA                                                   │
│      • Generación de tipos para repos separados                             │
│                                                                             │
│   3. TIPOS = DETECCIÓN TEMPRANA DE ERRORES                                  │
│      • TypeScript detecta breaking changes                                  │
│      • Errores en compile time, no en runtime                               │
│      • Tests más robustos y mantenibles                                     │
│                                                                             │
│   4. FLUJO RECOMENDADO                                                      │
│      • Mismo repo: importar los tipos directamente                          │
│      • Repos separados: generar los tipos desde la spec                     │
│      • CI/CD: regenerar los tipos antes de los tests                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujos relacionados

Este documento cubre el **Flujo B: generar OpenAPI desde Zod**. Existen otros flujos para trabajar con OpenAPI:

| Flujo               | Cuándo usarlo                             | Documento                                                      |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| **sync-openapi.ts** | El backend externo tiene la spec (otro repo)| Ver `scripts/sync-openapi.ts`                                 |
| **Zod-to-OpenAPI**  | Definís los schemas con Zod (este doc)    | Este documento                                                 |
| **MCP OpenAPI**     | La IA lee schema/endpoints desde cualquier spec (ejecución = curl) | [mcp-openapi.md](../../setup/mcp-openapi.md) |

---

## Recursos adicionales

- [zod-to-openapi GitHub](https://github.com/asteasolutions/zod-to-openapi)
- [openapi-typescript GitHub](https://github.com/drwpow/openapi-typescript)
- [Especificación de OpenAPI](https://spec.openapis.org/oas/v3.0.3)
- [Documentación de Redoc](https://redocly.com/docs/redoc/)
- [Documentación de Zod](https://zod.dev/)
