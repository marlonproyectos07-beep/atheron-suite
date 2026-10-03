# CEO_CASES_V1 — fuente canónica de los 12 casos CEO

> Origen: decisión de Control Maestro, 2026-10-03. No existe un artefacto histórico previo de "12 casos CEO";
> **este archivo es la fuente canónica** (v1). Los IDs CEO-01…CEO-12 no se renumeran.
> Modo: `WHATSAPP_AUTOMATION_MODE=shadow` (el agente propone; nunca envía).

## Política oficial de cancelación — reservas directas (texto exacto)

> «Cancelación o cambio hasta 48 horas antes del check-in: no hay devolución en efectivo. El valor pagado queda como saldo a favor durante 6 meses para una nueva reserva en Hoteles Atheron, sujeto a disponibilidad y a la tarifa vigente de las nuevas fechas. Si la nueva tarifa es superior, el huésped paga la diferencia. Solicitudes con menos de 48 horas, no-show o casos excepcionales pasan a revisión humana. Las reservas realizadas mediante Booking, Airbnb u otra OTA se rigen primero por las condiciones de la plataforma.»

*Marca canónica:* «Hoteles Atheron». Historial de la corrección en [CHANGELOG_WHATSAPP.md](CHANGELOG_WHATSAPP.md).

## Anticipo oficial

50 % del total vigente para reservas directas. (Odoo STAGING puede seguir mostrando 30 %: se corrige en una sesión autenticada separada; no se modifica desde estas sesiones.)

## Casos

### CEO-01
Cliente pide descuento/rebaja/mejor precio.
EXPECTED: ESCALATE_HUMAN. Nunca modificar precio.

### CEO-02
Cliente pregunta cuánto debe abonar después de una cotización válida.
EXPECTED: 50% del total vigente.

### CEO-03
Reserva directa. Cliente solicita cancelar/cambiar con más de 48 horas antes del check-in.
EXPECTED: explicar política:
- no devolución en efectivo;
- saldo a favor 6 meses;
- sujeto a disponibilidad;
- se aplica tarifa vigente de nueva fecha;
- si la nueva tarifa es superior, paga diferencia.

### CEO-04
Reserva directa. Solicitud de cancelación/cambio con menos de 48 horas.
EXPECTED: ESCALATE_HUMAN. No decidir devolución ni penalidad automáticamente.

### CEO-05
“Booking me sale más barato.”
EXPECTED: no discutir; no igualar; ESCALATE_HUMAN.

### CEO-06
“Somos cuatro para mañana.”
EXPECTED: conservar pax=4 y fecha=mañana; no volver a preguntar esos datos; consultar disponibilidad cuando proceda.

### CEO-07
Mensajes fragmentados: “Hola” / “somos dos” / “para mañana”.
EXPECTED: agrupar contexto; una sola respuesta; no preguntar otra vez pax/fecha.

### CEO-08
“Ya no somos dos, somos tres.”
EXPECTED: actualizar contexto; reconsultar disponibilidad/tarifa; no conservar cotización anterior como válida.

### CEO-09
Mensaje identificado como aliado/hotel B2B.
EXPECTED: ALLY_B2B; no responder como huésped; ESCALATE_HUMAN.

### CEO-10
Mensaje sobre cámaras/alarmas/seguridad electrónica.
EXPECTED: ATHERON_SECURITY; fuera del flujo hotelero; derivar/humano.

### CEO-11
“Necesito alojamiento para 150 personas.”
EXPECTED: STRATEGIC_GROUP_LEAD; pedir únicamente datos faltantes; consultar capacidad verificada disponible; no prometer cupo total; no inventar descuento; GROUP_PRICING_APPROVAL / humano.

### CEO-12
Cliente envía comprobante o dice “ya pagué”.
EXPECTED: no confirmar reserva automáticamente; PAYMENT_VALIDATION_REQUIRED; ESCALATE_HUMAN hasta validación.
