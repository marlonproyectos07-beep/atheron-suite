# ATHERON WHATSAPP PLAYBOOK v0.1
**GOAL-WHATSAPP-PLAYBOOK-001 — Auditoría de conversaciones reales y cerebro comercial**
Fecha de auditoría: 3-oct-2026 · Modo: SOLO LECTURA · Anonimizado (sin nombres, teléfonos, documentos, cuentas, claves ni comprobantes)

---

## 0. ALCANCE REAL Y LIMITACIONES (leer primero)

| Hecho | Detalle |
|---|---|
| Ventana de historial disponible | WhatsApp Web solo muestra mensajes **desde el 25/6/2026** (el propio WhatsApp indica "ver mensajes anteriores al 25/6/2026 en tu teléfono"). Muchos chats muestran "obtener mensajes anteriores de tu teléfono"; **no se pulsó** (sería una acción sobre el teléfono). |
| Tamaño del inbox | ~576 chats en la lista. Casi todos con historial corto (1–15 mensajes de texto). |
| Cobertura de esta auditoría | ≈ 24 conversaciones leídas completas (≈ 14 comerciales con huésped/lead), ≈ 116 chats revisados por vista previa (18/9–3/10/2026), ≈ 45 fragmentos de mensajes vistos mediante búsquedas por palabra clave (disponibilidad, precio, parqueadero, personas, abono/anticipo, cancelar, catedral, check in, llegar tarde, perro, niños). |
| Objetivo pedido vs. logrado | Pedido: 30–50 chats útiles. Logrado: **≈ 14 conversaciones comerciales completas + ≈ 60 hilos comerciales parciales**. **Por debajo del mínimo en profundidad.** Se compensó con vistas previas y búsquedas, pero los porcentajes de este informe son **estimaciones ±10 pp**, no estadística exacta. |
| Mezcla del inbox | El número recibe huéspedes y leads, pero también: aliados (hoteles que revenden), personal, proveedores, una **línea de negocio distinta (Atheron Security: cámaras/alarmas)**, avisos de servicios y mensajes de sistema. Estimación sobre previews: ~55–65 % huéspedes/leads/reservas, ~15–20 % aliados/personal, ~15–20 % no hoteleros o sistema. |
| Fuentes adicionales | Web pública hotelesatheron.com (6 propiedades + 1 proyecto). No se tuvo acceso a Odoo ni a documentación interna previa (no se encontró en esta sesión). |
| Chats con prueba del agente | Se halló una conversación de **prueba del propietario con un agente anterior** (26/9). Se usó solo como evidencia de errores del agente actual, **no** como conducta real de huésped. |

**Lectura honesta:** este informe es una base sólida para el contrato del agente, pero la muestra de conversaciones largas es pequeña. Se recomienda una segunda pasada con exportación de chats desde el teléfono (ver sección 13).

---

## 1. TOP_INTENTS (frecuencia relativa estimada en chats comerciales)

| # | Intención | Frecuencia | Evidencia |
|---|---|---|---|
| 1 | CONSULTA_DISPONIBILIDAD | Muy alta | "¿Hay habitaciones disponibles?", "¿tienen para hoy y mañana?" |
| 2 | CONSULTA_PRECIO | Muy alta | "¿Qué precio tiene la noche?", "precio pareja y qué incluye" |
| 3 | PAREJA / 2 PERSONAS | Alta | Casi todas las consultas de habitación son para 2 |
| 4 | PARQUEADERO | Alta | Aparece en decenas de hilos (carro, moto, 2 carros) |
| 5 | ANTICIPO / ABONO | Alta | "¿cuánto sería el abono?", plantilla de pago |
| 6 | COMPROBANTE / PAGO | Alta | Plantilla de pago, envío de comprobantes |
| 7 | DATOS_DE_LLEGADA (post-reserva) | Alta | Plantilla "hora de llegada, nombres, documentos…" |
| 8 | CHECKIN / CHECKOUT (horas) | Alta | "hora de check in y check out" |
| 9 | UBICACION / CERCANÍA | Media-alta | "¿cerca de la catedral?", "¿qué tan lejos del parque…?" |
| 10 | RESERVA_BOOKING_AIRBNB (confirmar/cancelar) | Media | "hice reserva por Booking, ¿está hecha?", "cancélela por la plataforma" |
| 11 | CANCELACION / NO_SHOW | Media | "no pude llegar", "cancelar por Booking" |
| 12 | LLAMADA (entrante/perdida) | Media | ~10 % de chats con "Llamada" como último evento |
| 13 | AUDIO | Media-alta | ~12–15 % de chats con nota de voz como último mensaje |
| 14 | FAMILIA_NINOS | Baja-media | Pregunta de tarifa de niños |
| 15 | MASCOTA | Baja-media | Huésped con perro (reserva Booking) |
| 16 | CASA_COMPLETA / GRUPO | Baja en este número | Web los promociona; en chats vistos aparece poco (DATA_GAP de volumen) |
| 17 | RECOMENDACION_TRANSPORTE_TURISMO | Baja | "¿cómo llego/regreso a Bogotá?" |
| 18 | ALIADO_CONSULTA_DISPONIBILIDAD (B2B interno) | Media | Plantilla de consulta a hotel aliado |
| 19 | ALIADO_LIQUIDACION (comisión/transferencias) | Media | Cuadre de cuentas, % de comisión |
| 20 | HABLAR_CON_HUMANO / "voy a preguntar a la jefe" | Media | El operador escala internamente |

### Mapa completo de intenciones (incluye nuevas halladas)

CONSULTA_DISPONIBILIDAD · CONSULTA_PRECIO · COTIZACION · PAREJA · FAMILIA · FAMILIA_NINOS_TARIFA · GRUPO · MASCOTA · PARQUEADERO (carro / moto) · UBICACION · CERCANIA_ATRACCION · CHECKIN · CHECKOUT · LLEGADA_TARDE · LLEGADA_INMINENTE ("ya llegué", "estoy afuera") · ANTICIPO · PAGO · ENVIO_COMPROBANTE · METODO_PAGO_TARJETA (recargo) · CAMBIO_FECHAS · EXTENSION · CANCELACION · NO_SHOW · CASA_COMPLETA · RECOMENDACION · PRESUPUESTO_LIMITADO ("¿no hay más económico?") · RECLAMO · HABLAR_CON_HUMANO · RESERVA_OTA (Booking/Airbnb) · CONFIRMAR_RESERVA_OTA · DATOS_HUESPED (nombres, documento, hora llegada) · LLAMADA · AUDIO · FACTURA_ELECTRONICA · EQUIPAJE (guardar maletas) · ACCESO/CLAVES (post-reserva) · WIFI (post-reserva) · SEGUIMIENTO_LEAD (reactivación) · ALIADO_CONSULTA · ALIADO_LIQUIDACION · FUERA_DE_ALCANCE (otra línea de negocio, proveedores, spam) · SALUDO_SOLO ("Buenas tardes" sin más).

### Ficha por intención (resumen operativo)

**CONSULTA_DISPONIBILIDAD**
- Cómo pregunta: "Hola buenas tardes, ¿hay habitaciones disponibles?", "para hoy y mañana", mensajes cortados en 2–3 burbujas ("hay habitaciones" / "es para dos adultas").
- Falta: fechas (entrada/salida o noches) y número de personas.
- Pregunta de Atheron: solo lo que falte ("¿Para qué fecha?" o "¿Cuántas personas?"). Nunca ambas si ya dio una.
- Directo: nada (la disponibilidad nunca se afirma sin Odoo).
- Odoo: **sí** (propiedad, fechas, huéspedes).
- Humano: si Odoo falla/sin respuesta, si es grupo ≥ 11, si piden fecha muy cercana (mismo día) y hay duda operativa.
- Riesgo de inventar: afirmar disponibilidad o "solo queda 1" sin consulta. En los chats reales el operador dice "para mañana no" o "solo me queda una" tras verificar.

**CONSULTA_PRECIO**
- Cómo pregunta: "¿qué precio tiene la noche?", "precio de la noche para pareja y qué incluye".
- Falta: fecha, personas y tipo de baño (compartido/privado).
- Pregunta: "¿Para qué día sería? Para ver qué tengo disponible y darte precio".
- Directo: **no dar tarifa fija sin fecha**; el catálogo y la web muestran precios distintos (ver DATA_GAPS).
- Odoo: **sí** (tarifa vigente por habitación/fecha).
- Humano: si piden descuento (el operador a veces rebaja; regla no documentada → DATA_GAP).
- Riesgo: precio desactualizado. Evidencia de variación: misma habitación vista en catálogo, en conversación y en web con valores distintos.

**ANTICIPO / PAGO**
- Cómo pregunta: "¿cuánto sería el abono?", "¿te lo puedo mandar mañana?".
- Falta: total de la reserva (para calcular % ) y medio de pago.
- Directo: explicar medios de pago de la plantilla oficial (QR, llave Bre-B, transferencia a cuenta empresarial; tarjeta vía link con recargo 5 %). **No escribir números de cuenta desde memoria**: tomarlos de la plantilla aprobada.
- Odoo: sí, para total y saldo; registrar anticipo cuando lo confirme un humano.
- Humano: **siempre** valida el comprobante y confirma la reserva ("anticipo recibido y verificado").
- Riesgo: confirmar reserva sin pago verificado; dar % incorrecto (se vio 30 % y 50 %).

**PARQUEADERO**
- Cómo pregunta: "¿tienen parqueadero?", "de moto", "para 2 carros".
- Falta: carro o moto, cuántos, propiedad.
- Directo (verificado en chats y web): Hotel Atheron Suite sin parqueadero propio; parqueadero aliado a ~2,5 cuadras, ~$15.000/noche carro, moto sin costo (sujeto a disponibilidad). Otras propiedades: ver fichas.
- Odoo: no (salvo cupo si se modela).
- Humano: cupo en el aliado el mismo día, vehículos grandes/camionetas, ≥ 3 vehículos.
- Riesgo: prometer cupo; confundir costo entre propiedades.

**CHECKIN / CHECKOUT**
- Directo: Hotel Atheron Suite check-in 15:00, check-out 11:00 (web y chat). Colonial Confort: ingreso desde 18:00, salida hasta 10:00, hora extra $10.000 (solo web). Neusa y Algarra Apts: ver fichas.
- Odoo: no.
- Humano: ingreso temprano/salida tardía, llegada de madrugada.
- Riesgo: aplicar horas de una propiedad a otra.

**RESERVA_OTA (Booking/Airbnb)**
- Cómo pregunta: "hice una reserva por Booking, ¿está confirmada y a qué hora llego?".
- Falta: nombre de la reserva/fecha (para ubicarla).
- Directo: horarios de check-in/out; saludo de bienvenida.
- Odoo: sí, para validar reserva si está sincronizada (DATA_GAP: no se confirmó sincronización OTA→Odoo).
- Humano: **cancelaciones y cobros de OTA** (el operador dice "cancele por la plataforma o cobramos lo que dice la reserva"), cambios de condición, mascota/personas extra.
- Riesgo: prometer reembolso/cancelación sin política documentada.

**CANCELACION / NO_SHOW / CAMBIO_FECHAS**
- Directo: nada sin política escrita (**DATA_GAP crítico**: la web no publica política de cancelación).
- Odoo: ver reserva y fechas alternativas.
- Humano: **siempre**.
- Riesgo: alto (dinero y relación). Respuesta segura: reconocer, pedir datos de reserva, escalar.

**HABLAR_CON_HUMANO / LLAMADA**
- Directo: confirmar que se avisa a una persona del equipo; horario de atención (respuesta automática observada: 08:00–22:00).
- Humano: siempre; ver sección 9.

**ALIADO_CONSULTA / ALIADO_LIQUIDACION**
- Es tráfico B2B interno (hoteles aliados). **El agente de huéspedes no debe responderlo**: etiquetar y derivar a humano. Se vio disputa por cuentas/comisión entre Atheron y un aliado.

**FUERA_DE_ALCANCE**
- Otra línea de negocio (seguridad/cámaras), facturas de servicios públicos, mensajes de Meta/Facebook, personal. El agente no responde; solo etiqueta.

---

## 2. TOP_QUESTIONS (preguntas más repetidas, anonimizadas)

1. ¿Hay habitaciones disponibles (hoy / fecha)?
2. ¿Cuál es el precio por noche para 1 / 2 / 3 personas?
3. ¿Qué incluye el precio?
4. ¿Tiene parqueadero? ¿carro o moto? ¿cuánto cuesta? ¿qué tan lejos?
5. ¿Cuánto es el abono y a qué cuenta lo envío?
6. ¿Puedo pagar el abono mañana / pagar al llegar?
7. ¿A qué hora es el check-in y el check-out?
8. ¿Queda cerca de la Catedral de Sal / del centro?
9. ¿Qué tan lejos queda [atracción: parque, pueblos cercanos]?
10. ¿Hay algo más económico?
11. ¿Baño compartido o privado?
12. ¿Hay primer piso? (movilidad)
13. ¿Cuántas camas / qué tipo de cama?
14. ¿Aceptan mascotas?
15. ¿Los niños pagan? ¿desde qué edad?
16. ¿Mi reserva de Booking/Airbnb está confirmada?
17. Necesito cancelar / cambiar la fecha.
18. ¿Dónde queda exactamente? (dirección)
19. ¿Me envía el recibo/factura?
20. ¿Puedo dejar las maletas?
21. Ya llegué / estoy afuera.
22. ¿Cuántas personas llegan? (pregunta del operador a aliado, no del huésped)
23. ¿Cuál es el valor de la suite?
24. ¿Pueden darme un descuento? ("a veces se deja en X")
25. ¿Cómo llego/regreso a Bogotá o a otros pueblos?
26. ¿Tienen desayuno / cocina? (DATA_GAP: poco visible en chats)
27. ¿Hay habitación para 1 persona?
28. ¿Puedo ir ahora mismo?
29. ¿Hay wifi / agua caliente? (post-reserva)
30. ¿Cómo hago el ingreso? (claves, guía de acceso; **no compartir en informes**)

---

## 3. TOP_OBJECTIONS

| Objeción | Frecuencia | Cómo la maneja hoy el equipo | Recomendación para el agente |
|---|---|---|---|
| "¿No hay algo más económico?" | Alta | Ofrece otra habitación (baño compartido) o baja el precio a veces | Ofrecer la opción más económica **disponible** y decir qué cambia (baño compartido). No inventar descuentos. |
| Precio alto vs. expectativa | Alta | Ajusta precio a la baja según demanda; "a veces se deja en X, pero hoy hay demanda" | Explicar diferencia entre opciones; escalar si piden descuento. |
| "Lo pienso / viajo y no sé a qué hora llego" | Media | Insiste con suavidad, ofrece reservar con anticipo "para tener seguridad" | No presionar; ofrecer dejar la consulta abierta y avisar disponibilidad si cambia. |
| "Pago al llegar / mañana" | Media | Acepta "el capture mañana"; hay seguimiento para congelar con 30–50 % | Explicar que el anticipo asegura el cupo; escalar excepciones. |
| "No tienen parqueadero" | Media | Sugiere parqueadero aliado cercano, indica costo | Dar dato verificado + condición; no prometer cupo. |
| "Quiero cancelar (OTA)" | Media | Le pide cancelar por la plataforma o cobra lo de la reserva | Escalar; no prometer. |
| "Baño compartido no me gusta" | Media | Muestra opción con baño privado | Ofrecer privado si hay disponibilidad (Odoo). |
| "Está lejos de…" | Baja | Responde con tiempo aproximado | Solo dar distancias verificadas (web: 1,4 km / 16 min a pie a la Catedral desde Atheron Suite). |
| "Ya habíamos hablado de otro precio" | Baja | Verifica y confirma | Escalar a humano; no discutir. |

---

## 4. SALES_PATTERNS (cómo vende hoy el equipo)

1. **Saludo automático** de WhatsApp Business: "Gracias por comunicarte con Hospedaje La Magia De ZIPAQUIRA. ¿Cómo podemos ayudarte?" (nombre anterior del Hotel Atheron Suite; ver DATA_GAPS por inconsistencia de marca).
2. **Una pregunta a la vez**: normalmente "¿Para qué día sería? Para ver la disponibilidad" y luego "¿Es para cuántas personas?".
3. **Catálogo de WhatsApp Business**: envía fichas "HABITACIÓN 202 baño compartido / COP 105,000 / Ver" (2–3 opciones) tras conocer fecha; luego dice "Me quedan esas dos opciones".
4. **Escasez real y verbal**: "Para ese día solo me queda una habitación"; "De pronto que alguien cancele te tomaría en cuenta".
5. **Ajuste de precio personalizado** frente a objeción: catálogo 105.000 → "esta te puede quedar en 80.000" para pareja; 120.000 → "110 mil". Regla no documentada (DATA_GAP).
6. **Precio por ocupación**: 3 personas en habitación con camarote = 130.000; pareja = 120.000 (otra habitación).
7. **Cierre con aseguramiento**: "pero queremos seguridad… me confirmas para poder cerrarla para ti" → pide abono 30 %.
8. **Seguimiento de leads**: plantilla "Te contacto por tu solicitud de reserva… cupos limitados… para congelar la reserva es necesario el abono del 30 o 50 %" (enviada a varios leads el mismo día).
9. **Pago**: plantilla "PAGO DE RESERVA — ATHERON SUITE" con 3 opciones (QR, llave Bre-B, cuenta de ahorros empresarial) + tarjeta vía link con recargo 5 % + "envíanos el comprobante por este mismo WhatsApp".
10. **Confirmación post-pago**: plantilla "¡Muchas gracias por reservar con nosotros! ¡Estamos emocionados de recibirte!" pidiendo hora estimada de llegada, nombres completos, documentos, correo, teléfono, ciudad de residencia/procedencia, contacto de emergencia.
11. **Reserva en aliados**: "ATHERON HOTELS — RESERVA CONFIRMADA N.º 100x" al huésped con datos, hotel, dirección, persona que recibe, anticipo y saldo; y mensaje equivalente al hotel aliado. Se observa **50 % de anticipo** en 2 reservas de aliado.
12. **Recordatorio de salida**: plantilla de check-out + equipaje gratis en oficina principal (piso 1).
13. **Mezcla de canales**: mensajes de texto + notas de voz del operador + llamadas.
14. **Mayor fricción**: tiempo de respuesta con "ya te confirmo" y consulta con administración/"la jefe" antes de dar precio final.
15. **Tarifa referencial por persona** en hospedajes de grupo/aliados: $65.000 pp/noche (La Margarita, Colonial, Algarra).

**Sin datos suficientes** (DATA_GAP): tasa de conversión, tiempo medio de respuesta, tasa de abandono tras precio, volumen mensual de grupos y casa completa.

---
## 5. PROPERTY_KNOWLEDGE (solo datos verificados; fuente indicada)

Fuentes: **W** = web pública hotelesatheron.com · **C** = conversación real de WhatsApp · **P** = plantilla/mensaje del negocio. Todo lo demás: `DATA_GAP`.

### 5.1 Hotel Atheron Suite (antes "Hospedaje La Magia de Zipaquirá")
| Campo | Dato |
|---|---|
| Capacidad confirmada | Hasta 22 huéspedes (casa completa) · 5 unidades en pisos 2 y 3 (W) |
| Tipo | Apartamentos/habitaciones con minicocina y cocina compartida (W) |
| Ubicación | Cra. 9 #10-32, centro de Zipaquirá (W, C). A 1,4 km / 16 min a pie de la Catedral de Sal (W). Bogotá a 43–49 km (W) |
| Unidades (W) | 201: 1 cama doble 1,40 m, baño compartido con 202, hasta 2 · 202: doble + camarote, baño compartido, hasta 4 · 203: doble + cama nido, baño privado, hasta 4 · 301 Suite: doble + camarote + sofá cama, baño privado, 6–7, minicocina, Alexa, llave digital · 302: doble + sofá cama, baño privado, hasta 3 |
| Características | WiFi, Netflix, TV pantalla plana, agua caliente (calentadores a gas), cocina compartida en 2.º piso (nevera, estufa, utensilios), aseo y ropa de cama incluidos (W) |
| Parqueadero | Sin parqueadero propio. Parqueadero aliado a ~2,5 cuadras, ~$15.000/noche por carro; moto sin costo sujeto a disponibilidad (C + W) |
| Mascotas | "Bajo consulta" (W). En un caso real se aceptó un perro de huésped OTA (C) |
| Cocina | Compartida (2.º piso) (W) |
| Baño | Compartido (201, 202) o privado (203, 301, 302) (W) |
| Reglas | No fumar (W). Sin ascensor (solo escaleras), sin aire acondicionado, sin closets en la mayoría (W) |
| Check-in / out | 15:00 / 11:00 (W; el 11:00 se confirmó en chat) |
| Equipaje | Se guarda sin costo en oficina principal piso 1 el día de salida (P) |
| Precios observados | Catálogo WhatsApp: 201/202 baño compartido COP 105.000; 203 y 302 COP 120.000; 301 COP 150.000. Chat: "baño compartido 55.000 pp / baño privado 65.000 pp"; ajustes a 80.000 (pareja), 110.000, 130.000 (3 personas). **Web: rangos distintos (201 $50–80k; 301 $80–350k).** → ver DATA_GAPS |
| Fortalezas de venta | Céntrico, opciones desde económico a suite, cocina, habitaciones privadas y compartidas, sirve parejas y grupos pequeños |
| Limitaciones | Sin parqueadero propio, sin ascensor, sin A/C, 3 pisos de escaleras |
| FAQ frecuentes | Parqueadero · precio por persona vs habitación · baño compartido · distancia a Catedral · check-in |
| Datos faltantes | Política de cancelación, desayuno, velocidad WiFi, accesibilidad, ruido, política de menores, mascotas (costo/condiciones) |

### 5.2 Casa Algarra
| Campo | Dato |
|---|---|
| Capacidad confirmada | Hasta 22 huéspedes (W) |
| Tipo | Casa completa (W) |
| Ubicación | Zipaquirá; dirección exacta solo tras confirmar reserva (W) |
| Características | 5 habitaciones, 3 baños, sala-comedor, cocina equipada, WiFi, TV con Netflix, agua caliente (W). Detalle de camas solo para 201, 202, 203 (W) |
| Parqueadero | 2 vehículos incluidos, exterior sin techo con cámara (W) |
| Mascotas / reglas / check-in-out | DATA_GAP |
| Precios (W) | Referencia $65.000 pp; grupo 8+ personas $50.000 pp; por habitación "a consultar" |
| Fortalezas | Casa completa para grupos con cocina y parqueadero |
| Limitaciones | Pocos baños para 22 personas; detalle de camas de 204/205 desconocido |
| FAQ | Dirección, parqueadero, precio por persona grupo |
| Datos faltantes | Mascotas, horarios, cancelación, reglas, camas 204/205 |
| Nota | En chats aparece una **"Guía para acceder a la casa"** (autoservicio con clave). No reproducir claves. |

### 5.3 Casa Neusa (Cogua)
| Campo | Dato |
|---|---|
| Capacidad confirmada | 8 huéspedes cómodos; 9–10 con consulta previa y colchones (W) |
| Tipo | Casa campestre, sector Neusa, Cogua (W) |
| Características | 2 habitaciones; 2 camas dobles 1,40 m + 2 sofá-camas; 1 baño; cocina en L con nevera; comedor para 6; sala con chimenea; balcón panorámico; zona BBQ; WiFi; zona de trabajo; TV (W) |
| Parqueadero | Gratuito (W) |
| Mascotas | Requieren aprobación previa y costo adicional (W) |
| Reglas | Fogata sujeta a clima; sin domicilios, comprar víveres antes en Zipaquirá/Cogua (W) |
| Check-in / out | 15:00–21:00 / antes de 11:00 (W) |
| Distancias (W) | Restaurantes ~5 min en carro; Embalse del Neusa ~20 min; Bogotá ~1 h |
| Precios (W) | 4 huéspedes $300.000/noche; +$60.000 por huésped extra; 8 huéspedes $540.000 |
| Fortalezas | Escapada campestre, chimenea y BBQ, grupos pequeños/familias |
| Limitaciones | 1 solo baño para 8; lejos del centro de Zipaquirá |
| Datos faltantes | Detectores de humo/CO, cancelación, depósito, costo mascota |
| Nota | En chat aparece como "Cabaña Neusa" en Airbnb (alias). Confirmar nombre canónico. |

### 5.4 Apartamentos en Algarra (edificio, 6 unidades)
| Campo | Dato |
|---|---|
| Capacidad | 6 apartamentos independientes; hasta 41 estándar, 43 con colchones auxiliares (W) |
| Unidades (W) | Apt 201: 5 (2 dobles + sofá cama) · 301, 302, 401, 402: 7 cada uno (3 dobles + sofá cama) · Dúplex: 8 (camas a confirmar). Todas: 1 baño, cocina equipada |
| Características | WiFi, zonas de trabajo, TV, nevera; sin ascensor (W) |
| Parqueadero | Cubierto: 2 carros y 3 motos; $20.000/noche carro, $10.000 moto; reservar antes (W) |
| Mascotas | Bienvenidas, avisar antes; cargo de aseo adicional (W) |
| Check-in / out | 15:00–17:00 / antes de 11:00 (W) |
| Precios (W) | Desde $65.000 pp (grupos); tarifa de grupo a la medida |
| Fortalezas | Familias y grupos medianos con cocina; admite mascotas |
| Limitaciones | Sin ascensor; 1 baño por apartamento; parqueadero limitado |
| Datos faltantes | Dirección exacta, tarifas por apartamento, cancelación, desayuno |
| Nota | En un chat un lead pidió "Apartamentos en Algarra" para 2 personas + parqueadero y se consultó a un aliado inmobiliario (B2B). |

### 5.5 Hotel Colonial Confort
| Campo | Dato |
|---|---|
| Capacidad | 28 en camas fijas; +2 en colchón (grupos 29–30) (W) |
| Tipo | Hotel, 13 habitaciones privadas (12 con cama doble, 1 con 2 camas dobles) (W) |
| Ubicación | Centro de Zipaquirá, Carrera 9, cerca de la Catedral de Sal; dirección exacta al confirmar (W) |
| Características | Baño privado en cada habitación, agua caliente, TV, WiFi, ambiente tranquilo, recepción 24 h (W) |
| Parqueadero | Sin parqueadero propio; lote externo a 2,5 cuadras (W) |
| Mascotas | No permitidas (W) |
| Reglas | **Solo adultos; no menores ni adolescentes** (W) |
| Check-in / out | Desde 18:00 / hasta 10:00; ingreso temprano o salida tardía $10.000/hora con coordinación (W) |
| Precios (W) | 1 persona $65.000; 2 personas $130.000 por noche (tarifa por adulto) |
| Fortalezas | Parejas y grupos de adultos, baño privado, centro |
| Limitaciones | Sin niños, sin mascotas, sin parqueadero propio, check-in tarde (18:00) |
| Datos faltantes | Cocina, FAQ, política de cancelación |
| Nota | En chat existe un grupo con aliados titulado "Hotel Colonial Confort [centro]" donde se gestionan reservas y pagos entre equipos (**B2B, no huéspedes**). |

### 5.6 Hotel La Margarita (aliado)
| Campo | Dato |
|---|---|
| Capacidad | Hasta 40 huéspedes en grupo (W) |
| Tipo | Hotel aliado; Atheron gestiona reservas y la administración del hotel opera (W) |
| Ubicación | Barrio La Esmeralda, cerca del centro histórico y Catedral de Sal (W). **Inconsistencia:** una confirmación de reserva enviada a huésped indica otra dirección (calle/carrera distinta). → DATA_GAP, validar antes de que el agente dé la dirección |
| Habitaciones | Familiar: 1 cama doble + 1 camarote; Pareja con baño privado (P) |
| Características | WiFi, TV por cable, recepción, zonas comunes (W) |
| Precios | Desde $65.000 pp/noche (W). Catálogo WhatsApp: habitación pareja COP 65.000. Reserva real de pareja: total $120.000 con anticipo 50 % (P) |
| Niños | **No confirmado en fuentes oficiales.** El agente anterior respondió con tarifas distintas en la misma conversación (primero "sin tarifa confirmada", luego "50 %"). → DATA_GAP, no repetir |
| Parqueadero / mascotas / cocina / horarios | DATA_GAP (la web indica "ficha en preparación"; solo parqueadero cercano solicitado en una reserva) |
| RNT | Web publica número de RNT (omitido aquí) |
| Fortalezas | Opción económica para parejas y familias/grupos |
| Limitaciones | Datos incompletos; opera un tercero |

### 5.7 Casa Colonial Centro (proyecto)
Según la web: **proyecto en transformación, no disponible para reservas** (alojamiento, restaurante, cafetería, experiencias). El agente **no debe ofrecerla ni cotizarla**.

### 5.8 Otras entidades que aparecen
- **Atheron Security**: línea distinta (cámaras/alarmas). Fuera del alcance del agente hotelero; etiquetar y derivar.
- Aliado de parqueadero: servicio tercero a ~2,5 cuadras.
- Otros "hoteles aliados" y aliados inmobiliarios: solo B2B.

---

## 6. DATA_GAPS (críticos primero)

| # | Gap | Impacto | Quién lo resuelve |
|---|---|---|---|
| 1 | **Política de cancelación/no-show/cambio de fechas** (directo y OTA) | Crítico | Dueño/Operaciones |
| 2 | **% de anticipo oficial** (30 %, 50 %, ¿depende de canal/propiedad/fecha?) | Crítico | Dueño |
| 3 | **Fuente única de tarifas**: catálogo WhatsApp, web y precios hablados difieren | Crítico | Odoo / Revenue |
| 4 | Regla de descuentos del operador (cuándo se baja de 105→80, 120→110, 150→130) | Alto | Dueño |
| 5 | Marca/nombre canónico por número ("Hospedaje La Magia de Zipaquirá" vs "Hotel Atheron Suite" vs "Atheron Hotels") | Alto | Dueño |
| 6 | Tarifa de niños y edades por propiedad | Alto | Operaciones |
| 7 | Dirección oficial de La Margarita (dos versiones) | Alto | Operaciones |
| 8 | Mascotas: condiciones/costos por propiedad (Atheron Suite, Casa Algarra, La Margarita) | Alto | Operaciones |
| 9 | Horarios check-in/out de Casa Algarra y La Margarita | Medio | Operaciones |
| 10 | Disponibilidad y sincronización OTA (Booking/Airbnb) con Odoo | Alto | Tecnología |
| 11 | Tiempo de respuesta, conversión, abandono (sin métricas) | Medio | Analítica |
| 12 | Volumen real de grupos/casa completa por WhatsApp | Medio | Muestra mayor |
| 13 | Desayuno/alimentación en cada propiedad | Medio | Operaciones |
| 14 | Mapa de números/líneas (huéspedes, aliados, seguridad, personal) | Alto | Dueño |
| 15 | Qué propiedades vende directamente vs. solo vía aliado | Medio | Dueño |
| 16 | Política de factura electrónica | Medio | Contabilidad |
| 17 | Horarios de atención humana (hay respuesta automática 08:00–22:00) | Medio | Dueño |
| 18 | Camas/detalle de habitaciones 204/205 (Casa Algarra) y dúplex | Bajo | Operaciones |
| 19 | Política de equipaje fuera del día de salida | Bajo | Operaciones |
| 20 | Política de datos personales/habeas data para recolectar documentos por WhatsApp | Alto | Legal |

---
## 6B. SALES_SCENARIOS (venta por tipo de huésped)

Regla común a todos: **tarifas siempre desde Odoo** (nunca desde memoria del agente). Las capacidades salen de las fichas de la sección 5; si no están allí → `DATA_GAP`.

| ID | Escenario | Datos que preguntar (solo los faltantes) | Opciones posibles (según fichas) | Consultar Odoo cuando… | Recomendar otra propiedad cuando… | Escalar a humano cuando… |
|---|---|---|---|---|---|---|
| S1 | **1 persona** | Fecha/noches; ¿baño privado o compartido? | Atheron Suite 201 (compartido) o 302/203 (privado); Colonial Confort individual (adulto) | Siempre antes de dar precio/disponibilidad | Si Atheron Suite sin cupo → Colonial Confort (adulto) | Fecha del mismo día con duda operativa; pide descuento |
| S2 | **2 personas / pareja** | Fecha/noches; baño privado o compartido; ¿primer piso? (movilidad) | Atheron Suite 201/202 (compartido), 203/302 (privado), 301 suite; Colonial Confort doble; La Margarita pareja | Siempre | Sin cupo en Atheron Suite → Colonial Confort o La Margarita | Pide piso bajo y no hay certeza (Atheron Suite no tiene ascensor) |
| S3 | **3 personas** | Fecha/noches; ¿adultos/niños?; baño | Atheron Suite 302 (hasta 3), 202/203 (hasta 4); Colonial: 2 habitaciones o la de 2 camas dobles | Siempre | Si hay niños → descartar Colonial (solo adultos) | Edad de niños y regla de tarifa (DATA_GAP) |
| S4 | **4 personas** | Fecha/noches; adultos/niños; ¿una habitación o dos? | Atheron Suite 202/203 (hasta 4) o 2 habitaciones; La Margarita familiar; Apartamentos Algarra Apt 201 (5) | Siempre | Si necesitan cocina → Apartamentos Algarra | Presupuesto limitado con negociación |
| S5 | **5–6 personas** | Fecha/noches; composición; ¿cocina?; ¿carro? | Atheron Suite 301 suite (6–7) o combinación; Apartamentos Algarra 301/302/401/402 (7); La Margarita (varias habitaciones) | Siempre | Si quieren apartamento completo con cocina → Algarra Apts | Precio total/descuento; solicitud especial |
| S6 | **7–10 personas** | Fechas; composición; ¿carro?; ¿mascota?; ¿cocina? | Apartamentos Algarra (7–8 por unidad); Casa Neusa (8, 9–10 bajo consulta); Atheron Suite varias unidades; Casa Algarra (grupo 8+ desde $50.000 pp, web) | Siempre (total + disponibilidad conjunta) | Casa Neusa si buscan campo; Algarra si buscan ciudad | **Siempre** que haya cotización de grupo a la medida |
| S7 | **11–15 personas** | Fechas; composición; ¿misma propiedad?; vehículos; motivo del viaje | Casa Algarra (hasta 22); Atheron Suite casa completa (22); Colonial Confort por habitaciones; combinación entre propiedades | Siempre | Dividir entre propiedades cercanas si una no alcanza | **Siempre humano** (cotización a la medida; la web dice que no hay tarifa de lista) |
| S8 | **16+ personas** | Fechas; tamaño exacto; presupuesto; ¿boletas Catedral? | Casa Algarra 22 · Atheron Suite 22 · Apartamentos Algarra hasta 43 · La Margarita hasta 40 · Colonial 28 · mezcla hasta 163 (web) | Disponibilidad conjunta | Distribuir en varias propiedades | **Siempre humano** |
| V1 | **Una habitación** | Ver S1–S4 | — | Sí | — | — |
| V2 | **Varias habitaciones** | Cuántas; quién comparte con quién | Combinaciones en la misma propiedad | Sí (cupo conjunto) | Dividir entre propiedades si no cabe | Si piden quedar juntas y no hay |
| V3 | **Casa completa** | Fechas; personas; cocina/parqueadero | Casa Algarra, Casa Neusa, Atheron Suite (casa completa 22, "cotización a la medida") | Sí | Si no hay casa completa → Apartamentos Algarra | Cotización a la medida |
| V4 | **Familia con niños** | Edades; fechas; cuántas habitaciones | Atheron Suite, La Margarita familiar, Apartamentos Algarra, Casas | Sí | **Descartar Colonial Confort (solo adultos)** | Regla de tarifa de niños (DATA_GAP) |
| V5 | **Pareja** | Ver S2 | — | Sí | — | — |
| V6 | **Grupo de trabajo** | Fechas; número; ¿zona de trabajo?; facturación | Apartamentos Algarra (zonas de trabajo, web); Neusa (zona de trabajo); Atheron Suite | Sí | — | Factura electrónica/corporativa; tarifa de grupo |
| V7 | **Mascota** | Tipo/tamaño; fechas | Apartamentos Algarra (bienvenidas, cargo de aseo); Neusa (aprobación previa + costo); Atheron Suite (bajo consulta); Colonial **no** | Sí (Odoo no cubre mascotas → política) | Colonial no aplica → ofrecer Algarra Apts o Atheron Suite | Costo y aprobación (DATA_GAP) |
| V8 | **Varias noches** | Noches exactas; ¿cambio de habitación? | Cualquiera; aseo periódico en estadías largas (Atheron Suite, web) | Sí | — | Descuento por estadía (DATA_GAP) |
| V9 | **Llegada tarde** | Hora estimada; teléfono | Check-in Atheron Suite 15:00; Neusa hasta 21:00; Colonial desde 18:00 | No | — | Llegada después de las 22:00/madrugada (horario de recepción: DATA_GAP salvo Colonial 24 h) |
| V10 | **Presupuesto limitado** | Presupuesto por noche; personas | Opción más económica **disponible** (p. ej. compartido); no inventar rebajas | Sí | Opción de otra propiedad si es más barata y cumple | Piden descuento o igualar precio |

---

## 7. STYLE_GUIDE

### 7.1 Lo que se observa en el equipo hoy
| Elemento | Observación real |
|---|---|
| Longitud | Mensajes **cortos** (3–15 palabras). Varias burbujas seguidas en vez de un párrafo. Excepciones: plantillas largas (pago, confirmación, recordatorio). |
| Saludo | Respuesta automática uniforme ("Gracias por comunicarte con… ¿Cómo podemos ayudarte?"), luego saludo breve ("Buenas tardes", "Hola buenos días"). |
| Uso de nombre | **Casi no** usa el nombre del huésped en la venta; sí lo usa en confirmaciones formales ("don/doña…" con aliados). |
| Tratamiento | Mezcla de "tú" y "usted"; informal-cálido ("claro que sí", "con mucho gusto", "quedo atenta"). Con aliados: "don". |
| Emojis | **Casi ninguno** en venta; sí en plantillas de pago (📷 🔑 🏦 💳 ✅ 💙). Reacciones 👍 del huésped. |
| Fechas | "¿Para qué día sería?", "¿Para qué fecha?" (una sola pregunta). |
| Personas | "¿Es para cuántas personas?" / "¿Para dos personas o cada persona?" (aclara precio por persona vs. habitación). |
| Opciones | Tarjeta de catálogo con 2–3 opciones, luego "Me quedan esas dos opciones; ¿cuál te gusta?". |
| Cierre | "Quedo atenta", "Te esperamos", "Con mucho gusto". Pide abono para "cerrarla/asegurarla". |
| Anticipo | Plantilla de pago + "envíanos el comprobante por este mismo WhatsApp". |
| Confirmación | Plantilla "¡Muchas gracias por reservar con nosotros! ¡Estamos emocionados de recibirte!" + datos de llegada; reserva de aliado con N.º de reserva. |
| Objeciones | Ofrece alternativa más barata, ajusta precio, consulta con "la jefe", insiste suavemente en asegurar. |
| Errores a NO copiar | Faltas de ortografía, mensajes sueltos sin contexto, precios contradictorios entre catálogo y conversación, tardanza sin aviso, mensajes largos duplicados del agente anterior. |

### 7.2 STYLE_GUIDE del agente (normativa)
1. **Una idea por mensaje; máximo 2–3 líneas.** Si hay que dar datos de pago o confirmación, usar la plantilla aprobada.
2. **Saludar una sola vez** por conversación. Si ya hay conversación abierta, no volver a saludar.
3. **Tono**: cálido, profesional, de hotel local; tuteo respetuoso por defecto; pasar a "usted" si el huésped lo usa. Sin jerga corporativa.
4. **No presentarse como persona concreta.** Frases como "Con gusto te ayudo desde Atheron" son válidas; no inventar nombre ni biografía. Si preguntan "¿eres un bot?": responder con honestidad que es el asistente de atención de Atheron y que puede pasar con una persona del equipo.
5. **Emojis**: 0–1 por mensaje y solo si el huésped los usa; plantillas aprobadas conservan los suyos.
6. **Preguntar solo el dato faltante.** Nunca repetir lo ya dicho en la conversación.
7. **Ofrecer, no listar.** Máximo 2–3 opciones; la primera debe ser la que mejor encaja.
8. **Precios**: siempre con fecha y número de personas; indicar si es por habitación o por persona. Redondear nunca; usar el valor de Odoo.
9. **Decir "lo consulto"** cuando se va a Odoo; no inventar demoras largas.
10. **Si no se sabe: decirlo** y ofrecer confirmar ("Eso no lo tengo confirmado; lo consulto con el equipo y te cuento").
11. **Cierre con siguiente paso claro** (por ejemplo: "¿Te la separo con el anticipo?" o "Te aviso apenas confirme").
12. **Evitar**: bloques largos, listas de más de 3 ítems cuando la pregunta es simple, frases tipo "Estimado cliente", "Con gusto le informamos que…", repetir la misma plantilla, disculpas excesivas, emojis en cadena.

### 7.3 Ejemplos de frases buenas / malas
| Situación | Mala | Buena |
|---|---|---|
| Cliente: "Somos 4 para mañana" | "¿Para qué fecha y cuántas personas?" | "Perfecto, 4 personas para mañana. Déjame consultar qué tengo disponible." |
| Precio sin fecha | "Tenemos desde $X…" | "Claro. ¿Para qué fecha? Así te doy el precio exacto." |
| Sin parqueadero | "No tenemos parqueadero." | "En el hotel no tenemos parqueadero propio, pero hay uno aliado a unas 2 cuadras y media (≈ $15.000 la noche el carro; la moto no tiene costo, sujeto a cupo)." |
| Dato desconocido | (inventar) | "Ese dato no lo tengo confirmado. Lo consulto y te respondo." |
| Descuento | "Sí, te hago 20 %." | "Déjame consultar si hay margen para esas fechas y te cuento." |

---

## 8. NATURAL_CONVERSATION_FLOW

```
CLIENTE (texto / audio / llamada perdida)
  → 1. IDENTIFICAR INTENCIÓN (puede haber varias en un mismo mensaje)
  → 2. RECUPERAR CONTEXTO (mensajes previos, reserva existente, propiedad, fechas, personas, preferencias)
  → 3. PEDIR SOLO EL DATO FALTANTE (una pregunta)
  → 4. CONSULTAR ODOO SI NECESARIO (disponibilidad / tarifa / reserva)
  → 5. OFRECER OPCIÓN (1 principal + 1 alternativa máx.)
  → 6. RESPONDER OBJECIONES (con datos verificados; sin inventar descuentos)
  → 7. COTIZAR (total, noches, personas, qué incluye)
  → 8. EXPLICAR ANTICIPO (plantilla aprobada; % según regla oficial)
  → 9. CONFIRMAR SIGUIENTE PASO (esperar comprobante / humano valida)
  → 10. ESCALAR CUANDO CORRESPONDA (ver sección 9)
```

### Reglas duras
1. **Nunca preguntar un dato que ya está en el contexto.** (Fechas relativas como "mañana" se resuelven contra la fecha actual y se reconfirman en una frase al cotizar, por ejemplo: "mañana, domingo 4 de octubre", si hoy es sábado 3.)
2. **Memoria de conversación obligatoria**: guardar `fecha_in, fecha_out, personas (adultos/niños), propiedad, tipo_baño, vehículo, mascota, presupuesto, nombre, canal`.
3. **Mensajes cortados** (varias burbujas seguidas): esperar ~5–8 s y responder una vez agrupando.
4. **Cambio de opinión**: tomar el último dato y confirmar en una línea ("Entonces ahora son 3 noches, ¿correcto?").
5. **Odoo falla o tarda**: decir "lo estoy confirmando" una vez y escalar si pasan > 2 minutos.
6. **Nunca confirmar reserva** sin pago verificado por humano.
7. **Datos sensibles**: no pedir ni repetir documentos o cuentas en mensajes abiertos más de lo necesario; no enviar claves de acceso hasta que el humano/regla de check-in lo habilite.
8. **Horario**: fuera de horario humano, responder con lo que se pueda resolver y registrar pendiente para humano.

### Ejemplo de flujo (sin datos reales)
```
Cliente: Buenas tardes, ¿hay habitaciones para este sábado?
Agente: ¡Hola! Sí lo reviso. ¿Para cuántas personas?
Cliente: Dos adultos
[Odoo: Atheron Suite, sáb 10-oct, 1 noche, 2 adultos]
Agente: Para ese sábado tengo estas dos opciones: habitación con baño privado ($X) o con baño compartido ($Y). ¿Cuál prefieres?
Cliente: ¿Hay algo más económico?
Agente: La de baño compartido es la más económica. Cambia que el baño se comparte con una habitación vecina.
Cliente: Ok esa. ¿Cuánto es el abono?
Agente: Para asegurarla se hace un anticipo del [regla oficial] ($Z). Te paso las opciones de pago.
[plantilla de pago]
```
(Los valores $X/$Y/$Z provienen de Odoo; no se inventan.)

---

## 9. ESCALATION_RULES

**Escalar a humano INMEDIATAMENTE:**
| Disparador | Motivo |
|---|---|
| Reclamo, enojo, mala experiencia, insulto | Relación y reputación |
| Cancelación, no-show, cambio de fechas, reembolso, devolución de anticipo | Dinero y política (DATA_GAP) |
| Comprobante de pago recibido (imagen/PDF) | Validar pago |
| Grupo ≥ 11 personas o cotización a la medida | Tarifa de grupo no publicada |
| Descuento o "mejor precio" | Regla no documentada |
| Mascota (costo/aprobación) | Política no definida |
| Niños con tarifa especial | Política no definida |
| Reserva Booking/Airbnb con cambios o cancelación | Condiciones de OTA |
| Solicitud de factura electrónica o datos fiscales | Proceso contable |
| El huésped pide "hablar con una persona" | Pedido explícito |
| Llamada entrante o perdida (ver sección 11) | Prioridad humana |
| Emergencia, seguridad, accidente, salud | Crítico |
| Dato de la propiedad marcado DATA_GAP y el huésped lo necesita para decidir | Evitar inventar |
| Odoo sin respuesta o con respuesta ambigua | Evitar error |
| Mensaje de aliado/personal/proveedor | Fuera del flujo de huéspedes |
| Cliente quiere llegar el mismo día con < 1 h o fuera de horario | Operación |
| Intento de pago por canal no oficial o petición sospechosa | Fraude |

**Escalamiento correcto:** el agente informa al huésped en una frase ("Voy a pasar tu caso con una persona del equipo para confirmártelo") y deja a humano un resumen: intención, datos ya recolectados, qué falta, urgencia.

**No escalar** por: saludo solo, pregunta simple de check-in/out/parqueadero con dato verificado, disponibilidad/precio estándar con Odoo.

---
## 10. AUDIO_STRATEGY

### 10.1 Auditoría (sin reproducir ningún audio)
| Métrica | Resultado |
|---|---|
| Chats con nota de voz como último mensaje (vista previa, ≈ 116 chats) | **≈ 14–16 (≈ 12–14 %)** |
| Duración visible | 3 s a 42 s; la mayoría 5–30 s |
| Dirección | Hay audios **del huésped** y también **del equipo** (el operador envía audios cortos de 10–20 s en cierre de venta y coordinación) |
| Qué información traen (inferido por el texto adyacente; **no se escucharon**) | Consulta de disponibilidad/fecha, confirmación de llegada, "ya llegué/estoy afuera", dudas de abono o ubicación, coordinación con aliados |
| Riesgo | Si el agente ignora audios, se pierde ~1 de cada 8 conversaciones |

### 10.2 Flujo futuro (no implementar todavía)
```
AUDIO ENTRANTE
 → descargar el medio mediante la API oficial (WhatsApp Business Cloud API / coexistencia: media id → URL → descarga)
 → transcribir (ASR en español colombiano; guardar idioma, duración, nivel de confianza)
 → detectar intención + extraer entidades (fecha, personas, propiedad)
 → conservar contexto (guardar transcripción como mensaje del huésped, marcada "transcrito de audio")
 → consultar Playbook / Odoo
 → responder POR TEXTO por defecto
```
### 10.3 Reglas
1. **Responder por texto por defecto** (más rápido de leer, auditable, y los datos de pago/precios deben quedar escritos).
2. Si la confianza de la transcripción es baja o hay ruido: pedir amablemente un texto corto ("No alcancé a escuchar bien la fecha, ¿me la escribes?") o escalar.
3. **Confirmar en texto lo entendido** cuando el audio trae fechas/personas ("Entendí: 2 personas, sábado 10 y domingo 11, ¿correcto?").
4. **Nunca** transcribir ni almacenar audios que parezcan personales no comerciales; descartar y etiquetar.
5. Datos sensibles dichos en audio (documento, cuenta): no repetir en voz ni en el chat más de lo estrictamente necesario.
6. Audio > 60 s o múltiples audios seguidos: transcribir todo y responder con un resumen corto + pregunta única.
7. Idioma distinto al español: responder en el mismo idioma si el equipo lo soporta (DATA_GAP) o escalar; hay huéspedes extranjeros (inglés/francés) en los chats.

### 10.4 Cuándo tendría sentido responder también con audio
- Huésped mayor o que solo usa audios **y** la respuesta es corta y no incluye cifras ni datos de pago.
- Llegada inminente ("ya llegué"): audio de 5–10 s del humano, no del agente.
- Siempre acompañado de un resumen en texto con los datos críticos.
- **No** usar voz sintética sin política de transparencia aprobada (DATA_GAP/decisión del dueño).

---

## 11. CALL_STRATEGY

### 11.1 Auditoría
- WhatsApp Web muestra eventos "Llamada" (entrante/perdida) como último evento en **≈ 10–12 chats de ≈ 116 (≈ 10 %)**; muchos con el aviso "Devuelve las llamadas en tu teléfono". No se llamó a nadie ni se abrió ningún panel de llamada.
- Patrón: la llamada suele ir **antes o después** de un intercambio de texto (coordinación de llegada, consulta urgente, aliados). Los aliados también llaman.

### 11.2 Estrategia futura
| Situación | Acción |
|---|---|
| **Llamada en horario de atención** | **Humano prioritario.** Alerta inmediata (no la atiende el agente). El agente solo registra la llamada y el contexto del chat. |
| **Llamada fuera de horario / sin humano disponible** | Mensaje automático posterior: "Vimos tu llamada. En este momento no podemos atender; te respondemos desde las 8:00 a.m. Si es por una reserva, cuéntanos fecha y personas por aquí y te ayudamos." + tarea de **callback** para el humano. |
| **Llamada perdida de un huésped con reserva activa o "llegada inminente"** | Prioridad máxima: mensaje de texto + alerta al equipo. |
| **Llamada de aliado/proveedor** | Etiqueta B2B; humano. |

**FUTURO:** WhatsApp Business **Calling API** + agente/operador. Fase 1: solo registrar eventos de llamada. Fase 2: enrutar a operador. Fase 3 (opcional, requiere decisión legal y de producto): agente de voz con transparencia explícita. **No implementar en este GOAL.**

---
## 12. TEST_CASES (conversaciones sintéticas basadas en patrones reales; sin datos de clientes)

Convenciones: `HOY` = fecha de la conversación. `[Odoo]` = consulta de disponibilidad/tarifa. `ESC` = escalar a humano. Propiedades abreviadas: AS = Hotel Atheron Suite, CA = Casa Algarra, CN = Casa Neusa, AA = Apartamentos Algarra, CC = Colonial Confort, LM = La Margarita.
Todos los casos suponen que los valores de precio/cupo vienen de Odoo y que `DATA_GAP` se responde con "lo confirmo".

### 12.1 Casos simples (T01–T10)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T01 | "Hola buenas tardes, ¿hay habitaciones disponibles?" | Chat nuevo | CONSULTA_DISPONIBILIDAD | fecha, personas | No aún | Saludar una vez y pedir **un** dato: "¿Para qué fecha y cuántas personas?" (ninguno dado) | No |
| T02 | "Hay habitaciones para esta noche, somos 2" | Chat nuevo | CONSULTA_DISPONIBILIDAD | propiedad por defecto AS, fecha=HOY, 2 pers | Sí | No volver a preguntar fecha ni personas; consultar y ofrecer 1–2 opciones | No |
| T03 | "¿Qué precio tiene la noche?" | Chat nuevo | CONSULTA_PRECIO | fecha, personas | No aún | Pedir fecha (y personas si falta); no dar tarifa fija | No |
| T04 | "Precio para una pareja y qué incluye" | Chat nuevo | CONSULTA_PRECIO + PAREJA | fecha | No aún | Pedir fecha; explicar que el precio incluye lo de la ficha (aseo, WiFi, etc.) | No |
| T05 | "¿A qué hora es el check in y el check out?" | Sin reserva | CHECKIN/CHECKOUT | propiedad | No | Responder directo (AS: 15:00/11:00); si no sabe propiedad, preguntar cuál | No |
| T06 | "¿Quedan cerca de la Catedral de Sal?" | Hablaba de AS | UBICACION | — | No | "A ~1,4 km, unos 16 min a pie" (dato web) | No |
| T07 | "¿Tienen habitación para 1 persona?" | Chat nuevo | CONSULTA_DISPONIBILIDAD S1 | fecha | No aún | Pedir fecha | No |
| T08 | "Buenas" | Chat nuevo | SALUDO_SOLO | — | No | Saludo breve + "¿en qué te puedo ayudar?" (sin menú largo) | No |
| T09 | "Gracias" | Tras cotización | CIERRE | — | No | "Con gusto. Si quieres te la separo con el anticipo." (1 línea) | No |
| T10 | "¿Dónde queda?" | Sin reserva | UBICACION | propiedad | No | AS: "Cra. 9 #10-32, centro de Zipaquirá"; otras: "la dirección exacta se entrega al confirmar" | No |

### 12.2 Ambigüedades (T11–T18)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T11 | "Para el puente" | Sin más datos | CONSULTA_DISPONIBILIDAD | qué puente/fechas, personas | No | Preguntar cuáles fechas exactas ("¿de qué día a qué día?") | No |
| T12 | "Para 2" | Antes dio fecha | CONSULTA_DISPONIBILIDAD | ¿2 personas o 2 habitaciones? | No | Aclarar solo eso: "¿2 personas o 2 habitaciones?" | No |
| T13 | "¿Cuánto cuesta?" | Antes se habló de 3 habitaciones | CONSULTA_PRECIO | fecha | No | Pedir fecha; no asumir noche | No |
| T14 | "El sábado" | Sin año ni mes | FECHA | confirmar fecha completa | No | "¿Sábado 10 de octubre?" (próximo sábado) | No |
| T15 | "Para dos personas o cada persona?" (cliente preguntando precio) | Tras precio | ACLARACIÓN_PRECIO | — | No | Aclarar si el precio es por habitación o por persona, según propiedad | No |
| T16 | "Tienen algo?" | Chat nuevo | CONSULTA_DISPONIBILIDAD | fecha, personas | No | Preguntar fecha y personas en una sola frase corta | No |
| T17 | "Quiero reservar" | Chat nuevo | RESERVA | fecha, personas, propiedad | No | Guiar: fecha y personas primero | No |
| T18 | "Esa de 120" | Tras mostrar opciones | SELECCIÓN | confirmar cuál opción | No | Identificar opción desde contexto; confirmar nombre de habitación | No |

### 12.3 Cambios de opinión (T19–T24)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T19 | "Mejor 3 noches" | Cotizó 2 noches | CAMBIO_FECHAS/NOCHES | fechas actualizadas | Sí | Recalcular con 3 noches; confirmar en una línea | No |
| T20 | "Ya no somos 2, somos 4" | Cotizó para 2 | CAMBIO_PERSONAS | — | Sí | Re-consultar; proponer habitación para 4 o dos habitaciones | No |
| T21 | "Mejor con baño privado" | Cotizó compartido | PREFERENCIA | — | Sí | Mostrar opción privada y diferencia de precio | No |
| T22 | "Pensándolo mejor, no" | Tras cotización | CANCELA_CONSULTA | — | No | Cerrar amable; dejar puerta abierta | No |
| T23 | "Cambio de planes, mejor otra fecha" | Con anticipo pagado | CAMBIO_FECHAS | nueva fecha | Sí (ver cupo) | Recoger nueva fecha y **escalar** (política) | **Sí** |
| T24 | "Dame mejor la más barata" | Vio 3 opciones | PRESUPUESTO | — | No (ya consultado) | Elegir la más económica **disponible** y explicar diferencia | No |

### 12.4 Varios huéspedes (T25–T31)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T25 | "Somos 3 adultos, una noche" | — | S3 | fecha | Sí | Opciones de 3 personas (AS 302 / 202) | No |
| T26 | "Somos 4, 2 adultos y 2 niños" | — | FAMILIA | edades, fecha | Sí | Preguntar edades; **no aplicar tarifa de niños inventada** | **Sí si piden tarifa de niños** |
| T27 | "Somos 6 para el fin de semana" | — | S5 | fechas, ¿cocina? | Sí | Ofrecer suite AS (6–7) o AA; preguntar cocina | No |
| T28 | "Somos 9 amigos" | — | S6 | fechas, ¿carro?, ¿mascotas? | Sí | Ofrecer AA/CN/CA; precio total desde Odoo | **Sí (cotización de grupo)** |
| T29 | "Somos 13, es retiro de empresa" | — | S7 GRUPO | fechas, factura | Sí | Pasar a humano con resumen | **Sí** |
| T30 | "Somos 25 personas" | — | S8 GRUPO | fechas, presupuesto | Sí | Proponer dividir entre propiedades; humano | **Sí** |
| T31 | "Somos 2 adultos y un bebé" | — | FAMILIA | edad bebé | Sí | Preguntar si el bebé necesita cuna (DATA_GAP) y pasar a humano si es cuna | Sí si cuna |

### 12.5 Mascotas (T32–T36)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T32 | "¿Aceptan perros?" | Sin propiedad | MASCOTA | propiedad, tamaño | No | Decir que depende de la propiedad; preguntar fechas y tamaño; ofrecer AA/AS bajo consulta | Sí si pide aprobación/costo |
| T33 | "Voy con mi perro a Colonial Confort" | Eligió CC | MASCOTA | — | No | Informar que CC **no** admite mascotas y ofrecer AA/AS | No |
| T34 | "Tengo reserva y llevo mi perro, ¿pasa algo?" | Reserva existente | MASCOTA | — | Ver reserva | No prometer; escalar (aprobación/costo) | **Sí** |
| T35 | "Vamos con 2 perros grandes" | Para CN | MASCOTA | — | Sí | Informar aprobación previa y costo adicional (web); consultar costo con humano | **Sí** |
| T36 | "¿Cobran por mascota en Algarra apartamentos?" | — | MASCOTA | — | No | Informar "cargo de aseo adicional" sin cifra (DATA_GAP) y escalar para monto | **Sí** |

### 12.6 Parqueadero (T37–T42)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T37 | "¿Tienen parqueadero?" | AS | PARQUEADERO | carro/moto | No | "¿Es carro o moto?" y luego dato verificado | No |
| T38 | "Carro" | Tras T37 | PARQUEADERO | — | No | AS: sin propio; parqueadero aliado ≈ 2,5 cuadras, ≈ $15.000/noche; sujeto a cupo | No |
| T39 | "De moto" | AS | PARQUEADERO | — | No | Moto sin costo en parqueadero aliado, sujeto a cupo; confirmar el mismo día | Sí si pide garantía |
| T40 | "Tengo 2 carros" | CA | PARQUEADERO | — | No | CA: 2 vehículos incluidos (web) | No |
| T41 | "Parqueadero para camioneta alta" | AA | PARQUEADERO | — | No | AA: cubierto, cupo limitado; altura = DATA_GAP → escalar | **Sí** |
| T42 | "¿Qué tan lejos está el parqueadero?" | AS | UBICACION_PARQ | — | No | "A unas 2 cuadras y media" | No |

### 12.7 Múltiples noches (T43–T46)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T43 | "Del 20 al 25 de octubre, 2 personas" | — | S2 multi-noche | — | Sí | 5 noches; cotizar total; no asumir descuento | No |
| T44 | "Una semana" | Sin fecha | CONSULTA | fecha inicio | No | Pedir fecha de inicio | No |
| T45 | "¿Hay descuento por varias noches?" | Cotizó 5 | PRECIO | — | No | "Lo consulto con el equipo" (regla no documentada) | **Sí** |
| T46 | "Me quedo 3 noches pero la tercera en otra habitación" | Disponibilidad parcial | CAMBIO_HAB | — | Sí | Consultar combinaciones; ofrecer | No |

### 12.8 Cambio de fechas / extensión (T47–T50)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T47 | "¿Puedo cambiar mi reserva al domingo?" | Reserva con anticipo | CAMBIO_FECHAS | nueva fecha | Sí | Verificar cupo; **escalar** | **Sí** |
| T48 | "Quiero quedarme una noche más" | En estadía | EXTENSION | — | Sí | Consultar cupo; confirmar con humano | **Sí** |
| T49 | "Salgo más tarde, ¿puedo?" | Día de salida | CHECKOUT_TARDE | — | No | Informar check-out y que se consulta; AS: no hay dato de costo (DATA_GAP) | **Sí** |
| T50 | "Entro más temprano, a las 10" | Reserva AS | CHECKIN_TEMPRANO | — | No | Informar check-in 15:00; escalar para ingreso temprano | **Sí** |

### 12.9 Precio y objeciones (T51–T56)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T51 | "¿No hay algo más económico?" | Vio 2 opciones | PRESUPUESTO_LIMITADO | — | No (ya consultado) | Ofrecer la más económica disponible; explicar diferencia | No |
| T52 | "Está muy caro" | Cotizó | OBJECION_PRECIO | — | No | Empatía + valor (qué incluye) + alternativa; sin descuento inventado | No |
| T53 | "¿Me haces descuento?" | Cotizó | DESCUENTO | — | No | "Lo consulto con el equipo" | **Sí** |
| T54 | "Booking me lo ofrece más barato" | — | OBJECION_PRECIO | — | No | No discutir; ofrecer consultar con equipo | **Sí** |
| T55 | "¿El precio es por persona o por habitación?" | AS | ACLARACIÓN | — | No | Responder según propiedad (AS: por habitación según ocupación; CC: por adulto; LM: por persona desde web) | No |
| T56 | "Es mucho, tengo solo 80 mil" | Presupuesto | PRESUPUESTO_LIMITADO | — | Sí | Buscar opción ≤ presupuesto en Odoo; si no hay, decirlo | No / Sí si pide igualar |

### 12.10 Anticipo y pago (T57–T62)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T57 | "¿Cuánto es el abono?" | Cotizó 2 noches | ANTICIPO | — | Sí (total) | Dar % oficial (**DATA_GAP**: 30 % o 50 %); si no definido, escalar | **Sí hasta definir regla** |
| T58 | "¿A qué cuenta consigno?" | Aceptó reservar | PAGO | — | No | Enviar plantilla oficial de pago (no escribir cuentas de memoria) | No |
| T59 | "Puedo pagar con tarjeta" | — | METODO_PAGO | — | No | Explicar link de pago; **recargo 5 %** | No |
| T60 | "Ya pagué" + imagen | Tras plantilla | ENVIO_COMPROBANTE | — | No | "Recibido, lo valido con el equipo y te confirmo" | **Sí** |
| T61 | "¿Te pago mañana?" | Quedan 2 cupos | ANTICIPO_DIFERIDO | — | No | Explicar que el anticipo asegura el cupo; no garantizar; escalar si insiste | Sí si insiste |
| T62 | "Pago al llegar" | Fin de semana | PAGO | — | No | Explicar política (DATA_GAP) y que el anticipo asegura; escalar si no hay regla | **Sí** |

### 12.11 Mensajes cortados (T63–T66)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T63 | "Hola" / "buenas tardes" / "hay habitaciones" / "es para dos adultas" (4 burbujas en 10 s) | Chat nuevo | CONSULTA_DISPONIBILIDAD | fecha | No aún | **Una** respuesta agrupada; pedir solo fecha (ya dio personas) | No |
| T64 | "Para el sábado" / "3 de octubre" | Tras T63 | FECHA | — | Sí | Consultar con 2 personas, sáb 3-oct | No |
| T65 | "me interesa" / "Hotel Atheron Suite" / "quiero consultar disponibilidad" (mensaje de plantilla web con campos vacíos) | Click-to-WhatsApp | CONSULTA_DISPONIBILIDAD | fecha, salida, huéspedes | No | Reconocer origen web; pedir los 3 campos en **una** línea | No |
| T66 | "Fecha de llegada: / Fecha de salida: / Número de huéspedes:" (campos vacíos) | Plantilla enviada sin llenar | CONSULTA | los tres | No | Pedir completar con ejemplo corto | No |

### 12.12 Audio (T67–T71)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T67 | [Audio 12 s: "hola, ¿tiene habitación para dos esta noche?"] | Chat nuevo | CONSULTA_DISPONIBILIDAD | — | Sí | Transcribir; confirmar en texto: "Entendí: 2 personas, esta noche"; consultar | No |
| T68 | [Audio ruidoso, ininteligible] | — | AUDIO_ILEGIBLE | texto | No | Pedir texto breve con fecha y personas | Sí si repite |
| T69 | [Audio 45 s con 3 preguntas: precio, parqueadero, check-in] | AS | MULTI_INTENCIÓN | fecha | Sí (precio) | Responder las 3 por orden en texto corto; pedir fecha | No |
| T70 | [Audio en inglés: "do you have a room for two?"] | Extranjero | CONSULTA_DISPONIBILIDAD | fecha | Sí | Responder en inglés si hay soporte (DATA_GAP); si no, escalar | Sí si no hay soporte |
| T71 | [Audio: "ya llegué, estoy afuera"] | Reserva hoy | LLEGADA_INMINENTE | — | Ver reserva | Alertar humano **inmediatamente**; texto breve: "Ya te abren" | **Sí** |

### 12.13 Cliente molesto (T72–T75)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T72 | "Llevo 20 minutos esperando y nadie abre!!" | Reserva activa | RECLAMO | — | No | Disculpa breve + alerta humana inmediata | **Sí** |
| T73 | "Esto es una estafa, ya pagué y no me confirman" | Pagó anticipo | RECLAMO/PAGO | — | No | Empatía, no justificar; escalar con resumen | **Sí** |
| T74 | "El agua no sale caliente" | En estadía | INCIDENCIA | habitación | No | Escalar a operaciones; no prometer solución | **Sí** |
| T75 | "Pésimo servicio, quiero mi plata" | — | RECLAMO/REEMBOLSO | — | No | No prometer reembolso; escalar | **Sí** |

### 12.14 Pide humano (T76–T78)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T76 | "Quiero hablar con una persona" | Cualquier | HABLAR_CON_HUMANO | — | No | Confirmar que se pasa; resumen al humano | **Sí** |
| T77 | "¿Eres un robot?" | — | IDENTIDAD | — | No | Responder con honestidad (asistente de Atheron) y ofrecer persona | Opcional |
| T78 | "Llámame" | — | LLAMADA | teléfono | No | Registrar callback; humano | **Sí** |

### 12.15 Dato desconocido (T79–T82)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T79 | "¿Tienen desayuno?" | AS | PREGUNTA_PROPIEDAD | — | No | "No lo tengo confirmado; lo consulto" (DATA_GAP) | Sí |
| T80 | "¿Los niños pagan en La Margarita?" | LM | NIÑOS | — | No | **No inventar 50 %**; consultar con administración | **Sí** |
| T81 | "¿Cuál es la política de cancelación?" | Pre-reserva | CANCELACION | — | No | No inventar; consultar | **Sí** |
| T82 | "¿Tienen factura electrónica?" | AS | FACTURA | — | No | AS ofrece facturación electrónica (web); pedir datos fiscales al humano | Sí |

### 12.16 Disponibilidad agotada (T83–T86)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T83 | "Para mañana, 2 personas" | Odoo: AS sin cupo | CONSULTA_DISPONIBILIDAD | — | Sí | Decir sin cupo en AS; ofrecer CC o LM si hay en Odoo | No |
| T84 | "Para el 31 de octubre, 8 personas" | Todo lleno | CONSULTA_DISPONIBILIDAD | — | Sí | Informar sin cupo; ofrecer fechas cercanas o lista de espera (a definir) | Sí (lista de espera) |
| T85 | "Solo queda una" (cliente pregunta si alcanza para 3) | Quedó 1 habitación de 2 | S3 | — | Sí | Decir que esa no alcanza; proponer alternativa o 2 habitaciones | No |
| T86 | "Avísame si se libera" | Sin cupo | LISTA_ESPERA | contacto | No | Registrar interés (proceso a definir); no prometer | Sí |

### 12.17 Reservas OTA, llegada tarde, B2B y llamadas (T87–T95)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T87 | "Hice una reserva por Booking, ¿está confirmada?" | — | CONFIRMAR_RESERVA_OTA | nombre/fechas | Sí (si sincronizado) | Pedir nombre y fechas; si no se encuentra, escalar | Sí si no aparece |
| T88 | "¿A qué hora llego a la reserva de Booking?" | Reserva ubicada | CHECKIN | — | Sí | Check-in de la propiedad y bienvenida | No |
| T89 | "Cancélenla por la plataforma / no pude llegar" | Reserva OTA | CANCELACION | — | Sí | Empatía; **no** prometer reembolso; escalar | **Sí** |
| T90 | "Llego a las 11 de la noche" | Reserva AS | LLEGADA_TARDE | hora, teléfono | No | Registrar hora; confirmar con humano si hay recepción (DATA_GAP) | **Sí** |
| T91 | "Estoy en carretera, llego después de las 8" | Reserva | LLEGADA_TARDE | — | No | Registrar y avisar a recepción | Sí |
| T92 | "Consulta de disponibilidad para un cliente" (aliado) | Línea de aliados | ALIADO_CONSULTA | — | — | No responder como huésped; etiquetar B2B | **Sí** |
| T93 | "Cuadremos cuentas de septiembre" (aliado) | — | ALIADO_LIQUIDACION | — | — | No responder; etiquetar | **Sí** |
| T94 | "Cotización de cámaras de seguridad" | Línea Security | FUERA_DE_ALCANCE | — | — | Indicar que este canal es de hospedaje y derivar; sin cotizar | Sí |
| T95 | [Llamada perdida del huésped] | Sin humano | LLAMADA | — | No | Mensaje de texto posterior + tarea de callback | **Sí** |

### 12.18 Contexto y memoria (T96–T100)
| ID | INPUT | CONTEXT | EXPECTED_INTENT | DATA_REQUIRED | ODOO | EXPECTED_BEHAVIOR | ESC |
|---|---|---|---|---|---|---|---|
| T96 | "Somos 4 para mañana." | Chat nuevo | CONSULTA_DISPONIBILIDAD | propiedad | Sí | **No** preguntar fecha ni personas; consultar | No |
| T97 | "¿Y parqueadero?" | Ya dio fecha, 4 personas y AS | PARQUEADERO | carro/moto | No | Solo preguntar carro/moto; no repetir fecha | No |
| T98 | "Lo mismo pero para el sábado siguiente" | Cotizó previa | CAMBIO_FECHAS | — | Sí | Recalcular con mismas personas y propiedad | No |
| T99 | "¿Cuánto era?" | Ya cotizó hace 10 min | CONSULTA_PRECIO | — | No | Repetir el total que dio, con fecha y personas | No |
| T100 | "Gracias, ya reservé en otro lado" | Tras cotización | CIERRE | — | No | Cierre amable, una línea; no insistir | No |

**Total: 100 casos** (≥ 75 requeridos). Cobertura: simples, ambigüedades, cambios de opinión, varios huéspedes, mascotas, parqueadero, múltiples noches, cambio de fechas, precio, anticipo, mensajes cortados, audio, cliente molesto, humano, dato desconocido, sin disponibilidad, OTA, llegada tarde, B2B/fuera de alcance, llamadas, memoria de contexto.

---
## 13. RECOMMENDED_NEXT_IMPLEMENTATION

**Antes de construir el agente (bloqueantes):**
1. **Resolver los DATA_GAPS críticos 1–5** de la sección 6 (cancelación, % anticipo, fuente única de tarifas, regla de descuentos, marca por número). Sin ellos el agente debe escalar siempre en esos temas.
2. **Segunda pasada de auditoría con más historial**: exportar chats desde el teléfono (chats comerciales de 25/6 hacia atrás, si existen) o pedir los mensajes anteriores en el propio teléfono. Meta: ≥ 40 conversaciones comerciales completas y estadísticas reales (tiempo de respuesta, conversión).
3. **Separar líneas**: etiquetar chats de aliados, personal, proveedores y Atheron Security para que el agente solo atienda huéspedes/leads.

**Fase A — Agente en modo sombra (sin enviar):**
- Recibe mensajes, clasifica intención (sección 1), propone respuesta; humano aprueba. Medir exactitud contra los 100 casos de prueba.
- Etiquetado automático de chats (huésped / aliado / otro) y de llamadas/audios.

**Fase B — Respuesta automática limitada:**
- Solo intenciones de bajo riesgo: saludo, preguntas de check-in/out, parqueadero (dato verificado), ubicación AS, recopilación de fecha/personas.
- Disponibilidad y precio: conectar **Odoo** con consulta estructurada `(propiedad, fecha_in, fecha_out, huéspedes, habitaciones)` y respuesta con tarifa vigente; el agente nunca calcula tarifas por su cuenta.

**Fase C — Cierre asistido:**
- Cotización + plantilla de pago oficial + recepción de comprobante → **humano valida** → plantilla de confirmación con N.º de reserva (Odoo).
- Recolección de datos de llegada (con aviso de tratamiento de datos; DATA_GAP #20).

**Fase D — Audio y llamadas:**
- Descarga y transcripción de audios por API (sección 10); registro de llamadas y callback (sección 11). Calling API como proyecto aparte.

**Medición recomendada:** tasa de conversión por intención, tiempo hasta primera respuesta, % de chats escalados, errores de dato (precio/cupo), satisfacción post-estadía.

**Gobernanza:** versionar este Playbook; toda tarifa/política nueva entra por Odoo o por una ficha firmada, nunca por el prompt.

---

# REPORTE FINAL

```
STATUS: COMPLETADO CON LIMITACIONES (muestra de conversaciones largas por debajo del mínimo; ver sección 0)
CHATS_REVIEWED: ≈ 24 completos (≈ 14 comerciales) + ≈ 116 por vista previa + ≈ 45 fragmentos por búsqueda de palabras clave
PERIOD_REVIEWED: 1/7/2026 – 3/10/2026 (historial disponible en WhatsApp Web desde 25/6/2026; vistas previas concentradas 18/9–3/10)
INTENTS_FOUND: 42 (20 con ficha operativa detallada)
PROPERTIES_FOUND: 6 comercializables (Hotel Atheron Suite, Casa Algarra, Casa Neusa, Apartamentos en Algarra, Hotel Colonial Confort, Hotel La Margarita) + 1 proyecto no reservable (Casa Colonial Centro)
FAQ_COUNT: 30
SALES_SCENARIOS: 18 (8 por tamaño de grupo + 10 variantes)
DATA_GAPS: 20 (5 críticos)
AUDIO_PATTERNS: ≈ 12–14 % de chats con nota de voz como último mensaje; 3–42 s; audios también enviados por el equipo; contenido inferido, no escuchado
CALL_PATTERNS: ≈ 10 % de chats con evento "Llamada" como último evento; coordinación de llegada, aliados y consultas urgentes
TEST_CASES_CREATED: 100
PRIVACY_CHECK: OK — informe sin nombres, teléfonos, documentos, cuentas, claves WiFi/acceso ni comprobantes. Se omiten número de cuenta, llave y RNT. Se vieron datos sensibles en pantalla (documentos de identidad en plantillas de reserva, claves de acceso y WiFi, cuenta bancaria empresarial) y NO se copiaron.
WHATSAPP_CHANGED: NO (intencionalmente). Solo se desplazó la lista, se abrieron chats ya leídos y se usó el buscador (texto escrito únicamente en el buscador; nunca en el cuadro de mensaje). No se envió, reaccionó, borró, archivó, bloqueó, marcó ni reenvió nada; no se tocó configuración, dispositivos vinculados ni coexistencia/API. No se pulsó "obtener mensajes anteriores del teléfono". Nota: abrir un chat puede, en teoría, marcarlo como leído si tenía mensajes sin leer; se evitaron los chats con indicador de no leído, pero no se pudo verificar al 100 % cada uno.
NEXT_STEP: Resolver DATA_GAPS 1–5 con el dueño y ampliar la muestra con historial del teléfono; luego Control Maestro audita este Playbook y lo convierte en contrato del agente (Fase A en modo sombra).
FINAL_SEMAPHORE: AMARILLO — base sólida y auditable para el contrato del agente; no apta aún para respuestas automáticas en cancelación, anticipo, descuentos, niños y mascotas hasta cerrar los DATA_GAPS críticos.
```

