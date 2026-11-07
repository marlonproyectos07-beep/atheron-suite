# ATH-PMS-WA-063 — Agente comercial en sombra (integracion de PR #108 + #110)

Apilado sobre PR #110 (que contiene #107, #108 y #109). No fusionar de forma independiente. Sin red, sin Odoo, sin WhatsApp.

## Que agrega
`src/whatsapp-agent-shadow.mjs` compone el piloto de #108 con la consulta oficial de disponibilidad de #110:
- `validateInboundEvent`: solo mensajes entrantes de la cuenta Odoo 7 (y Phone Number ID 1334054313134716). Security y Masivos se rechazan.
- `normalizeSpanishDates`: «del 15 al 17 de noviembre» / «2 de enero» a ISO (proxima ocurrencia futura).
- `handleInbound`: deduplica por messageId, conserva contexto, pide los datos faltantes, deriva lo ambiguo/fuera de alcance y emite la consulta de lectura para exactamente las cinco habitaciones.
- `composeDraft`: con la respuesta de `checkApartmentAvailability` genera el borrador. Reglas: capacidad rechazada por Smoobu => derivar a recepcion; disponible sin precio => no cotiza; precio en COP verificado => aparece solo como borrador sujeto a aprobacion; sin disponibilidad => asesor ofrece alternativas. Siempre incluye check-in 15:00, check-out 11:00 y «no es una reserva confirmada».
- Toda salida: `sendEnabled=false`, `bookingEnabled=false`, `odooWriteEnabled=false`, `paymentEnabled=false`.

## Limitaciones conocidas (WA-061)
- Smoobu devuelve `maxOccupancy=1` en las cinco habitaciones: con 2 o mas personas todas se rechazan. El agente deriva a humano; no se cambio nada en Smoobu.
- La API no devolvio precio utilizable para las fechas consultadas: el agente no cotiza.

## Puertas abiertas para la primera respuesta real
1. Transporte Odoo -> agente (regla de automatizacion con «Enviar notificacion webhook» sobre mensajes entrantes de la cuenta 7) y donde corre el agente. Sin esto el flujo es manual.
2. Donde viven las credenciales Smoobu para el agente (hoy solo en GitHub Actions).
3. Donde ve gerencia el borrador (nota interna en Odoo requiere escritura autorizada).
4. Politica de privacidad (publicada): actualizarla antes de que un asistente automatizado procese datos de clientes.
5. Ventana de servicio de 24 h de WhatsApp: fuera de ella solo plantillas aprobadas.
6. Capacidad (1 huesped) y calendario de tarifas en Smoobu: decision de gerencia.

`node scripts/whatsapp-agent-shadow-demo.mjs` ejecuta la demostracion local.
