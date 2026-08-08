# KATA: Component Action Test Architecture

> _Traducción al español de [kata-fundamentals.md](kata-fundamentals.md). El original en inglés es la fuente de verdad; ante discrepancia, prevalece el inglés._

**Component Action Test Architecture**

> _"Como un kata en las artes marciales, donde cada movimiento se practica repetidamente hasta la perfección, la arquitectura KATA convierte las acciones del sistema en bloques reutilizables y precisos."_

---

> **Nota**: Este es el **documento de fundamentos conceptuales** de KATA (Component Action Test Architecture).
> Este documento es **solo de referencia** — provee contexto filosófico y conceptual.
> **Los agentes de IA NO deberían cargarlo automáticamente** — usá las guías TAE en su lugar.
>
> Para guías específicas de implementación (obligatorias para la IA), cargá el skill `/test-automation`. Su directorio `references/` incluye:
>
> - **AI Entry Point**: `references/kata-ai-index.md`
> - **Architecture**: `references/kata-architecture.md`
> - **Standards**: `references/automation-standards.md`
>
> Todos los ejemplos de código usan **TypeScript + Playwright + Bun**.

---

## 1. Filosofía y Visión

### ¿Por qué existe KATA?

La automatización de tests tradicional enfrenta problemas recurrentes:

- **Duplicación de código**: escribir el mismo flujo múltiples veces a través de distintos tests
- **Mantenimiento costoso**: los cambios en el sistema rompen docenas de tests
- **Desconexión del negocio**: los tests no mapean directamente a los test cases documentados
- **Falta de visibilidad**: no sabés qué test cases pasaron o fallaron de forma independiente a los tests
- **Arquitectura poco clara**: responsabilidades mezcladas entre la lógica del test, la interacción con el sistema y las utilidades

KATA resuelve estos problemas mediante dos estrategias complementarias:

1. **Component Strategy**: organiza el código en capas claras con dependency injection
2. **Action Strategy**: convierte los test cases en acciones reutilizables con trazabilidad automática

### Qué problemas resuelve KATA

- **Reusabilidad escalable**: las acciones (ATC) se comparten entre múltiples tests
- **Trazabilidad directa**: cada acción mapea 1:1 a un test case en tu Test Management Tool
- **Arquitectura limpia**: separación clara entre context, base components, componentes específicos y tests
- **Visibilidad granular**: reportes que muestran qué acciones pasaron o fallaron, no solo qué tests
- **Mantenimiento eficiente**: los cambios en la funcionalidad afectan a un único componente
- **Flexibilidad**: soporte nativo tanto para UI como para API con la misma filosofía

---

## 2. Conceptos Fundamentales

### 2.1 ATC (Acceptance Test Case)

Un **ATC** es un acceptance test case que representa una **unidad funcional** del sistema.

**Características clave:**

- Mapea 1:1 a un test case en Jira/Xray, TestRail u otro Test Management Tool
- Contiene pasos, datos y resultados esperados
- Es reutilizable entre múltiples tests
- Tiene assertions fijas embebidas
- Se ejecuta como un bloque atómico que pasa o falla

**Ejemplo conceptual:**

```
ATC: Crear usuario exitosamente
├── Pasos: POST /users con datos válidos
├── Datos: name, email, password
└── Resultados esperados:
    ├── Status 201
    ├── Usuario devuelto con ID
    └── El usuario existe en la base de datos
```

### 2.2 Shared Action

Una **Shared Action** es un ATC implementado como un método reutilizable en el código.

**Criterios de granularidad:**

- Una acción debería representar una **unidad funcional cohesiva** del sistema
- Puede involucrar una o múltiples interacciones si son conceptualmente inseparables
- NO debería ser tan grande que parezca un test completo
- NO debería ser tan pequeña que pierda significado de negocio

**Ejemplos correctos:**

- ✅ `login_successfully(username, password)` — una funcionalidad completa
- ✅ `select_flight_dates(departure, arrival)` — dos campos que forman una unidad
- ✅ `refund_payment_successfully(payment_id, amount)` — operación de negocio completa

**Ejemplos incorrectos:**

- ❌ `open_menu_panel()` — demasiado pequeño, es una interacción técnica
- ❌ `complete_purchase_journey()` — demasiado grande, es un flujo E2E completo

### 2.3 Component

Un **Component** es una clase que encapsula funcionalidad relacionada del sistema bajo prueba.

**Tipos de Component:**

- **API Components**: agrupan endpoints relacionados (UsersApi, LoansApi, PaymentsApi)
- **UI Components**: agrupan elementos de una página o widget (LoginPage, CheckoutPage, HeaderNav)

Los Components siguen el **Component Object Model (COM)** y contienen ATC como métodos.

### 2.4 Fixture

Un **Fixture** es el punto de entrada unificado que agrupa todos los components mediante **Dependency Injection** (inyección de dependencias).

**Propósito:**

- Instanciar todos los components una sola vez
- Proveer acceso a los components desde un único objeto
- Simplificar los imports en los tests
- Inyectar dependencias comunes (TestContext, Base Classes)

**Ejemplo de uso:**

```typescript
test('user journey', async ({ kata }) => {
  const user = await kata.api.users.createUserSuccessfully(data);
  await kata.ui.login.loginSuccessfully(user.email, user.password);
  await kata.ui.dashboard.verifyWelcomeMessage(user.name);
});
```

### 2.5 Fixed Assertions vs Test-Level Assertions

KATA define dos niveles de validaciones:

**Fixed Assertions**

- Viven **dentro** de los ATC
- Validan que la acción funcionó correctamente por sí misma
- Se ejecutan siempre que se usa el ATC, sin importar en qué test
- Garantizan que el comportamiento de la acción es correcto

**Test-Level Assertions**

- Viven **en el test** que orquesta múltiples ATC
- Validan el resultado de combinar acciones
- Verifican el estado final del sistema después de un flujo completo
- Validan relaciones entre resultados de distintas acciones

**Ejemplo:**

```typescript
test('refund reduces balance', async ({ api }) => {
  // Acción 1: Crear préstamo (con fixed assertions internas)
  const [, loan] = await api.loans.createLoanSuccessfully({ amount: 1000 });

  // Acción 2: Procesar reembolso (con fixed assertions internas)
  await api.payments.refundPaymentSuccessfully({
    loanId: loan.id,
    amount: 200,
  });

  // Test-level assertion: validar el efecto combinado
  const [, updatedLoan] = await api.loans.getLoan(loan.id);
  expect(updatedLoan.balance).toBe(800);
});
```

### 2.6 Soft Fail

**Soft Fail** permite que un ATC falle pero el test continúe ejecutándose.

**Casos de uso:**

- Campos opcionales en formularios largos
- Validaciones no críticas en flujos E2E
- Tests exploratorios donde querés ver todas las fallas, no solo la primera

**Implementación:**

```typescript
@atc('JIRA-123', { softFail: true })
async fillOptionalSection(data: FormData) {
  // Si falla, el error se captura pero el test continúa
}
```

---

## 3. Arquitectura por Capas (Component Strategy)

KATA organiza el código en capas jerárquicas con responsabilidades claras.

### 3.1 Diagrama de Capas

```
┌─────────────────────────────────────────────────────┐
│                  Test Files Layer                   │
│       (auth.test.ts, checkout.test.ts)              │
└────────────────────┬────────────────────────────────┘
                     │ importa el fixture unificado
                     ▼
┌─────────────────────────────────────────────────────┐
│            Fixture Layer (Recomendada)              │
│   TestFixture (Unificado) - Punto de entrada DI     │
│   ├── api: ApiFixture                               │
│   └── ui: UiFixture (si hay page disponible)        │
└────────┬────────────────────────────────────────────┘
         │ instancia los components
         ▼
┌─────────────────────────────────────────────────────┐
│            Specific Components Layer                │
│    (UsersApi, LoansApi, LoginPage, CheckoutPage)    │
│              ← los ATC viven aquí                   │
└────────┬────────────────────────────────────────────┘
         │ hereda de
         ▼
┌─────────────────────────────────────────────────────┐
│               Base Components Layer                 │
│             (ApiBase, UiBase) - Helpers             │
└────────┬────────────────────────────────────────────┘
         │ hereda de
         ▼
┌─────────────────────────────────────────────────────┐
│              Test Context Layer                     │
│   (TestContext) - Config, Logger, HTTP, Faker       │
└─────────────────────────────────────────────────────┘
```

### 3.2 Capa 1: Test Context

**Propósito**: proveer configuración global y utilidades compartidas para cualquier tipo de test.

**Contenido:**

- Variables de entorno
- Configuración de entorno (local, staging, production)
- Generadores de datos (Faker)
- Utilidades transversales

**Implementación:**

```typescript
// tests/components/TestContext.ts
import { faker } from '@faker-js/faker';
import { config, type Environment } from '@config/variables';

export class TestContext {
  readonly config = config;
  readonly faker = faker;
  protected environment: Environment;

  constructor(environment?: Environment) {
    this.environment = environment ?? config.environment;
  }

  generateUserData() {
    return {
      name: this.faker.person.fullName(),
      email: `test_${Date.now()}_${this.faker.internet.email()}`,
      password: this.faker.internet.password({ length: 12 }),
    };
  }
}
```

**Cuándo agregar código aquí:**

- Necesitás algo disponible para **todos** los tipos de test (UI y API)
- Es configuración global o estado compartido
- No es específico de API ni de UI

### 3.3 Capa 2: Base Components

**Propósito**: proveer helpers y funcionalidad común para un tipo específico de interacción (API o UI).

#### ApiBase - Helpers REST

```typescript
// tests/components/api/ApiBase.ts
import { request, type APIResponse, type APIRequestContext } from '@playwright/test';
import { TestContext } from '@components/TestContext';

export class ApiBase extends TestContext {
  protected requestContext!: APIRequestContext;

  protected async apiGET<T>(endpoint: string): Promise<[APIResponse, T]> {
    const ctx = await this.getRequestContext();
    const response = await ctx.get(this.buildApiUrl(endpoint));
    const body = (await response.json()) as T;
    return [response, body];
  }

  protected async apiPOST<T, P>(endpoint: string, payload: P): Promise<[APIResponse, T, P]> {
    const ctx = await this.getRequestContext();
    const response = await ctx.post(this.buildApiUrl(endpoint), { data: payload });
    const body = (await response.json()) as T;
    return [response, body, payload];
  }

  private buildApiUrl(endpoint: string): string {
    return `${this.config.apiUrl}${endpoint}`;
  }

  private async getRequestContext(): Promise<APIRequestContext> {
    if (!this.requestContext) {
      this.requestContext = await request.newContext();
    }
    return this.requestContext;
  }
}
```

#### UiBase - Helpers de UI

```typescript
// tests/components/ui/UiBase.ts
import { type Page } from '@playwright/test';
import { TestContext } from '@components/TestContext';

export class UiBase extends TestContext {
  readonly page: Page;

  constructor(page: Page, environment?: Environment) {
    super(environment);
    this.page = page;
  }

  protected buildUrl(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  async goto(path: string = '/') {
    await this.page.goto(this.buildUrl(path));
  }
}
```

**Cuándo agregar código aquí:**

- Funcionalidad común a **todos** los API o UI components
- Wrappers de librerías (requests, Playwright)
- Métodos de utilidad técnica (logging, timeouts, retries)

### 3.4 Capa 3: Specific Components

**Propósito**: encapsular la funcionalidad de un área específica del sistema. **Los ATC viven aquí.**

#### API Components

```typescript
// tests/components/api/UsersApi.ts
import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@components/api/ApiBase';
import { atc } from '@utils/decorators';

interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
}

export class UsersApi extends ApiBase {
  /**
   * ATC: Crear usuario con datos válidos.
   * Fixed Validations: Status 201, ID presente, email correcto
   */
  @atc('USER-001')
  async createUserSuccessfully(
    payload: CreateUserPayload
  ): Promise<[APIResponse, User, CreateUserPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<User, CreateUserPayload>(
      '/users',
      payload
    );

    // Fixed Assertions
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.email).toBe(payload.email);

    return [response, body, sentPayload];
  }

  @atc('USER-002')
  async getUserSuccessfully(userId: string): Promise<[APIResponse, User]> {
    const [response, body] = await this.apiGET<User>(`/users/${userId}`);

    // Fixed Assertions
    expect(response.status()).toBe(200);
    expect(body.id).toBe(userId);

    return [response, body];
  }
}
```

#### UI Components

```typescript
// tests/components/ui/LoginPage.ts
import { expect, type Page } from '@playwright/test';
import { UiBase } from '@components/ui/UiBase';
import { atc } from '@utils/decorators';

interface Credentials {
  email: string;
  password: string;
}

export class LoginPage extends UiBase {
  // Locators inline (usados en múltiples ATC, extraídos al constructor)
  private readonly emailInput = () => this.page.locator('#email');
  private readonly passwordInput = () => this.page.locator('#password');
  private readonly submitButton = () => this.page.locator('button[type="submit"]');
  private readonly errorMessage = () => this.page.locator('.error-message');

  /**
   * ATC: Login con credenciales válidas.
   * Fixed Validations: Redirige al dashboard, sin errores
   */
  @atc('AUTH-001')
  async loginSuccessfully(credentials: Credentials): Promise<void> {
    await this.goto('/login');

    // ACT
    await this.emailInput().fill(credentials.email);
    await this.passwordInput().fill(credentials.password);
    await this.submitButton().click();

    // Fixed Assertions
    await expect(this.page).toHaveURL(/.*dashboard.*/);
    await expect(this.errorMessage()).not.toBeVisible();
  }
}
```

**Cuándo crear un nuevo component:**

- Agrupa endpoints relacionados (UsersApi, PaymentsApi)
- Agrupa elementos de una página o widget (CheckoutPage, HeaderNav)
- Representa un área funcional del sistema
- Contiene múltiples ATC relacionados

**Estructura interna de un component:**

- **Locators/Endpoints**: constantes al inicio (solo para UI)
- **ATC**: métodos públicos con el decorator `@atc`
- **Helpers privados**: métodos internos sin decorator (si es necesario)

### 3.5 Capa 4: Fixture (Dependency Injection)

**Propósito**: punto de entrada unificado que instancia todos los components y los hace accesibles desde un único objeto.

#### ApiFixture

```typescript
// tests/components/ApiFixture.ts
import { ApiBase } from '@components/api/ApiBase';
import { UsersApi } from '@components/api/UsersApi';
import { LoansApi } from '@components/api/LoansApi';
import { PaymentsApi } from '@components/api/PaymentsApi';

export class ApiFixture extends ApiBase {
  readonly users: UsersApi;
  readonly loans: LoansApi;
  readonly payments: PaymentsApi;

  constructor() {
    super();
    // Dependency Injection: cada componente hereda la config del padre
    this.users = new UsersApi();
    this.loans = new LoansApi();
    this.payments = new PaymentsApi();
  }
}
```

#### UiFixture

```typescript
// tests/components/UiFixture.ts
import { type Page } from '@playwright/test';
import { UiBase } from '@components/ui/UiBase';
import { LoginPage } from '@components/ui/LoginPage';
import { CheckoutPage } from '@components/ui/CheckoutPage';
import { DashboardPage } from '@components/ui/DashboardPage';

export class UiFixture extends UiBase {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;
  readonly dashboard: DashboardPage;

  constructor(page: Page) {
    super(page);
    // Dependency Injection: cada componente recibe page
    this.login = new LoginPage(page);
    this.checkout = new CheckoutPage(page);
    this.dashboard = new DashboardPage(page);
  }
}
```

**Principio de Dependency Injection:**

El Fixture implementa DI de la siguiente manera:

1. Recibe las dependencias en su constructor (env, page)
2. Instancia los components pasándoles esas dependencias
3. Los components NO crean sus propias dependencias
4. Resultado: desacoplamiento y testeabilidad

### 3.6 Capa 5: Test Files

**Propósito**: orquestar los ATC para validar flujos de negocio completos.

#### Configuración en conftest.py

```python
# conftest.py
import pytest
from components.api_fixture import ApiFixture
from components.page_fixture import PageFixture

@pytest.fixture(scope="session")
def env():
    return os.getenv("TEST_ENV", "dev")

@pytest.fixture(scope="function")
def api(env):
    """Fixture para tests de integración de API."""
    return ApiFixture(env)

@pytest.fixture(scope="function")
def ui(page, env):
    """Fixture para tests E2E con UI."""
    return PageFixture(page, env)
```

#### Integration Test (API)

```python
# tests/integration/test_loans.py

def test_refund_updates_balance(fixture):
    """
    Test de integración: Verificar que un reembolso actualiza el balance.

    Flujo:
        1. Crear préstamo
        2. Hacer reembolso
        3. Verificar el balance actualizado
    """
    # Acción 1: Crear préstamo (con fixed assertions)
    loan = fixture.api.loans.create_loan_successfully(
        user_id=123,
        amount=1000,
        term_months=12
    )

    # Acción 2: Procesar reembolso (con fixed assertions)
    refund = fixture.api.payments.refund_payment_successfully(
        loan_id=loan["id"],
        amount=200
    )

    # Test-level assertion: Validar el efecto combinado
    updated_loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert updated_loan["balance"] == 800, \
        f"Expected balance 800, got {updated_loan['balance']}"
```

#### E2E Test (UI + API)

```python
# tests/e2e/test_purchase_journey.py

def test_complete_purchase_journey(fixture):
    """
    Test E2E: Journey de compra completo.

    Flujo:
        1. Crear usuario vía API (setup rápido)
        2. Login vía UI
        3. Agregar producto al carrito vía UI
        4. Completar compra vía UI
        5. Verificar la orden vía API
    """
    # Setup: Crear usuario vía API (más rápido que por UI)
    user = fixture.api.users.create_user_successfully(
        name="Test User",
        email=f"test_{uuid4()}@example.com",
        password="SecurePass123"
    )

    # Login vía UI
    fixture.ui.login.login_successfully(user["email"], "SecurePass123")

    # Agregar producto
    fixture.ui.checkout.add_product_to_cart("Laptop Pro", quantity=1)

    # Completar compra
    order = fixture.ui.checkout.complete_purchase_successfully(
        payment_method="credit_card"
    )

    # Verificar vía API (más confiable que por UI)
    order_details = fixture.api.orders.get_order_successfully(order["id"])
    assert order_details["status"] == "completed"
    assert order_details["total_amount"] == 1500
```

---

## 4. Estructura de Directorios

```
project/
├── components/                      # Todos los components KATA
│   ├── testcontext.py              # Capa 1: Plumbing central
│   │
│   ├── api_fixture.py              # Capa 4: API Fixture (DI)
│   ├── ui_fixture.py               # Capa 4: UI Fixture (DI)
│   ├── test_fixture.py             # Capa 4: Fixture unificado (RECOMENDADO)
│   │
│   ├── api/                        # Capas 2 y 3: API Components
│   │   ├── api_base.py            # Capa 2: Helpers REST
│   │   ├── users_api.py           # Capa 3: Component con ATC
│   │   ├── loans_api.py           # Capa 3: Component con ATC
│   │   ├── payments_api.py        # Capa 3: Component con ATC
│   │   └── ...
│   │
│   └── ui/                         # Capas 2 y 3: UI Components
│       ├── ui_base.py             # Capa 2: Helpers de UI
│       ├── login_page.py          # Capa 3: Component con ATC
│       ├── checkout_page.py       # Capa 3: Component con ATC
│       ├── dashboard_page.py      # Capa 3: Component con ATC
│       └── ...
│
├── tests/                          # Capa 5: Test Files
│   ├── integration/               # Tests de integración (solo API)
│   │   ├── test_loans.py
│   │   ├── test_payments.py
│   │   └── ...
│   │
│   └── e2e/                       # Tests end-to-end (UI + API)
│       ├── test_purchase_journey.py
│       ├── test_user_onboarding.py
│       └── ...
│
├── utils/                         # Funciones auxiliares sin trazabilidad
│   ├── data_generators.py        # Helpers para generar datos
│   ├── validators.py             # Validadores custom
│   ├── decorators.py             # Decorator @atc y generación de reportes
│   └── tms_sync.py               # Sincronización con el TMS
│
├── config/                        # Configuración por entorno
│   ├── dev.yaml
│   ├── staging.yaml
│   └── prod.yaml
│
├── reports/                       # Reportes generados
│   └── atc_results.json
│
├── .env                          # Variables de entorno
├── conftest.py                    # Fixtures de Pytest
├── pytest.ini                     # Configuración de Pytest
└── requirements.txt               # Dependencias
```

---

## 5. Sistema de Trazabilidad (Action Strategy)

### 5.1 Decorator @atc

El decorator `@atc` es el mecanismo que conecta el código con el Test Management Tool.

**Propósito:**

- Mapear cada método ATC a su test case en Jira/Xray/TestRail
- Capturar los resultados de ejecución (pass/fail)
- Generar un reporte granular independiente de los tests
- Habilitar el soft-fail cuando sea necesario

**Implementación:**

```python
# utils/decorators.py
import functools
import json
from typing import Callable, Optional

# Variable global para almacenar resultados (thread-safe con locks)
from threading import Lock
ATC_RESULTS = {}
ATC_LOCK = Lock()

def atc(test_id: str, soft_fail: bool = False):
    """
    Decorator para marcar un método como ATC trazable.

    Args:
        test_id: ID del test case en el Test Management Tool
        soft_fail: Si es True, captura los errores pero permite continuar
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = {
                "test_id": test_id,
                "method": func.__name__,
                "status": None,
                "error": None,
                "executed_at": None
            }

            try:
                # Ejecutar el ATC
                from datetime import datetime
                result["executed_at"] = datetime.now().isoformat()

                return_value = func(*args, **kwargs)

                # El ATC pasó exitosamente
                result["status"] = "PASS"
                _store_result(test_id, result)

                return return_value

            except Exception as e:
                # El ATC falló
                result["status"] = "FAIL"
                result["error"] = str(e)
                _store_result(test_id, result)

                if soft_fail:
                    # Capturar el error pero continuar
                    print(f"⚠️  SOFT FAIL - {test_id}: {str(e)}")
                    return None
                else:
                    # Re-lanzar la excepción
                    raise

        return wrapper
    return decorator

def _store_result(test_id: str, result: dict):
    """Almacenar el resultado de forma thread-safe."""
    with ATC_LOCK:
        if test_id not in ATC_RESULTS:
            ATC_RESULTS[test_id] = []
        ATC_RESULTS[test_id].append(result)

def generate_atc_report(output_path: str = "atc_results.json"):
    """Generar reporte JSON con los resultados de todos los ATC."""
    with ATC_LOCK:
        with open(output_path, "w") as f:
            json.dump(ATC_RESULTS, f, indent=2)

    print(f"📊 ATC Report generated: {output_path}")
```

**Hook de Pytest para generar el reporte:**

```python
# conftest.py
import pytest
from utils.decorators import generate_atc_report

def pytest_sessionfinish(session, exitstatus):
    """Generar el reporte de ATC al final de la sesión de pytest."""
    generate_atc_report("reports/atc_results.json")
```

### 5.2 Uso del decorator

```python
# components/api/loans_api.py
from utils.decorators import atc

class LoansApi(ApiBase):

    @atc(test_id="LOAN-001")
    def create_loan_successfully(self, user_id: int, amount: float):
        """ATC trazable que siempre reporta su resultado."""
        # ... implementación con fixed assertions
        pass

    @atc(test_id="LOAN-002", soft_fail=True)
    def verify_optional_field(self, loan_id: int):
        """ATC con soft-fail: falla pero permite continuar."""
        # Si falla, se loguea pero no detiene el test
        pass
```

### 5.3 Formato del Reporte JSON

```json
{
  "LOAN-001": [
    {
      "test_id": "LOAN-001",
      "method": "create_loan_successfully",
      "status": "PASS",
      "error": null,
      "executed_at": "2025-01-29T10:30:45.123456"
    },
    {
      "test_id": "LOAN-001",
      "method": "create_loan_successfully",
      "status": "FAIL",
      "error": "AssertionError: Expected 201, got 500",
      "executed_at": "2025-01-29T10:35:12.789012"
    }
  ],
  "USER-001": [
    {
      "test_id": "USER-001",
      "method": "create_user_successfully",
      "status": "PASS",
      "error": null,
      "executed_at": "2025-01-29T10:28:30.456789"
    }
  ]
}
```

**Interpretación:**

- `LOAN-001` se ejecutó 2 veces: 1 pass, 1 fail
- `USER-001` se ejecutó 1 vez: 1 pass
- Cada ejecución tiene timestamp y detalles del error si falló

### 5.4 Integración con Test Management Tools

KATA soporta múltiples Test Management Tools. La plantilla está configurada para **Xray** (integración con Jira), pero podés cambiar fácilmente a TestRail u otras soluciones TMS.

```python
# utils/tms_sync.py
"""
Sistema de sincronización con Test Management Tools.

CONFIGURACIÓN ACTIVA: Xray Cloud
Para usar otro TMS, comentá el código de Xray y descomentá el que necesites.
"""
import requests
import json
import os
from datetime import datetime

def sync_results(report_path: str = "reports/atc_results.json"):
    """
    Sincronizar los resultados de los ATC con el Test Management Tool.

    Variables de entorno requeridas:
        AUTO_SYNC: "true" para habilitar la sincronización automática

        Para Xray Cloud (ACTIVO):
            XRAY_CLIENT_ID: Xray Client ID
            XRAY_CLIENT_SECRET: Xray Client Secret
            XRAY_PROJECT_KEY: Project key (ej.: "DEMO")
    """
    if not os.getenv("AUTO_SYNC") == "true":
        print("⏭️  Auto-sync disabled. Set AUTO_SYNC=true to enable.")
        return

    with open(report_path, "r") as f:
        results = json.load(f)

    # ==================== XRAY CLOUD (ACTIVO) ====================
    _sync_to_xray_cloud(results)

    # ==================== OTRAS OPCIONES (COMENTADAS) ====================
    # Descomentá el método que necesites y comentá el de Xray de arriba

    # _sync_to_testrail(results)
    # _sync_to_jira_customfield(results)
    # _sync_to_jira_transition(results)


# ============================================================
#                    XRAY CLOUD SYNC (ACTIVO)
# ============================================================

def _sync_to_xray_cloud(results: dict):
    """
    Sincronizar con Xray Cloud usando el formato JSON nativo.

    Documentación: https://docs.getxray.app/display/XRAYCLOUD/Import+Execution+Results
    """
    client_id = os.getenv("XRAY_CLIENT_ID")
    client_secret = os.getenv("XRAY_CLIENT_SECRET")
    project_key = os.getenv("XRAY_PROJECT_KEY")

    # 1. Autenticar y obtener el token
    auth_url = "https://xray.cloud.getxray.app/api/v2/authenticate"
    auth_payload = {
        "client_id": client_id,
        "client_secret": client_secret
    }

    auth_response = requests.post(auth_url, json=auth_payload)
    if auth_response.status_code != 200:
        print(f"❌ Xray authentication failed: {auth_response.text}")
        return

    token = auth_response.json()

    # 2. Preparar el payload en formato JSON de Xray
    xray_payload = {
        "info": {
            "project": project_key,
            "summary": f"KATA Execution - {os.getenv('BUILD_ID', datetime.now().strftime('%Y%m%d-%H%M%S'))}",
            "description": "Automated test execution via KATA Architecture"
        },
        "tests": []
    }

    # 3. Convertir los resultados de KATA al formato de Xray
    for test_id, executions in results.items():
        final_status = "PASS"
        last_error = None

        for execution in executions:
            if execution["status"] == "FAIL":
                final_status = "FAIL"
                last_error = execution.get("error", "Test failed")
                break

        xray_status = "PASSED" if final_status == "PASS" else "FAILED"

        test_entry = {
            "testKey": test_id,
            "status": xray_status,
            "comment": f"🤖 KATA ATC: {executions[0]['method']}\n"
                      f"📊 Executions: {len(executions)}\n"
                      f"⏱️  Last execution: {executions[-1]['executed_at']}"
        }

        if last_error:
            test_entry["comment"] += f"\n\n❌ Error:\n{last_error}"

        xray_payload["tests"].append(test_entry)

    # 4. Importar los resultados
    import_url = "https://xray.cloud.getxray.app/api/v2/import/execution"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.post(import_url, headers=headers, json=xray_payload)

    if response.status_code in [200, 201]:
        result = response.json()
        print(f"✅ Results synced to Xray Cloud successfully")
        print(f"   Test Execution: {result.get('key', 'N/A')}")
    else:
        print(f"❌ Xray sync failed: {response.status_code}")
        print(f"   {response.text}")


# ============================================================
#              TESTRAIL SYNC (COMENTADO - DISPONIBLE)
# ============================================================

# def _sync_to_testrail(results: dict):
#     """
#     Sincronizar con TestRail usando la API add_results_for_cases.
#
#     Variables de entorno:
#         TESTRAIL_URL: URL de tu instancia (ej.: https://company.testrail.io)
#         TESTRAIL_USER: Email del usuario
#         TESTRAIL_API_KEY: API Key de TestRail
#         TESTRAIL_PROJECT_ID: ID del proyecto
#         TESTRAIL_RUN_ID: (opcional) ID del test run, crea uno nuevo si no existe
#
#     Documentación: https://support.testrail.com/hc/en-us/articles/7077819312404
#     """
#     url = os.getenv("TESTRAIL_URL")
#     user = os.getenv("TESTRAIL_USER")
#     api_key = os.getenv("TESTRAIL_API_KEY")
#     project_id = os.getenv("TESTRAIL_PROJECT_ID")
#     run_id = os.getenv("TESTRAIL_RUN_ID")
#
#     # Si no hay run_id, crear un nuevo test run
#     if not run_id:
#         run_payload = {
#             "name": f"KATA Execution - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
#             "description": "Automated execution via KATA Architecture",
#             "include_all": True
#         }
#
#         create_url = f"{url}/index.php?/api/v2/add_run/{project_id}"
#         response = requests.post(
#             create_url,
#             auth=(user, api_key),
#             headers={"Content-Type": "application/json"},
#             json=run_payload
#         )
#
#         if response.status_code == 200:
#             run_id = response.json()["id"]
#             print(f"📊 Created TestRail run: {run_id}")
#         else:
#             print(f"❌ Failed to create run: {response.text}")
#             return
#
#     # Preparar los resultados
#     testrail_results = []
#
#     for test_id, executions in results.items():
#         final_status = "pass"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "fail"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         # status_id de TestRail: 1=Passed, 5=Failed
#         status_id = 1 if final_status == "pass" else 5
#
#         # Extraer el case_id numérico del test_id (ej.: "TC-123" → 123)
#         case_id = int(test_id.split("-")[-1])
#
#         comment = (
#             f"🤖 KATA ATC: {executions[0]['method']}\n"
#             f"📊 Executions: {len(executions)}\n"
#             f"⏱️  Duration: {executions[-1]['executed_at']}"
#         )
#
#         if error_msg:
#             comment += f"\n\n❌ Error:\n{error_msg}"
#
#         testrail_results.append({
#             "case_id": case_id,
#             "status_id": status_id,
#             "comment": comment
#         })
#
#     # Enviar los resultados
#     results_url = f"{url}/index.php?/api/v2/add_results_for_cases/{run_id}"
#     response = requests.post(
#         results_url,
#         auth=(user, api_key),
#         headers={"Content-Type": "application/json"},
#         json={"results": testrail_results}
#     )
#
#     if response.status_code == 200:
#         print(f"✅ Results synced to TestRail successfully")
#         print(f"   Test Run: {url}/index.php?/runs/view/{run_id}")
#     else:
#         print(f"❌ TestRail sync failed: {response.text}")


# ============================================================
#         JIRA CUSTOM FIELD SYNC (COMENTADO - DISPONIBLE)
# ============================================================

# def _sync_to_jira_customfield(results: dict):
#     """
#     Sincronizar con Jira actualizando un custom field + agregando comentarios.
#
#     Configuración de Jira:
#         1. Crear un custom field tipo "Select List (single choice)"
#         2. Nombre: "Test Status" (o similar)
#         3. Opciones: PASS, FAIL, BLOCKED, NOT_RUN
#         4. Obtener el ID del custom field (ej.: customfield_10100)
#
#     Variables de entorno:
#         ATLASSIAN_URL: URL de tu sitio Atlassian (ej.: https://company.atlassian.net)
#         ATLASSIAN_EMAIL: Email de la cuenta de Atlassian
#         ATLASSIAN_API_TOKEN: API token de Atlassian
#         JIRA_TEST_STATUS_FIELD: ID del custom field (ej.: customfield_10100)
#
#     Documentación: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
#     """
#     jira_url = os.getenv("ATLASSIAN_URL")
#     jira_user = os.getenv("ATLASSIAN_EMAIL")
#     jira_token = os.getenv("ATLASSIAN_API_TOKEN")
#     custom_field_id = os.getenv("JIRA_TEST_STATUS_FIELD", "customfield_10100")
#
#     auth = (jira_user, jira_token)
#     headers = {"Content-Type": "application/json"}
#
#     for test_id, executions in results.items():
#         final_status = "PASS"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "FAIL"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         # 1. Actualizar el custom field
#         update_url = f"{jira_url}/rest/api/3/issue/{test_id}"
#         update_payload = {
#             "fields": {
#                 custom_field_id: {"value": final_status}
#             }
#         }
#
#         response = requests.put(update_url, auth=auth, headers=headers, json=update_payload)
#
#         if response.status_code != 204:
#             print(f"❌ Failed to update {test_id}: {response.text}")
#             continue
#
#         # 2. Agregar un comentario con el historial de ejecución
#         comment_url = f"{jira_url}/rest/api/3/issue/{test_id}/comment"
#
#         comment_body = {
#             "body": {
#                 "type": "doc",
#                 "version": 1,
#                 "content": [
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {
#                                 "type": "text",
#                                 "text": f"🤖 KATA Execution Result\n",
#                                 "marks": [{"type": "strong"}]
#                             }
#                         ]
#                     },
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {"type": "text", "text": f"Status: {final_status}\n"},
#                             {"type": "text", "text": f"ATC Method: {executions[0]['method']}\n"},
#                             {"type": "text", "text": f"Executions: {len(executions)}\n"},
#                             {"type": "text", "text": f"Timestamp: {executions[-1]['executed_at']}"}
#                         ]
#                     }
#                 ]
#             }
#         }
#
#         if error_msg:
#             comment_body["body"]["content"].append({
#                 "type": "paragraph",
#                 "content": [
#                     {"type": "text", "text": "\n❌ Error Details:\n", "marks": [{"type": "strong"}]},
#                     {"type": "text", "text": error_msg}
#                 ]
#             })
#
#         comment_response = requests.post(comment_url, auth=auth, headers=headers, json=comment_body)
#
#         if comment_response.status_code == 201:
#             print(f"✅ Updated {test_id} → {final_status} (with comment)")
#         else:
#             print(f"⚠️  Updated {test_id} but failed to add comment")


# ============================================================
#      JIRA TRANSITION SYNC (COMENTADO - DISPONIBLE)
# ============================================================

# def _sync_to_jira_transition(results: dict):
#     """
#     Sincronizar con Jira ejecutando transiciones de workflow + agregando comentarios.
#
#     Configuración de Jira (opción recomendada con subtareas):
#         1. Crear un issue type "Test Suite"
#         2. Los test cases son subtareas de la suite
#         3. Las subtareas tienen un workflow con transiciones:
#            - "Mark as Pass" (id: 31)
#            - "Mark as Fail" (id: 41)
#         4. Estados finales: PASS, FAIL, BLOCKED
#
#     Variables de entorno:
#         ATLASSIAN_URL: URL de tu sitio Atlassian
#         ATLASSIAN_EMAIL: Email de la cuenta de Atlassian
#         ATLASSIAN_API_TOKEN: API token de Atlassian
#         JIRA_TRANSITION_PASS: ID de la transición a PASS (default: 31)
#         JIRA_TRANSITION_FAIL: ID de la transición a FAIL (default: 41)
#
#     Nota: Los IDs de transición varían según el workflow configurado.
#     Para obtenerlos: GET /rest/api/3/issue/{test_id}/transitions
#
#     Documentación: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post
#     """
#     jira_url = os.getenv("ATLASSIAN_URL")
#     jira_user = os.getenv("ATLASSIAN_EMAIL")
#     jira_token = os.getenv("ATLASSIAN_API_TOKEN")
#
#     transition_ids = {
#         "PASS": os.getenv("JIRA_TRANSITION_PASS", "31"),
#         "FAIL": os.getenv("JIRA_TRANSITION_FAIL", "41")
#     }
#
#     auth = (jira_user, jira_token)
#     headers = {"Content-Type": "application/json"}
#
#     for test_id, executions in results.items():
#         final_status = "PASS"
#         error_msg = None
#
#         for execution in executions:
#             if execution["status"] == "FAIL":
#                 final_status = "FAIL"
#                 error_msg = execution.get("error", "Test failed")
#                 break
#
#         target_transition_id = transition_ids[final_status]
#
#         # 1. Consultar las transiciones disponibles
#         transitions_url = f"{jira_url}/rest/api/3/issue/{test_id}/transitions"
#         response = requests.get(transitions_url, auth=auth)
#
#         if response.status_code != 200:
#             print(f"❌ Failed to get transitions for {test_id}")
#             continue
#
#         available = response.json()["transitions"]
#         transition_exists = any(t["id"] == target_transition_id for t in available)
#
#         if not transition_exists:
#             print(f"⚠️  Transition {target_transition_id} not available for {test_id}")
#             continue
#
#         # 2. Ejecutar la transición
#         transition_payload = {
#             "transition": {"id": target_transition_id}
#         }
#
#         response = requests.post(transitions_url, auth=auth, headers=headers, json=transition_payload)
#
#         if response.status_code != 204:
#             print(f"❌ Failed to transition {test_id}: {response.text}")
#             continue
#
#         # 3. Agregar un comentario con los detalles de ejecución
#         comment_url = f"{jira_url}/rest/api/3/issue/{test_id}/comment"
#
#         comment_body = {
#             "body": {
#                 "type": "doc",
#                 "version": 1,
#                 "content": [
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {
#                                 "type": "text",
#                                 "text": f"🤖 KATA Execution - {final_status}\n",
#                                 "marks": [{"type": "strong"}]
#                             }
#                         ]
#                     },
#                     {
#                         "type": "paragraph",
#                         "content": [
#                             {"type": "text", "text": f"ATC: {executions[0]['method']}\n"},
#                             {"type": "text", "text": f"Executions: {len(executions)}\n"},
#                             {"type": "text", "text": f"Last run: {executions[-1]['executed_at']}\n"},
#                             {"type": "text", "text": f"Build: {os.getenv('BUILD_ID', 'Local')}"}
#                         ]
#                     }
#                 ]
#             }
#         }
#
#         if error_msg:
#             comment_body["body"]["content"].append({
#                 "type": "codeBlock",
#                 "attrs": {"language": "text"},
#                 "content": [
#                     {"type": "text", "text": f"Error:\n{error_msg}"}
#                 ]
#             })
#
#         comment_response = requests.post(comment_url, auth=auth, headers=headers, json=comment_body)
#
#         if comment_response.status_code == 201:
#             print(f"✅ Transitioned {test_id} → {final_status} (with comment)")
#         else:
#             print(f"⚠️  Transitioned {test_id} but failed to add comment")


# ============================================================
#                    HOOK PARA PYTEST
# ============================================================

# Hook en conftest.py para ejecutar automáticamente
def pytest_sessionfinish(session, exitstatus):
    """
    Hook de Pytest ejecutado al final de todos los tests.
    Genera el reporte y sincroniza con el TMS.
    """
    from utils.decorators import generate_atc_report

    # Generar el reporte JSON de los ATC
    generate_atc_report("reports/atc_results.json")

    # Sincronizar con el TMS
    sync_results("reports/atc_results.json")
```

#### Configuración de variables de entorno

Creá un archivo `.env` en la raíz del proyecto:

```bash
# .env

# ===== Habilitar la sincronización automática =====
AUTO_SYNC=true

# ===== XRAY CLOUD (ACTIVO) =====
XRAY_CLIENT_ID=your_client_id_here
XRAY_CLIENT_SECRET=your_client_secret_here
XRAY_PROJECT_KEY=DEMO

# ===== TESTRAIL (DESHABILITADO) =====
# TESTRAIL_URL=https://company.testrail.io
# TESTRAIL_USER=user@company.com
# TESTRAIL_API_KEY=your_api_key_here
# TESTRAIL_PROJECT_ID=1
# TESTRAIL_RUN_ID=  # Opcional, crea uno nuevo si está vacío

# ===== JIRA DIRECT (DESHABILITADO) =====
# ATLASSIAN_URL=https://company.atlassian.net
# ATLASSIAN_EMAIL=user@company.com
# ATLASSIAN_API_TOKEN=your_api_token_here
#
# Para Custom Field:
# JIRA_TEST_STATUS_FIELD=customfield_10100
#
# Para Transiciones:
# JIRA_TRANSITION_PASS=31
# JIRA_TRANSITION_FAIL=41

# ===== CI/CD =====
BUILD_ID=${CI_BUILD_ID}  # Variable de CI/CD
```

#### Cambiar de TMS

Para cambiar de Xray a otro TMS:

1. **Comentá la línea activa**:

```python
# _sync_to_xray_cloud(results)  # Comentar Xray
```

2. **Descomentá el TMS que necesites**:

```python
_sync_to_testrail(results)  # Activar TestRail
```

3. **Configurá las variables de entorno correspondientes** en tu archivo `.env`

4. **Listo**: el framework ahora usa el nuevo TMS

---

## 6. Convenciones de Implementación

### 6.1 Nombres de ATC

**Patrón:**

```
{verbo}_{recurso}_{escenario}_{condición}
```

**Ejemplos:**

- `create_user_successfully`
- `delete_loan_with_invalid_id`
- `login_with_expired_credentials`
- `refund_payment_partially`

**Reglas:**

- Siempre en inglés (o español, según la convención del equipo)
- Verbos en infinitivo
- Descriptivos pero concisos
- Indicar si es escenario positivo (`successfully`) o negativo (`with_invalid_X`)

### 6.2 Nombres de Component

**API Components:**

- En plural: `UsersApi`, `LoansApi`, `PaymentsApi`
- Sufijo `Api`

**UI Components:**

- Singular o descriptivo: `LoginPage`, `CheckoutPage`, `DashboardPage`
- Sufijo `Page` para páginas completas
- Sin sufijo para widgets/componentes parciales: `HeaderNav`, `SidebarMenu`

### 6.3 Guía de Nomenclatura de Archivos

| Propósito             | Archivo            | Clase         |
| -------------------- | ------------------ | ------------- |
| Plumbing compartido   | `testcontext.py`   | `TestContext` |
| Helpers REST genéricos | `api/api_base.py`  | `ApiBase`     |
| API fixture          | `api_fixture.py`   | `ApiFixture`  |
| Helpers de UI genéricos | `ui/ui_base.py`    | `UiBase`      |
| UI fixture           | `ui_fixture.py`    | `UiFixture`   |
| Fixture unificado     | `test_fixture.py`  | `TestFixture` |
| API Component        | `api/users_api.py` | `UsersApi`    |
| UI Component         | `ui/login_page.py` | `LoginPage`   |

### 6.3 Estructura de un ATC

Todos los ATC deberían seguir el patrón **Arrange-Act-Assert**:

```python
@atc(test_id="RESOURCE-XXX")
def action_name(self, params):
    """
    Docstring descriptivo.

    Args:
        param: descripción

    Returns:
        type: descripción

    Fixed Validations:
        - Validación 1
        - Validación 2
    """
    # ARRANGE: Preparar los datos y el estado inicial
    payload = {...}
    initial_state = self.get_current_state()

    # ACT: Ejecutar la acción principal
    response = self._post("/endpoint", json=payload)

    # ASSERT: Fixed assertions (validaciones obligatorias)
    assert response.status_code == 201
    assert "id" in response.json()

    # Logging
    self.logger.info(f"✅ Action completed successfully")

    # Devolver el resultado para encadenamiento
    return response.json()
```

### 6.4 Qué Devolver desde un ATC

**Regla general:** devolvé lo que la siguiente acción pueda necesitar.

- Si creás un recurso → devolvé el objeto completo
- Si obtenés un recurso → devolvé el objeto completo
- Si modificás un recurso → devolvé el objeto actualizado
- Si eliminás un recurso → devolvé True o el status

**Ejemplo:**

```python
@atc(test_id="USER-001")
def create_user_successfully(self, name, email, password):
    # ... lógica ...
    return user  # Objeto completo para la siguiente acción

@atc(test_id="AUTH-001")
def login_successfully(self, email, password):
    # ... lógica ...
    return auth_token  # Token para autenticar los siguientes requests
```

### 6.5 Parametrización de ATC

Los ATC pueden ser parametrizables para cubrir múltiples escenarios con un único método:

```python
@atc(test_id="FLIGHT-001")
def select_flight_dates(
    self,
    departure_date: Optional[str] = None,
    arrival_date: Optional[str] = None
):
    """
    ATC: Seleccionar fechas de vuelo.

    Args:
        departure_date: Fecha de salida (opcional)
        arrival_date: Fecha de llegada (opcional)

    Permite simular:
        - Solo fecha de salida
        - Solo fecha de llegada
        - Ambas fechas
        - Ninguna fecha (validación de error)
    """
    if departure_date:
        self.page.fill("#departure", departure_date)

    if arrival_date:
        self.page.fill("#arrival", arrival_date)

    # Fixed assertions basadas en los parámetros
    if departure_date:
        assert self.page.input_value("#departure") == departure_date
```

---

## 7. Buenas Prácticas

### 7.1 Cuándo Usar Fixed Assertions vs Test-Level Assertions

**Usá Fixed Assertions para:**

- Validar que la acción funcionó correctamente (status code, respuesta válida)
- Verificar los efectos directos de la acción (recurso creado, estado cambiado)
- Asegurar las precondiciones de negocio (campos requeridos presentes)

**Usá Test-Level Assertions para:**

- Validar resultados que dependen de combinar múltiples acciones
- Verificar el estado final del sistema después de un flujo completo
- Comprobar relaciones entre datos de distintas acciones

### 7.2 Cuándo Usar Soft Fail

**Usá soft_fail=True cuando:**

- Validás campos opcionales en formularios largos
- Ejecutás tests exploratorios donde querés ver todas las fallas
- Implementás validaciones no críticas que no deberían detener el flujo
- Generás screenshots de múltiples páginas aunque una falle

**NO uses soft_fail cuando:**

- La falla implica que las acciones siguientes no tienen sentido
- Estás validando funcionalidad crítica
- En entornos de producción o staging críticos

### 7.3 Organización de Components

**Un component debería:**

- Agrupar ATC conceptualmente relacionados
- No tener más de 15-20 ATC (si crece, dividirlo)
- Tener un propósito claro reflejado en su nombre
- Ser independiente de otros components

**Señales de que necesitás dividir un component:**

- El archivo tiene más de 500 líneas
- Mezcla responsabilidades no relacionadas
- Es difícil encontrar un ATC específico
- El nombre del component no describe claramente su contenido

### 7.4 Separación API vs UI

**Principio:** API y UI permanecen **totalmente aisladas**.

**Por qué:**

- Los tests de integración (API) corren sin browser (más rápido)
- Los tests E2E pueden combinar ambos estratégicamente
- Autocomplete preciso: `api.` muestra endpoints, `ui.` muestra páginas
- Escalabilidad: agregar mobile no afecta a la API ni a la UI web

**En tests E2E:**

- Usá API para el setup rápido (crear datos de prueba)
- Usá UI para el journey que querés validar
- Usá API para verificaciones precisas (estado final)

```python
def test_purchase_journey(api, ui):
    # Setup vía API (rápido)
    user = api.users.create_user_successfully(...)
    product = api.products.create_product_successfully(...)

    # Journey vía UI (lo que queremos validar)
    ui.login.login_successfully(user["email"], password)
    ui.shop.add_to_cart(product["id"])
    order = ui.checkout.complete_purchase()

    # Verificación vía API (confiable)
    order_data = api.orders.get_order_successfully(order["id"])
    assert order_data["status"] == "completed"
```

### 7.5 Logging y Debugging

```python
@atc(test_id="LOAN-001")
def create_loan_successfully(self, user_id, amount):
    self.logger.info(f"🚀 Creating loan: user={user_id}, amount={amount}")

    response = self._post("/loans", json={...})

    if response.status_code != 201:
        self.logger.error(f"❌ Loan creation failed: {response.text}")

    assert response.status_code == 201

    loan = response.json()
    self.logger.info(f"✅ Loan created: id={loan['id']}")

    return loan
```

**Convención de emojis:**

- 🚀 Inicio de acción
- ✅ Acción exitosa
- ❌ Falla o error
- ⚠️ Advertencia o soft fail
- 📊 Reporte o estadística

---

## 8. Migración a KATA

Si tenés una suite existente y querés migrar a KATA:

### Fase 1: Identificar Candidatos a ATC

- Revisá tus tests actuales
- Identificá bloques de código que se repiten
- Mapeá esos bloques a test cases en Jira/Xray
- Priorizá los más reutilizados

### Fase 2: Crear la Estructura de Components

- Creá la estructura de directorios de KATA
- Implementá TestContext con la configuración actual
- Creá ApiBase o PageBase según sea necesario

### Fase 3: Extraer el Primer Component

- Elegí un área funcional (ej.: usuarios)
- Creá el component (UsersApi o LoginPage)
- Migrá los métodos como ATC
- Agregá los decorators @atc

### Fase 4: Implementar el Fixture

- Creá ApiFixture o PageFixture
- Instanciá el primer component
- Actualizá un test para que use el fixture

### Fase 5: Migrar Progresivamente

- Migrá un component a la vez
- Mantené los tests viejos funcionando en paralelo
- Validá que los nuevos ATC funcionen igual
- Eliminá el código legacy gradualmente

### Fase 6: Habilitar la Trazabilidad

- Implementá el decorator @atc
- Configurá la integración con el Test Management Tool
- Generá el primer reporte
- Validá la sincronización automática

---

## 9. Herramientas y Tecnologías

### Lenguajes Soportados

KATA es agnóstico al lenguaje. Implementaciones existentes:

- **Python** (pytest + requests + Playwright)
- **JavaScript/TypeScript** (Jest + axios + Playwright)
- **Java** (JUnit + RestAssured + Selenium)

### Frameworks de Testing

- **Python**: pytest
- **JavaScript**: Jest, Mocha, Vitest
- **Java**: JUnit, TestNG

### Clientes HTTP

- **Python**: requests, httpx
- **JavaScript**: axios, fetch
- **Java**: RestAssured, OkHttp

### Automatización de UI

- **Multi-lenguaje**: Playwright, Selenium
- **Python**: Playwright, Selenium
- **JavaScript**: Playwright, Puppeteer, Cypress

### Test Management Tools

- Jira + Xray
- Jira + Zephyr
- TestRail
- qTest
- PractiTest

### Reporting

- Allure
- ReportPortal
- Custom HTML Reports
- JSON Reports para integración

---

## 10. Casos de Uso Reales

### Caso 1: Sistema de Préstamos

```python
def test_loan_refund_flow(fixture):
    """
    Flujo: Crear préstamo → Hacer pago → Procesar reembolso
    Validar: Balance correcto en cada etapa
    """
    # Crear préstamo
    loan = fixture.api.loans.create_loan_successfully(
        user_id=123,
        amount=1000,
        term_months=12
    )
    assert loan["balance"] == 1000

    # Hacer pago
    payment = fixture.api.payments.process_payment_successfully(
        loan_id=loan["id"],
        amount=300
    )

    # Validar el balance después del pago
    loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert loan["balance"] == 700

    # Procesar reembolso
    refund = fixture.api.payments.refund_payment_successfully(
        payment_id=payment["id"],
        amount=100
    )

    # Validar el balance final
    loan = fixture.api.loans.get_loan_successfully(loan["id"])
    assert loan["balance"] == 800
```

### Caso 2: Checkout de E-commerce

```python
def test_complete_purchase(fixture):
    """Journey de compra completo con pago exitoso."""
    # Setup vía API
    user = fixture.api.users.create_user_successfully(
        name="John Doe",
        email="john@example.com"
    )

    # Login
    fixture.ui.login.login_successfully(user["email"], "password123")

    # Agregar productos
    fixture.ui.catalog.search_product("Laptop")
    fixture.ui.catalog.add_to_cart_successfully("Laptop Pro 15")

    # Checkout
    fixture.ui.cart.proceed_to_checkout()
    fixture.ui.checkout.fill_shipping_info({
        "address": "123 Main St",
        "city": "New York",
        "zip": "10001"
    })

    order = fixture.ui.checkout.complete_purchase_successfully(
        payment_method="credit_card"
    )

    # Verificación vía API
    order_data = fixture.api.orders.get_order_successfully(order["id"])
    assert order_data["status"] == "completed"
    assert order_data["user_id"] == user["id"]
    assert len(order_data["items"]) == 1
```

### Caso 3: Soft Fail en un Formulario Largo

```python
def test_multi_section_form(fixture):
    """Formulario con múltiples secciones opcionales."""
    fixture.ui.forms.navigate_to_application_form()

    # Sección obligatoria (sin soft fail)
    fixture.ui.forms.fill_personal_info_successfully({
        "name": "Jane",
        "email": "jane@example.com"
    })

    # Sección opcional (con soft fail)
    fixture.ui.forms.fill_optional_employment_info(
        employer="Acme Corp",
        position="Engineer"
    )  # Si falla, continúa

    # Otra sección opcional (con soft fail)
    fixture.ui.forms.fill_optional_education_info(
        university="MIT",
        degree="Computer Science"
    )  # Si falla, continúa

    # Submit final (debería funcionar aunque las secciones opcionales fallen)
    result = fixture.ui.forms.submit_application_successfully()
    assert result["status"] == "submitted"
```

---

## 11. Glosario

| Término                   | Definición                                                             |
| ------------------------- | ---------------------------------------------------------------------- |
| **ATC**                   | ATC — Acceptance Test Case                                             |
| **Shared Action**         | Un ATC implementado como un método reutilizable                        |
| **Component**             | Clase que encapsula funcionalidad relacionada del sistema              |
| **Fixture**               | Punto de entrada que agrupa components mediante Dependency Injection    |
| **Fixed Assertions**      | Validaciones embebidas en los ATC que se ejecutan siempre              |
| **Test-Level Assertions** | Validaciones en el test que verifican el flujo completo                |
| **Soft Fail**             | Permitir que un ATC falle sin detener la ejecución del test            |
| **COM**                   | Component Object Model - Patrón de organización modular                |
| **DI**                    | Dependency Injection - Patrón de inyección de dependencias             |
| **Base Component**        | Clase padre con helpers compartidos (ApiBase, PageBase)                |
| **Specific Component**    | Clase concreta con ATC (UsersApi, LoginPage)                           |
| **Test Context**          | Capa base con configuración global y utilidades                        |
| **Traceability**          | Mapeo 1:1 entre los ATC en el código y los test cases en el TMS        |

---

## 12. Recursos Adicionales

### Repositorios de Ejemplo

- KATA Python Template _(placeholder)_
- KATA JavaScript Template _(placeholder)_

### Artículos y Presentaciones

- "Introduction to KATA Architecture" _(pendiente)_
- "Migrating from Page Object Model to KATA" _(pendiente)_
- "Automated Traceability with KATA" _(pendiente)_

### Comunidad

- Discord: [KATA Community](https://discord.gg/kata) _(placeholder)_
- GitHub Discussions: comparte experiencias y buenas prácticas

---

## 13. Conclusión

La arquitectura KATA es más que un patrón de diseño: es una filosofía completa para la automatización de tests que:

✅ **Estructura tu código** en capas claras con responsabilidades definidas
✅ **Reutiliza acciones** mediante ATC compartidos entre múltiples tests
✅ **Conecta el código con el negocio** a través de la trazabilidad 1:1 con los test cases
✅ **Escala con tu proyecto** gracias al Component Object Model y la Dependency Injection
✅ **Visibilidad granular** de qué funcionalidades pasaron o fallaron
✅ **Flexibilidad** para manejar escenarios complejos con soft-fail
✅ **Mantiene tu suite limpia** evitando la duplicación y promoviendo la composición

Como un kata en las artes marciales, la arquitectura KATA te invita a practicar buenos hábitos repetidamente hasta que construir tests mantenibles y trazables se vuelva natural.

---

**Autor**: Elyer Maldonado
**Versión**: 1.0
**Fecha**: Octubre 2025
**Licencia**: MIT

---

_"El código bien estructurado es como un kata perfecto: cada movimiento tiene un propósito, y la práctica constante lleva a la maestría."_
