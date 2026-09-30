# ATH-OTA-001 — Pendientes que requieren a Marlon o login autenticado

> Consolidado de todo lo que esta auditoría no pudo cerrar por sí sola:
> decisiones comerciales, confirmaciones que solo un humano con acceso puede
> dar, y huecos de arquitectura que otra tarea (no esta) tiene que resolver.

## Bloqueo técnico del entorno (afecta a toda la auditoría)

El proxy de red de este entorno de ejecución bloquea `WebFetch` directo a
`booking.com`, `airbnb.com` y varios agregadores (`tripadvisor.com`,
`developers.booking.com`, entre otros) con `EGRESS_BLOCKED`. Todos los
hallazgos de `ATH-OTA-001-AUDITORIA-BOOKING.md` y
`ATH-OTA-001-AUDITORIA-AIRBNB.md` vienen de resultados de búsqueda
(snippets), no de inspección directa de las páginas. Esto baja la confianza
de todo lo marcado PROBABLE/HIPÓTESIS y hace imposible verificar fotos,
tarifas exactas o reglas de la casa sin acceso humano.

## PENDIENTE_AUDITORIA_AUTENTICADA (requieren login real, no se intentó)

1. **Confirmar o descartar cada ficha "candidata"** de las auditorías de
   Booking y Airbnb contra la cuenta real de anfitrión/extranet de Marlon —
   en particular las de Hotel Atheron Suite, Casa Algarra, Hotel Colonial
   Confort y Casa Neusa, que hoy son PROBABLE o HIPÓTESIS.
2. **Verificar visualmente el riesgo de fotos IA de la Suite 301** en
   cualquier ficha OTA confirmada — el sello C2PA (`claim_generator_info` =
   OpenAI Media Service API) es detectable por Booking/Airbnb y no se pudo
   inspeccionar el contenido real de las fotos desde este entorno.
3. **Resolver si "Atheron Grand House" y "Casa Suite Zipaquira" en Booking
   son el mismo inventario anunciado dos veces** — riesgo crítico de
   overbooking si ambas fichas aceptan reservas sobre las mismas fechas sin
   vínculo de calendario.
4. **Confirmar si existen anuncios de "casa completa" vinculados a
   habitaciones sueltas en Airbnb**, y si sus calendarios están enlazados —
   no se pudo verificar para ninguna propiedad (Hotel Atheron Suite, Casa
   Algarra, Edificio Algarra).
5. **Aclarar la política de mascotas de la Suite 301** en Booking — las
   fuentes públicas se contradicen entre sí.
6. **Confirmar Genius y tarifas negociadas** en las fichas de Booking
   identificadas — no visibles sin sesión.

## Decisiones que necesita Marlon (comerciales/de marca)

1. **Nombre comercial público.** Ambas auditorías, de forma independiente,
   encontraron que la marca dominante en OTA para Hotel Atheron Suite es
   **"La Magia de Zipaquirá"**, no "Atheron Suite". ¿Se consolida esa marca
   en Booking/Airbnb, o se corrige para alinear con la web propia? Esto
   condiciona el catálogo de WhatsApp (Fase 10) y cualquier campaña de
   pauta.
2. **Relación con `hotellamargarita.com`.** Hotel La Margarita tiene RNT
   29756 (coincide con el dato interno) y presencia pública madura —
   dominio propio, teléfono, dirección — por fuera de `hotelesatheron.com`,
   donde la ficha sigue sin publicar. ¿Es el mismo negocio operado en
   paralelo, una web antigua que hay que retirar, o dos cosas distintas?
3. **Discrepancia de capacidad de Casa Neusa.** El dato interno permite
   hasta 8-10 huéspedes bajo consulta; el candidato de Airbnb de mayor
   confianza declara solo 2 huéspedes/2 habitaciones. ¿Son la misma unidad
   con el anuncio desactualizado, o el anuncio cubre solo una parte de la
   propiedad?
4. **Ambigüedad Casa Algarra ↔ Edificio Algarra.** Son dos propiedades
   internas distintas en el mismo sector; ninguna ficha OTA encontrada trae
   suficiente detalle para saber con certeza a cuál pertenece. Antes de
   activar cualquier venta por WhatsApp o web con estos nombres, conviene
   que Marlon confirme cuál es cuál sobre el terreno.
5. **Duplicados de marca "Colonial".** Existen al menos 3 negocios
   potencialmente distintos usando "colonial" en Zipaquirá (Hotel Colonial
   Confort interno, un "Hotel Colonial" de directorio en otra dirección, y
   "Casona Colonial" en Airbnb). Si alguno de los dos últimos es
   competencia y no Atheron, vale la pena documentarlo para no confundirlo
   internamente en el futuro.

## Huecos de arquitectura para otra tarea (no ATH-OTA-001)

1. **Master Data en Odoo para 5 de 6 propiedades.** Solo Hotel Atheron
   Suite tiene unidades piloto en Odoo (ATH-ODOO-HOTEL-002). Hotel Colonial
   Confort, Hotel La Margarita, Casa Algarra, Casa Neusa y Edificio Algarra
   necesitan alta en Master Data antes de que la arquitectura de las Fases
   9-11 les aplique realmente. Esto es, en parte, uno de los pendientes ya
   anotados en `AI/ODOO_HOTEL_STATE.md` ("Alta en Master Data de unidades
   ligadas a 132/135/137").
2. **Endpoint de bloqueo externo en el gateway HOTEL-007.** El contrato
   actual de `integrations/odoo-hotel-gateway` (`availability/quote/hold/
   status`) asume el flujo propio de cotización (HOLD requiere `quote_id`).
   Un bloqueo que llega desde un `.ics` externo no tiene cotización previa:
   necesita una operación nueva (p. ej. `hotel/external-block`) que hoy no
   existe. `OtaCalendarAdapter` se diseñó con un puerto (`InventorySink`)
   precisamente para no bloquearse en esta falta — pero alguien tiene que
   construir ese endpoint en Odoo/HOTEL-007 antes de conectar un feed real.
3. **Identidad técnica pública para el selector de disponibilidad de la
   web (Fase 9).** Hoy las identidades técnicas de HOTEL-007 son solo para
   agentes internos (Claude/ChatGPT/Codex). Exponer disponibilidad/cotización
   a visitantes anónimos del sitio necesita una identidad de solo lectura
   con rate limit propio — no existe todavía y es una decisión de seguridad,
   no solo de código.
4. **Duración oficial de HOLD, vigencia de cotización, impuestos y mínimo de
   ocupación de Casa Completa Magia** — ya pendientes desde HOTEL-006, y
   relevantes aquí porque cualquier HOLD creado a partir de un bloqueo OTA
   heredaría esas mismas reglas.

## Qué NO se tocó (por diseño, no por descuido)

Ningún anuncio real de Booking o Airbnb fue modificado. No se activó
Genius. No se cambiaron fotos, tarifas ni disponibilidad real. No se
conectó ningún feed `.ics` real — todo el `OtaCalendarAdapter` se probó
únicamente contra fixtures locales inventados para la prueba. No se inició
sesión en ningún sitio ni se usó ni se pidió ninguna credencial.
