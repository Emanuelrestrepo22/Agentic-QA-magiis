# Frontend — MAGIIS Carrier (discovery Phase 3)

> Target activo: **magiis-fe-carrier-v2** (Angular 18). Legacy: magiis-fe (Angular 5). Fuente: survey read-only 2026-07-12.

## Build Configuration / Runtime
- **Angular 18.0.4**, NgModule-based (NO standalone; `standalone:true` = 0), bootstrap clásico `platformBrowserDynamic().bootstrapModule(AppModule)`. Angular Material 16 (skew). TS ~5.4, zone.js 0.14 (zoneful).
- Routing: `RouterModule.forRoot(routes)` lazy `loadChildren`, `PathLocationStrategy` (sin hash en código). NgRx store/effects presente (pero auth real vía `IdentityService` + localStorage).
- Base template **Velzon** siendo vaciado y re-apuntado al backend Magiis (`carrier.module.ts` marcado `/**MIGRACION!! */`).
- Control flow nuevo `@if/@for/@switch` (44 templates) → nodos condicionales entran/salen del DOM → Playwright: esperar por **presencia**, no visibilidad.

```bash
npm install
npm run start        # ng serve (:4202)
npm run build-uat    # -c=uat  → apps-uat
```

## Estado de migración (CRÍTICO para QA)
- **Migrado/activo en V2: solo `login` + `dashboard`.** ~300 líneas de rutas comentadas (scope legado pendiente).
- **~90 clases de comando de API** ya integran el dominio Carrier (viajes, choferes, tarifadores, cuentas corrientes, afiliados, branches, integraciones) **sin UI aún**.
- Resto del portal Carrier (viajes, choferes, vehículos, tarifadores, cuentas, reportes, settings) sigue en **V1 (Angular 5)**.

## Auth Flow (V2)
- `POST auth/login` (base `environment.apiUrl`; uat = `https://apps-uat.magiis.com/magiis-v0.2/auth/login`), body `{username,password}`, header `RoleToAttempt: ROLE_CARRIER`, `_needAuthenticate=false`.
- Respuesta `{userId, token(JWT), userPrivileges[], sometimeEntered, userType}`. Roles = decodificar claim `roles` del JWT.
- Token en **localStorage** con prefijo `carrier-` (key `carrier-0`). Guard `NeedLoggin` (redirige a `auth/login`). Token inyectado en `ConnectionServices.Request()` (`Authorization: Bearer`), **no** en interceptor. `AuthInterceptor` solo maneja 401→logout.
- URL real de acceso (deploy): `https://apps-uat.magiis.com/carrier/#/auth/login` → `/carrier/#/dashboard` (del .env del usuario). ⚠️ **Discrepancia**: el código usa PathLocationStrategy (sin `#`); el deploy usa `/carrier/#/`. Confirmar contra nginx/proxy — para Playwright vale la URL real del .env.

## Selector Readiness (Playwright)
- **0 `data-testid/data-test/data-cy`** en todo `src` (igual que V1).
- Login addressable: `#email`, `#password-input`, `button[type="submit"]`, post-login `/dashboard`. Default para forms: `[formControlName="..."]`.
- i18n en/es autodetectado por navegador → **fijar locale** en Playwright; evitar locators por texto.

## Test Tooling / CI
- Unit: Karma/Jasmine, 94 `*.spec.ts` **stubs** (`toBeTruthy`) → cobertura efectiva ~0.
- E2E: **ninguno** (sin Playwright/Cypress/Protractor). CI: **sin `.gitlab-ci.yml`** en el repo (deploy manual/script).

## Recomendación de automatización (alimenta el PLAN)
1. **Estrategia API-first**: el dominio Carrier ya vive en la API (90 comandos) → automatizar por API (vía `magiis-api-e2e`) **ahora**, adelante de la UI.
2. **UI: crecer con la migración** — automatizar cada feature V2 cuando aterrice su pantalla; login+dashboard hoy.
3. **Pedir `data-testid` al equipo** en V2 a medida que migran (barato ahora, caro después) — requisito de desarrollo (Principio X + DoR-QA).
4. Fijar locale, esperar por presencia (DOM `@if`), usar `[formControlName]`.

## Discovery Gaps
- [ ] Confirmar hash-routing/deploy real (`/carrier/#/`) vs código (PathLocationStrategy).
- [ ] Cobertura real de features migradas (solo login+dashboard confirmado).
- [ ] Dos stacks de auth (template Firebase muerto vs Magiis vivo) — limpiar para no confundir QA.
