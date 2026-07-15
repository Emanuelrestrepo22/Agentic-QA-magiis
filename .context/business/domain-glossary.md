# Domain Glossary — MAGIIS Carrier

> Fase 1 (Constitution) · entidades núcleo del portal Carrier, con identificador de código y label ES.
> Fuente: `src/app/services/connection/interfaces/apiInterfaces.d.ts`, `src/app/services/enum/**`, `src/app/enums/**`, `src/app/services/models/**`.

## Entidades núcleo

### Trip / Viaje (`Travel`, `TravelsGridResponseDTO`)
Entidad central. Campos: `travelId`, `travelIdForCarrier`, `state`, pasajero, `origin`/`destination`, `driverId`, vehículo (`vehicleMark/Model/Domain`), `finalPrice`, `simulatePrice`, `paymentMethod`, `serviceType`, `channel`, `isProgrammed`/`isRecurringTrip`, `flight`, `waypoints`, `farmType`, `affiAgreementId`. Relaciones → Driver, Vehicle, Passenger/Client, Fare, Area/Zone.
- **State machine `TravelStateEnum`**: `SEARCHING_DRIVER → WITH_DRIVER_ASSIGNED → GOING_TO_CLIENT → GOING_TO_DESTINATION → CLOSING_TRAVEL → DONE / ADMIN_DONE`; + `SCHEDULED`, `RESERVED`, `CANCELLED`, `LOST`, `NO_AUTH`, `NO_PAY`. (`travelState.enum.ts`)
- **Canal `TravelChannelEnum`**: MA, MI, W, WC, API, IVR, WA, AFI, SG, TG, GNET, Q, S, FC, FP. (`travelChannel.enum.ts`)

### Driver / Chofer (`DriverRegistrationRequestDTO`, `DriverGrid`)
Carpeta `carrier/driver/**` (list, create, edit, liquidation, checking-account, documentation-report).
- **State `DriverStateEnum`**: `ONLINE`, `OFFLINE`, `IN_TRAVEL`, `ONLINE IN_BASE`, `ONLINE IN_STREET`, `DISABLED`, `OUT_OF_SERVICE`; sub-estado `DriverSubStateEnum` = `IN_BASE` | `IN_STREET`. (`driverState.enum.ts`)

### Vehicle / Vehículo (`VehicleRequestDTO`, `VehicleICard`)
Campos: `identificationCard` (patente/domain, mark, model, year, color, chassis, `vehicleTypeId`), `vehicleOwnerId`, `carrierUserId`, `characteristics`, `documents`, `enabled`. Relaciones → Owner, VehicleType, Driver.
- **Tipo `TransportTypeEnum`**: Standard, Premium, Especial, Bicicleta, Ejecutivo, Blindado, Mini Van, Moto, Mini Bus, Bus, Movilidad Reducida, Van Plus. (`transportType.enum.ts`)

### Owner / Propietario (`VehicleProperties`)
Propietario del vehículo que recibe liquidaciones. `SettlementTypeEnum` = OWNER | DRIVER. Carpeta `carrier/owner/**`.

### Client — Passenger / Individuo & Company / Empresa (`ClientsResponseDto`, `ContractorResponseDto`)
Dos subtipos: pasajeros individuos ("Gestión Individuos") y empresas corporativas ("Gestión Empresas", con empleados, áreas, centros de costo).
- **Relación corporativa `ContractorCarrierStatusEnum`**: `LOCAL`, `ACCECON`, `ACCECAR`, `INACCAR`, `INACCON`, `PENCAR`, `PENCON`, `DELETED`. (`contractor-carrier-status.enum.ts`)

### Quote / Cotización (`QuoteResponseDTO`)
Campos: `quoteId`, `idForCarrier`, `price`, `taxes`, `distance`, `duration`, `expiredDate`, `passengerId`, `useSms`. Rutas `travel/quotes`, `carrier/quotes/**`.

### Checking Account / Cuenta Corriente (`CheckingAccountResponseDto`)
Campos: `passengerUserId`, `debitSum`, `creditSum`, `limit`, `balance`, `exceedingLimit`. Para Choferes, Propietarios, Clientes, MAGIIS y Afiliados. (`checking-account.model.ts`)

### Settlement / Liquidación
Por partner (Empresas, Choferes, Propietarios, Individuos) con historial.
- **Status `SettlementStatusEnum`**: `NOTPAID`, `PAID`, `CANCELED`. (`payment-status.enum.ts`)

### Fare / Tarifador (`CarrierRateModel`)
Campos: `id`, `name`, `pricePerKm`, `type`, `heritage`, `rulesCollection`. Reglas: diaria/semanal/alta demanda, segmentos de distancia, ida-vuelta, alquiler, espera, taxímetro, peajes, costo financiero.
- **Tipo `TypeOfRateEnum`**: `RATE`, `RATECOST`, `BOTH`. (`type-of-rate.enum.ts`)

### Surrender / Cierre de Caja
Conciliación de viajes cobrados en efectivo por choferes + Adelantos. Carpetas `carrier/pay/**`, `carrier/surrenders/**`.

### Affiliate / eAfiliado (ATC) (`AffiliateTypesEnum` = ATC, VARA, VATA)
Red inter-carrier con ofertas, solicitudes, cotizaciones one-shot/contraofertas, acuerdos y cuentas corrientes de afiliado.
- **Estado `NegotiationStatesEnum`**: PENDING, NEGOTIATING, ESTABLISHED, FINALIZED, EXPIRED, REJECTED, NEW. (`negotiationStates.enum.ts`)

### GNET Farm-In / Farm-Out
Tercerización/insourcing de viajes entre carriers + cuentas de crédito inter-carrier. Carpetas `carrier/gnet/**`, `carrier/global-integrations/**`.

### Soporte: Zone/Zona, Area, Branch/Sucursal, Service Type
`ServiceTypeEnum` = REGULAR, CUSTOM, COURIER, APP_PAX, FAVORITE_TRIP, TAKE_ME_HOME. (`serviceType.enum.ts`)

## Mapa Label ES ↔ code / ruta (top)

| Label ES | Ruta / Componente |
|---|---|
| Control Operaciones | `dashboard` → `DashboardCarrierComponent` |
| Visor de Mapa | `map-viewer` → `MapViewerComponent` |
| Gestión de Viajes | `travel/dashboard` → `TravelDashboardComponent` |
| Cotizaciones | `travel/quotes` → `QuotesListComponent` |
| Choferes | `driver/list` → `DriverListComponent` |
| Vehículos | `vehicle/list` → `VehicleListComponent` |
| Propietarios | `owner/list` → `OwnerListComponent` |
| Gestión Individuos | `client/list` → `ClientListComponent` |
| Gestión Empresas | `client/contractors` → `ContractorListComponent` |
| Cuentas Corrientes | `checking-accounts/*` |
| Liquidaciones | `liquidations/*` |
| Cierres de Caja | `pay/*` → `SurrendersReportComponent` |
| Tarifadores | `settings/travel-fare-list` → `TravelFareListComponent` |
| GNET / Farm In / Out | `gnet/*` |
| eAfiliados (ATC) | `affiliate/atc-profile` → `AffiliateProfileComponent` |

## Discovery Gaps

- [ ] Grafo de transiciones válidas de `TravelStateEnum` (backend-enforced; solo inferí happy-path por nombres).
- [ ] Sets completos de campos por entidad (Driver, Contractor): tomados de `.d.ts`, verificación puntual, no exhaustiva.
- [ ] Significado de negocio de códigos `TravelChannelEnum`.
- [ ] Gating de permisos por pantalla: mayormente comentado en `carrier.routing.ts`; enforcement real vía guards/`ngx-permissions`/backend.
