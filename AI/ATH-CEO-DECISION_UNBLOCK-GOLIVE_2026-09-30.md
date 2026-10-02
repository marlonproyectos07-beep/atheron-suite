# CEO Decision — Unblock Go-Live Readiness (2026-09-30)

## 1. Preservación STAGING — HECHO

Ver `AI/staging-backup/README.md` y el paquete completo en
`AI/staging-backup/` (commit `d1489b2`). Resumen: export nativo de
Odoo Studio (módulo instalable real) + respaldo JSON de todo lo que
Studio no exporta (101 automatizaciones, 81 acciones de servidor con
su código Python real, 5 cron, master data completa). Clasificación
REPRODUCIBLE/SOLO_STAGING/EXPORTABLE/NO_EXPORTABLE en el README.

## 2. Gateway público STAGING — AUDITADO, decisión tomada, despliegue BLOQUEADO por credencial

### Auditoría real (no supuesta)

El Gateway (`integrations/odoo-hotel-gateway/`) tiene **dos piezas
separadas con necesidades distintas**:

- El **webhook receptor** (`src/pages/api/hotel/webhook.ts`) — ya
  desplegado en Vercel Preview, correcto ahí: solo verifica firma,
  deduplica y delega. Sin estado crítico que deba sobrevivir entre
  invocaciones.
- El **Gateway real** (`index.mjs` → `src/bootstrap.mjs` →
  `src/server.mjs`) — usa `node:http` con `.listen(port)` (proceso
  largo tradicional, no una función serverless), y **`IdempotencyStore`
  es un `Map` en memoria de un solo proceso** (`src/idempotency-store.mjs`):
  su garantía real de "dos HOLD simultáneos con la misma idempotency_key
  → una sola ejecución" depende de que sea el MISMO proceso Node el que
  atienda ambas peticiones. Vercel serverless no garantiza eso (puede
  levantar instancias paralelas bajo carga, y recicla instancias frías
  sin aviso) — es exactamente la razón "arquitectura/runtime/
  persistencia" que el mandato anticipó como motivo válido para NO
  usar Vercel.

**Nota importante**: el anti-overbooking REAL (la garantía que de verdad
importa) vive en Odoo mismo (la automatización "HOTEL v1 — Anti-doble-
reserva hotel", ya probada en HOTEL-009 con intentos reales de doble
reserva). El `IdempotencyStore` es una capa de UX (evita pedirle a Odoo
dos veces lo mismo por un reintento HTTP), no la última línea de
defensa — pero igual debilitarla sin necesidad no tiene sentido cuando
hay una opción que la preserva intacta sin tocar código.

### Decisión: Render (o equivalente de proceso persistente), NO Vercel

`npm start` (`node index.mjs`) ya es exactamente el modelo que Render
espera (Web Service: HTTP largo, lee `PORT` del entorno, expone
`/health` y `/ready` ya implementados en `src/server.mjs`) — **cero
cambios de código necesarios**. No se eligió por costumbre: se
descartó Vercel por la razón técnica de arriba, y Render es la opción
más directamente compatible con la arquitectura YA construida y YA
probada, sin reescribirla.

### Bloqueo real: no existe ninguna cuenta/token de Render en esta máquina ni en el repo

Verificado (no asumido): sin CLI de Render instalada, sin sesión, sin
token en el secure-store, sin ninguna referencia previa en el proyecto.
Crear una cuenta nueva o generar un token requiere una acción que solo
el CEO puede autorizar/realizar (alta de cuenta, método de pago si
aplica, o un token de API existente). **Aquí se detiene esta pista**,
tal como autoriza el mandato ("Detente solamente cuando necesites una
credencial").

**Qué necesito de ti para continuar**: o bien (a) una cuenta de Render
ya creada + token de API, o (b) autorización para crear una cuenta
nueva (con el método de contacto que prefieras), o (c) el nombre de
otro proveedor al que ya tengas acceso y que soporte procesos Node
persistentes (Railway, Fly.io, un VPS existente, etc.) — cualquiera
sirve igual de bien técnicamente, la única restricción real es "proceso
persistente", no la marca.

## 3. Usuario Ángela STAGING — PREPARADO, ejecución BLOQUEADA por dato personal (correo)

### Grupos reales verificados (no supuestos) para mínimo privilegio

| Grupo | ID real | Otorgado | Por qué |
|---|---|---|---|
| `base.group_user` ("Internal User") | 1 | SÍ | Login interno básico, requisito de cualquier usuario operativo. |
| `sales_team.group_sale_salesman_all_leads` ("User: All Documents") | 16 | SÍ | Ve/edita TODAS las reservas (Hotel v1 vive sobre `sale.order`), no solo "las suyas" — necesario porque Ángela es la única recepcionista. |
| `base.group_system` ("Role / Administrator") | 4 | **NO** | Ajustes, gestión de usuarios, configuración administrativa. |
| `base.group_no_one` ("Technical Features") | 7 | **NO** | Menús técnicos/modo desarrollador — es el mismo grupo que habilita el botón "Activar Studio". |

Hoy solo existen 2 usuarios internos en STAGING: Marlon (admin) y
"Sofía API STAGING" (el usuario técnico del Gateway) — ningún usuario
de Ángela existe todavía.

### Script listo, NO ejecutado

`integrations/odoo-hotel-gateway/scripts/crear-usuario-angela-staging.mjs`
— crea el usuario con exactamente esos grupos, en cuanto se le pase su
correo real como argumento. No inventa ni genera un correo.

**DETENGO aquí, tal como se pidió**: necesito el correo real de Ángela
(el que va a usar para entrar a Odoo STAGING) para crear su usuario.

## 4. Prueba reina — PREPARADA, no ejecutada

Queda pendiente de que el Gateway público (punto 2) esté resuelto.
Nada se envía a WhatsApp real sin ese paso y sin gate explícito del CEO.
