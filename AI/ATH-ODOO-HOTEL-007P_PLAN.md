# ATH-ODOO-HOTEL-007P — Promotion Rehearsal

## Objetivo

Probar portabilidad antes de cualquier promoción a producción.

HOTEL-007P solo pasa si HOTEL-002..007 puede reconstruirse sobre una copia
**nueva** de producción, sin depender de IDs accidentales, datos de prueba,
credenciales, neutralizaciones ni registros propios de la staging antigua.

## Fuente de verdad

- `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md`
- PR #57 / `feature/ath-odoo-hotel-007-gateway`
- evidencia aprobada de HOTEL-002..007
- configuración real de una futura copia fresca de producción

No usar recuerdos, nombres aproximados ni IDs asumidos como sustituto de
inspección directa.

## Guardrails

- Producción real: NO tocar.
- Atheron Security: NO tocar.
- Booking/Airbnb/OTA reales: NO tocar.
- WhatsApp/Meta/Sofía real: NO conectar.
- Pagos/DIAN: NO.
- Precios: no inventar ni promover valores de QA.
- Secretos: nunca copiar desde staging; recrear en el destino.
- Admin: solo durante discovery controlado de la copia fresca, nunca para Sofía.
- Merge/deploy: aprobación humana.

## Fase P0 — Precheck

Antes de modificar la copia fresca:

1. confirmar nombre inequívoco de la base y que está marcada/neutralizada como test;
2. confirmar versión Odoo igual o compatible;
3. confirmar aplicaciones/módulos instalados;
4. confirmar fecha de expiración de la copia;
5. registrar snapshot lógico de configuración previa;
6. comprobar que email/pagos/salidas externas están neutralizados;
7. verificar que producción no será usada como endpoint por scripts/gateway.

**STOP** si la identidad de la base no es inequívoca.

8. confirmar que la variable de entorno del ID de acción destino (hoy
   `ODOO_ACTION_ID`) se va a definir explícitamente para la copia fresca:
   el código ya aprobado de HOTEL-007 (`integrations/odoo-hotel-gateway/src/bootstrap.mjs`
   y `src/odoo-adapter.mjs`) usa `1967` como valor por defecto si la
   variable no está definida, y `1967` es el ID de la acción de la
   staging antigua. No depender de ese valor por defecto.

## Fase P1 — Discovery administrativo controlado

Usar una cuenta administradora humana solo para inventariar configuración.
No convertir al usuario Sofía en admin.

Inspeccionar y capturar ID técnico, modelo, origen y dependencias de:

- acción HOTEL API equivalente a staging 1967;
- `x_hotel_api_log`;
- grupos equivalentes a 148 y 149;
- reglas ACL/record rules asociadas;
- acciones 1969/1970 o equivalentes;
- automatizaciones 71/132/135/137/199 o equivalentes;
- cron de expiración de HOLD equivalente a 155;
- modelos/campos `x_*` hoteleros;
- vistas Studio;
- recursos/calendarios;
- relación CASA COMPLETA ↔ habitaciones;
- estructuras de reglas tarifarias;
- listas de precios legacy vs nueva;
- unidades/propiedades de producción.

Para cada elemento clasificar:

```text
GIT
STUDIO_EXPORT
CONFIG_RECREATE
MASTER_DATA_IMPORT
SECRET_RECREATE
ALREADY_EXISTS
DO_NOT_MIGRATE
UNKNOWN_BLOCKING
```

## Fase P2 — Studio / paquete de personalización

Determinar si los elementos `x_*`, vistas, automatizaciones y/o acción HOTEL API
pertenecen a `studio_customization`.

Si son exportables:

- exportar paquete desde la staging origen o desde una copia segura;
- registrar versión de Odoo y módulos requeridos;
- no guardar secretos ni datos de negocio dentro del paquete;
- conservar hash/nombre del artefacto como evidencia;
- listar explícitamente qué NO incluye el ZIP.

Si no son Studio:
documentar mecanismo exacto de recreación/configuración.

## Fase P3 — Mapeo de Master Data

Crear una tabla de mapeo, nunca una copia ciega de IDs:

| Entidad lógica | ID staging antigua | ID copia fresca | Fuente | Validado |
|---|---:|---:|---|---|
| Hotel Atheron Suite | 1 (histórico staging) | PENDIENTE | inspección fresca | NO |
| Unidad 201 | 1 (histórico staging) | PENDIENTE | inspección fresca | NO |
| 202/203/301/302 | histórico | PENDIENTE | inspección fresca | NO |
| CASA COMPLETA | histórico | PENDIENTE | inspección fresca | NO |

Los valores anteriores de staging son referencia histórica, no IDs a importar.

## Fase P4 — Datos que se excluyen

Nunca promover:

- quote 115/116;
- HOLD 22215/22216;
- contactos ficticios;
- emails `@example.invalid`;
- configuración de neutralización;
- logs de QA como datos operativos;
- valores 80.000/120.000/150.000 COP vistos en pruebas;
- acción QA 1969 activa;
- secretos/API keys de staging.

## Fase P5 — Instalación/recreación en copia fresca

Orden lógico:

1. estructuras/modelos/campos/vistas;
2. grupos y reglas de mínimo privilegio;
3. Master Data real remapeado;
4. reglas tarifarias aprobadas o placeholder bloqueado si aún faltan decisiones CEO;
5. acción HOTEL API equivalente;
6. auditoría;
7. cron/automatizaciones;
8. usuario técnico nuevo;
9. secretos nuevos fuera de Git;
10. gateway apuntando exclusivamente a la copia fresca.

No usar el número 1967 como requisito universal: identificar la acción del destino
por configuración y tratar el ID como dato de entorno.

## Fase P6 — Regresión HOTEL-002..007

Ejecutar en orden y guardar evidencia:

### HOTEL-002
- inventario físico;
- calendario/recurso;
- CASA COMPLETA ↔ habitaciones;
- anti-overbooking.

### HOTEL-003/004
- reglas deterministas;
- cotización estructurada;
- ningún cálculo inventado por IA.

### HOTEL-005/006
- permisos;
- mínimo privilegio;
- usuario técnico;
- campos/procesos prohibidos fallan cerrado.

### HOTEL-007
- availability;
- quote;
- HOLD idempotente;
- status HOLD;
- status quote;
- replay mismo HOLD;
- anti-overbooking end-to-end;
- Gate audit con resultado esperado según permisos;
- secret scan.

## Fase P7 — Prueba de independencia

Buscar dependencias a la staging antigua en:

- código del gateway;
- scripts;
- fixtures;
- docs ejecutables;
- variables de entorno;
- IDs;
- URLs;
- nombres de DB;
- emails de staging;
- valores de prueba.

Clasificar cada match:

```text
EXPECTED_TEST_REFERENCE
DOCUMENTATION_REFERENCE
PORTABILITY_RISK
SECRET_RISK
```

Cero `PORTABILITY_RISK` y cero `SECRET_RISK` para aprobar.

Incluir explícitamente en esta fase: confirmar que `ODOO_ACTION_ID` (o el
nombre que tenga en el entorno destino) quedó definido con el ID real de la
copia fresca, y no vacío/ausente — el código de HOTEL-007 no falla si falta,
sino que reutiliza en silencio `1967` (ver hallazgo de auditoría abajo).

## Hallazgo de auditoría de portabilidad — 2026-09-26 (ATH-NIGHT-001)

Auditoría de referencias a la staging antigua (`atheron1-hotel-staging-20260923`)
en todo el repositorio (no solo en este plan), clasificadas según el esquema
de esta misma fase.

| Referencia | Dónde | Clasificación |
|---|---|---|
| `1967`, holds `22215`/`22216`, quotes `115`/`116`, texto "staging" | `integrations/odoo-hotel-gateway/README.md`, `ROLLBACK.md`, `.env.example` (comentarios) | DOCUMENTATION_REFERENCE — evidencia narrada de la corrida LIVE del 25/09/2026, no configuración activa |
| `1967`, holds/quotes de prueba, `technicalSecret: 'test-secret-not-real'` | `integrations/odoo-hotel-gateway/test/*.mjs` | EXPECTED_TEST_REFERENCE — fixtures explícitos de prueba, ningún secreto real |
| "uid 27" | Solo en `AI/ODOO_HOTEL_PROMOTION_MANIFEST.md` (tabla de inventario) | DOCUMENTATION_REFERENCE |
| `$ 80.000` / `$ 120.000` / `$ 150.000` en `src/content/hospedajes/hotel-atheron-suite.md` | Contenido publicado del sitio (tarifas reales del hospedaje) | Coincidencia numérica con los precios de prueba de Odoo, sin relación real — no es un hallazgo de staging |
| `actionId = 1967` como valor por defecto del código | `integrations/odoo-hotel-gateway/src/odoo-adapter.mjs:265` y `src/bootstrap.mjs:32` | **PORTABILITY_RISK** — si `ODOO_ACTION_ID` no se define explícitamente en el entorno destino, el gateway reutiliza en silencio el ID de la acción de staging (1967) en vez de fallar. Contradice esta misma fase P5 ("no usar el número 1967 como requisito universal"). **BLOCKED_FOR_007P**: el fix pertenece al gateway de HOTEL-007 ya aprobado en PR #57 y no se modifica en esta rama; se cubrió en su lugar como requisito explícito de precheck y de PASS en este plan. |

Ningún `SECRET_RISK` encontrado. Ningún `PORTABILITY_RISK` adicional al ya
documentado arriba.

## Fase P8 — Rollback

Antes de cada cambio registrar cómo revertirlo.

El rehearsal debe poder volver a estado inicial de la copia fresca sin tocar
producción.

Requisitos mínimos:
- desactivar gateway;
- revocar usuario técnico;
- desactivar cron/automatizaciones nuevas;
- revertir/importar personalización según mecanismo confirmado;
- eliminar solo datos creados por el rehearsal cuando sea inequívoco;
- si `ODOO_ACTION_ID` quedó vacío y el gateway operó por el valor por
  defecto (`1967`, ver hallazgo de auditoría), verificar qué acción de la
  copia fresca se ejecutó realmente antes de decidir qué revertir.

## Criterio de PASS

`ATH-ODOO-HOTEL-007P = PASS` únicamente si:

- copia fresca confirmada;
- paquete/mecanismo de promoción identificado;
- ningún ID accidental de staging requerido;
- `ODOO_ACTION_ID` (o equivalente) definido explícitamente para el entorno
  destino, nunca dependiendo del valor por defecto `1967` del código;
- secretos recreados;
- datos de prueba excluidos;
- HOTEL-002..007 vuelven a pasar;
- anti-overbooking vuelve a pasar;
- usuario técnico conserva mínimo privilegio;
- cero dependencia de producción durante la prueba;
- rollback documentado;
- evidencia suficiente para repetir el proceso en otra ciudad.

## Resultado esperado

```text
HOTEL-007P PASS
PORTABLE = YES
PRODUCTION TOUCHED = NO
READY FOR HOTEL-008 = YES
PRODUCTION PROMOTION = STILL REQUIRES CEO APPROVAL
```

## Si falla

No arreglar producción.

Registrar exactamente:
- componente;
- causa;
- evidencia;
- si el fallo es código, Studio, configuración, Master Data o secreto;
- corrección propuesta;
- nueva prueba necesaria.

## Reutilización multiciudad

El mismo rehearsal debe demostrar que una ciudad futura puede levantar una
instancia parametrizada cargando principalmente Master Data, reglas locales,
credenciales y configuración, sin reescribir el core.
