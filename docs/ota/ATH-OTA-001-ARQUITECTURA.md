# ATH-OTA-001 — Arquitectura de sincronización Booking + Airbnb + Web + WhatsApp + Odoo

> Este documento es diseño y preparación técnica (Fases 4, 6, 9–13 de la
> orden ATH-OTA-001). No implica cambios en producción, no conecta ningún
> canal real y no toca Odoo. Es paralelo a ATH-ODOO-HOTEL-007 y reutiliza sus
> decisiones sin duplicarlas.

## Principio rector

```
ODOO       = inventario y reglas transaccionales (disponibilidad, HOLD, anti-overbooking).
WEB        = adquisición y conversión.
WHATSAPP   = conversación y venta asistida.
BOOKING /
AIRBNB     = canales externos.
ICAL       = capa provisional de bloqueo de disponibilidad.
API /
CHANNEL
MANAGER    = evolución futura (Fases 12-13).
```

`IA conversa/orquesta; Odoo calcula y garantiza inventario` (principio ya
formalizado en `AI/ODOO_HOTEL_STATE.md` para HOTEL-006/007). Este documento
extiende ese mismo principio a Booking, Airbnb, la web y WhatsApp: ninguno de
esos canales debe convertirse en una segunda fuente de disponibilidad o
tarifa.

## Prerrequisito que condiciona todo lo demás

Como quedó documentado en `ATH-OTA-001-MATRIZ.md`, **solo Hotel Atheron
Suite existe hoy como inventario en Odoo** (6 unidades piloto de
ATH-ODOO-HOTEL-002). Las Fases 9–11 de este documento (web, WhatsApp, Sofía)
describen la arquitectura *objetivo* asumiendo que cada propiedad
comercializada tiene su unidad en Odoo — hoy eso es cierto solo para una de
seis. Hotel Colonial Confort, Hotel La Margarita, Casa Algarra, Casa Neusa y
Edificio Algarra necesitan Master Data en Odoo antes de que cualquier pieza
de esta arquitectura les aplique de verdad. Ver
`ATH-OTA-001-PENDIENTES-HUMANOS.md`.

---

## Fase 4 — Master data comercial vs. inventario transaccional

Separación explícita, para que Booking/Airbnb nunca se conviertan por
accidente en la fuente maestra de Atheron:

### MASTER DATA (fuente de verdad: Odoo + CMS Sveltia de la web, gestionados por Atheron)
- nombre, descripción
- capacidad, amenidades
- políticas (niños, mascotas, check-in/out)
- fotos
- ubicación
- RNT
- tarifas base

### INVENTARIO TRANSACCIONAL (fuente de verdad: Odoo, exclusivamente)
- disponibilidad
- reserva
- HOLD
- bloqueo
- cancelación
- anti-overbooking
- sincronización con cada OTA

**Regla dura:** un feed `.ics` entrante de Booking o Airbnb solo puede
escribir en la columna transaccional (bloqueos de fecha). Nunca puede crear,
renombrar o modificar una unidad, cambiar su capacidad, ni tocar una tarifa.
El `OtaCalendarAdapter` (`integrations/ota-ical-adapter/`) refleja esto en
código: su contrato de entrada (`UnitMappingRegistry`) exige que la unidad ya
exista y esté mapeada de antemano — nunca la crea a partir de lo que llega
en el `.ics`.

---

## Fase 6 — CASA COMPLETA ↔ habitaciones

Regla, ya validada en Odoo por ATH-ODOO-HOTEL-002/006 ("CASA COMPLETA <->
habitaciones", "concurrencia atómica: exactamente un ganador",
"habitaciones hermanas compatibles no se bloquean entre sí") y **reutilizada
sin duplicar lógica** por el adapter de esta tarea:

1. Si **CASA COMPLETA** se reserva en una OTA → todas sus habitaciones
   quedan bloqueadas.
2. Si **una habitación** se reserva → CASA COMPLETA queda bloqueada.
3. Las **habitaciones hermanas compatibles** (p. ej. 201 y 203 de Hotel
   Atheron Suite, que no comparten cama ni baño) **no** se bloquean entre
   sí.

En el `OtaCalendarAdapter` esto es la configuración `blockGroup` de
`UnitMappingRegistry` (ver `src/unit-mapping.mjs` y el test
`adapter.test.mjs` → "CASA COMPLETA bloquea también todas las habitaciones
hermanas"): la regla de negocio vive una sola vez, en Odoo (HOTEL-002/006);
el adapter solo declara qué unidades pertenecen a qué grupo de bloqueo y deja que
el sink real (futuro cliente de HOTEL-007 u otro mecanismo de escritura en
Odoo) aplique el bloqueo. Ningún cálculo de disponibilidad ni de conflicto
de negocio se reimplementa aquí — eso sería exactamente la duplicación que
la orden prohíbe.

Nota de hallazgo (Fase 1-2): la matriz marca como **riesgo crítico** que
Hotel Atheron Suite CASA COMPLETA podría estar anunciada dos veces en
Booking bajo nombres distintos ("Atheron Grand House" y "Casa Suite
Zipaquira"). Si eso se confirma, cualquier diseño de bloqueo CASA COMPLETA
↔ habitaciones tiene que cubrir también CASA COMPLETA ↔ CASA COMPLETA
duplicada, o el duplicado debe cerrarse comercialmente antes de conectar
ningún feed real.

---

## Fase 9 — Evolución de hotelesatheron.com

```
CLIENTE
  |  selecciona fechas/personas
  v
WEB consulta ODOO           (vía el mismo gateway de HOTEL-007, no un cálculo propio)
  |
  v
availability -> quote
  |
  v
CTA: RESERVAR / WHATSAPP
```

**La web no calcula precios ni disponibilidad.** Reutiliza el contrato ya
definido en `integrations/odoo-hotel-gateway/openapi.yaml`
(`POST /hotel/availability`, `POST /hotel/quote`, `POST /hotel/hold`,
`POST /hotel/status`), el mismo que usan los agentes técnicos de
HOTEL-007. Consecuencias concretas para Astro:

- Las páginas de `src/pages/hospedajes/[slug].astro` seguirían mostrando
  Master Data (fotos, descripción, políticas) tal como hoy, servido
  estáticamente en el build de Astro.
- Un selector de fechas/personas (nuevo) llamaría a
  `POST /hotel/availability` y `POST /hotel/quote` en tiempo de ejecución del
  navegador — esto implica que el gateway HOTEL-007 tendría que exponerse
  con una identidad técnica de solo lectura para tráfico público (`agent_id`
  tipo `web-public`), distinta de las identidades de agentes IA, y con rate
  limit más estricto por ser tráfico anónimo. Esto no existe todavía: hoy
  las identidades técnicas de HOTEL-007 son solo para agentes internos
  (Claude/ChatGPT/Codex). Ver pendientes.
- El CTA final sigue siendo "Reservar" (flujo `quote -> hold` con
  `idempotency_key` generado en el navegador) o "WhatsApp" (Fase 10),
  nunca un pago directo en esta fase.
- Astro es de salida estática (`astro build`); el selector de disponibilidad
  necesariamente es una isla de cliente (JS) que llama al gateway, no una
  ruta server-side — coherente con el hosting actual en Vercel como sitio
  estático.

---

## Fase 10 — Catálogo comercial de WhatsApp

Categorías propuestas, una por propiedad publicada (evitar duplicar Casa
Algarra/Edificio Algarra hasta resolver su ambigüedad, Fase 6 de la
auditoría):

- Hotel Atheron Suite ("La Magia de Zipaquirá")
- Hotel Colonial Confort
- Hotel La Margarita (cuando se publique)
- Casa Algarra
- Casa Neusa
- Apartamentos en Algarra

**El catálogo no es inventario.** Cada elemento del catálogo de WhatsApp
Business enlaza a:
- la URL de la ficha en `hotelesatheron.com`, o
- una consulta a Sofía (Fase 11),

llevando siempre `property_id`, `unit/type` cuando aplique, y
`source_channel=whatsapp` — el mismo patrón de `source_channel` que ya usa
el gateway de HOTEL-007 para trazabilidad (`x_hotel_api_log`,
`source_channel=sofia` forzado en el grupo 149). Ningún precio ni
disponibilidad se guarda en el catálogo de WhatsApp: siempre se resuelve en
el momento contra Odoo.

---

## Fase 11 — Arquitectura de Sofía (sin conectar aún)

```
Cliente WhatsApp
  |
  v
Sofía
  |
  v
HOTEL-007 Gateway   (availability / quote / hold / status)
  |
  v
Odoo
  |
  v
HOLD -> humano/pago/confirmación
```

Sofía reutilizaría exactamente el contrato técnico ya construido y probado
para HOTEL-007 (`grupo 149 "Hotel v1 / API Sofía"`, usuario técnico 27, sin
admin, sin grupo 148, sin API keys — ver `AI/ODOO_HOTEL_STATE.md`). Esta
tarea **no conecta WhatsApp real**; el diseño se deja listo para que, cuando
se autorice, Sofía sea un cliente más del gateway (como
`clients/claude-client.mjs` o `clients/generic-client.mjs`, pero con
`agent_id` propio y el mismo mínimo privilegio: disponibilidad, cotización,
HOLD y estado — nunca confirmación/cancelación arbitraria, tarifas,
Planning, contabilidad, pagos, DIAN ni Master Data).

---

## Fase 12 — Booking a largo plazo: iCal vs. Channel Manager vs. Connectivity API

| Opción | Qué sincroniza | Latencia | Coste/certificación | Adecuación para Atheron hoy |
|---|---|---|---|---|
| **A. iCal** | Solo disponibilidad (bloqueos de fecha) | Sondeo con demora de hasta ~12 h; sin notificación si el feed se rompe | Gratis, sin certificación | **Recomendado para esta fase**: es lo que ya diseña `OtaCalendarAdapter`, cubre el riesgo de overbooking inmediato sin coste ni proceso de certificación |
| **B. Channel Manager / PMS certificado** | Disponibilidad + tarifas + contenido, vía un tercero que ya tiene certificación con Booking | Minutos | Suscripción mensual + integración con Odoo | A evaluar cuando haya más de 2-3 propiedades con inventario real en Odoo; hoy solo hay 1 |
| **C. Booking Connectivity API directa** | Disponibilidad + tarifas + contenido + mensajería, sincronización instantánea y bidireccional (formato OTA/XML de OpenTravel, versión 2003B) | Instantánea | Requiere convertirse en partner certificado ("Connectivity Partner") — proceso de certificación propio de Booking, no una simple API key | Descartado por ahora: coste/complejidad de certificación no se justifica con 1 propiedad piloto en Odoo |

Fuente: documentación pública de Booking Partner Hub / Connectivity APIs
(`developers.booking.com/connectivity/docs` — **no se pudo hacer WebFetch
directo por bloqueo de red del entorno**, información obtenida vía
WebSearch). **NO se solicitó ninguna conexión real** — Fase 12 es solo
evaluación, como pide la orden.

Recomendación de secuencia: (1) iCal cuando se confirme el mapeo de al menos
Hotel Atheron Suite; (2) evaluar Channel Manager certificado solo cuando 3+
propiedades tengan Master Data e inventario reales en Odoo; (3) API directa
solo si el volumen de reservas y el número de propiedades justifica el coste
de certificación — decisión explícitamente de Marlon, no técnica.

---

## Fase 13 — Airbnb a largo plazo: iCal vs. software/channel manager futuro

Airbnb no ofrece una API pública de reservas equivalente a Booking
Connectivity para operadores pequeños sin certificación de "Preferred
Software Partner" — el camino de entrada estándar para un operador del
tamaño de Atheron sigue siendo **iCal de exportación/importación
bidireccional** (confirmado por la documentación pública de Airbnb: exportar
el link `.ics` del anuncio, importar el `.ics` del otro canal, sincronía
cada 1-2 h). No se asume ni se solicita acceso a ninguna API que Atheron no
tenga hoy.

Recomendación: mismo adapter (`OtaCalendarAdapter`) sirve para Airbnb y
Booking — ambos exponen `.ics`, el parser ya es agnóstico a la fuente
(`source: 'airbnb' | 'booking'` en `unit-mapping.mjs`). Un channel manager
dedicado a Airbnb solo se vuelve relevante si Atheron migra a un PMS externo
certificado como Preferred Partner, escenario fuera de alcance de esta
tarea.

---

## Riesgo transversal detectado en la auditoría (Fases 1-2) que condiciona toda esta arquitectura

Los dos audits (Booking y Airbnb) coinciden, de forma independiente, en que
**la marca pública dominante para Hotel Atheron Suite en al menos una OTA
grande es "La Magia de Zipaquirá"**, no "Hotel Atheron Suite"/"Atheron
Suite". Cualquier trabajo de Fase 9-11 que asuma que "Atheron" es el nombre
de búsqueda universal del huésped está construyendo sobre un supuesto no
verificado. Antes de invertir en el selector de disponibilidad de la Fase 9
o en el catálogo de WhatsApp de la Fase 10, vale la pena que Marlon decida
si esa es la marca pública que quiere consolidar, o si hay que corregirla en
las OTA.
