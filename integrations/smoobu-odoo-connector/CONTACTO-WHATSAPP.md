# ATH-ODOO-WA-004 — Contacto asistido por WhatsApp

Estado: **listo para revisión de gerencia. No fusionado, no desplegado, sin escrituras activas.**

## Qué hace

Reutiliza el conector Smoobu → Odoo existente (no hay otro conector). Cuando la sincronización cree un **pedido nuevo en borrador**,
su nota interna `ATH-SYNC` (la única escritura de este tipo que el guard ya permitía) incluye:

- **Con teléfono válido:** un enlace `https://wa.me/<número>?text=<mensaje>`. Un clic abre WhatsApp con el chat y el mensaje
  escritos; **recepción pulsa Enviar**. El código no llama a ninguna API de WhatsApp ni envía nada.
- **Sin teléfono válido:** *no* hay acción de WhatsApp. La nota dice `WhatsApp no disponible (motivo)` y da la alternativa:
  abrir la reserva en Smoobu (`https://login.smoobu.com/en/booking/detail/<id>`) y escribir desde Mensajes.

Código: `src/guest-contact.mjs` (puro, sin red). Integración: una línea en `src/sync-apply.mjs` (al crear el pedido).
No se tocó la lista blanca de escritura (`sync-write-guard.mjs`), ni variables, ni secretos, ni el issue #101.

## Datos usados (todos verificados)

| Dato | Fuente | Verificación |
|---|---|---|
| Nombre, teléfono, fechas | Respuesta de Smoobu que el conector ya lee (`guest-name`, `phone`, `arrival`, `departure`) | Sonda `reservation-once`, 2026-11-02 |
| Enlace de check-in | `guest-app-url` de Smoobu, **solo si trae valor** y es `https://login.smoobu.com/...` | En la reserva 162332151 viene **vacío**: hoy el mensaje sale sin enlace |

Nunca se inventa un dato: sin fechas o sin enlace, esa parte del mensaje se omite.

## Normalización del teléfono (E.164)

- `+57 300 123 4567`, `300-123-4567` y `573001234567` → `+573001234567`.
- `00…` se trata como internacional. Sin `+` ni `00`, solo se asume Colombia para móviles de 10 cifras que empiezan por 3.
- Se rechazan (sin acción de WhatsApp): vacío, letras, número sin código de país, longitud fuera de 8–15, fijos colombianos,
  números repetidos tipo `3000000000`.

## Ejemplo de mensaje generado (datos sintéticos)

```
Hola Ana, le escribimos de Atheron Hotels. Recibimos su reserva del 22/11/2026 al 23/11/2026. Quedamos atentos a cualquier duda.
```

Con enlace de check-in (si Smoobu lo entrega):

```
Hola Ana, le escribimos de Atheron Hotels. Recibimos su reserva del 22/11/2026 al 23/11/2026. Para agilizar su llegada puede completar el check-in en línea aquí: https://login.smoobu.com/es/online-check-in/check-in/<token> Quedamos atentos a cualquier duda.
```

Nota en Odoo (sin teléfono):

```
ATH-SYNC | clave <16 hex> | SMOOBU-170500002 | CREATE_ORDER | WhatsApp no disponible (SIN_TELEFONO) | alternativa: https://login.smoobu.com/en/booking/detail/170500002
```

## Estados independientes

`contactStates()` define **tres campos separados** que nunca se calculan entre sí:

| Estado | Valores | Fuente |
|---|---|---|
| Check-in digital | NO_VERIFICADO, PENDIENTE, ENLACE_ENVIADO, COMPLETADO | **Sin fuente verificada**: la API de Smoobu no devuelve estado (reserva 162332151). Queda NO_VERIFICADO hasta que recepción lo registre |
| Check-in físico | NO_VERIFICADO, PENDIENTE, EN_CASA, SALIDA, CANCELADO | `x_checkin_state` del turno de Odoo (`physicalFromOdoo`) |
| Pago | NO_VERIFICADO, PENDIENTE, PARCIAL, PAGADO | Facturación/pagos de Odoo, fuera del conector |

Para guardar el digital en Odoo hará falta un campo propio (por ejemplo `x_checkin_digital`, selección con los 4 valores) en
`sale.order`, creado con Studio. **No se creó**: requiere autorización de gerencia.

## Cómo habilitarlo en Odoo

1. **No hay nada que instalar en Odoo.** Este cambio vive en el conector.
2. Aparecerá en los pedidos **nuevos** que cree la sincronización, **solo cuando gerencia active escrituras** (pendiente: levantar el
   bloqueo #101, `SYNC_ARM`, usuario técnico y piloto ATH-DEV-118). Hoy no se escribe nada y los pedidos existentes no cambian.
3. Recepción abre el pedido, ve la nota interna del chatter y pulsa el enlace `wa.me`; revisa el mensaje y envía.
4. Para **contactos o pedidos existentes**, Odoo ya tiene la app WhatsApp instalada (verificado, solo lectura):
   módulos `whatsapp`, `whatsapp_account`, etc., 4 cuentas activas y 10 plantillas aprobadas. Es otro camino: usa la API de WhatsApp
   Business y plantillas aprobadas por Meta (a diferencia de `wa.me`). No existe ninguna plantilla aprobada para `sale.order`; la de
   «Confirmacion Reserva ATHERON SUITE» (`planning.slot`) está en borrador. No se creó ni modificó nada.

## Pruebas (`test/guest-contact.test.mjs`, 12 pruebas; suite completa 369/369)

- Funcionamiento: normalización, mensaje, enlace `wa.me`, plan con/sin teléfono, integración con el ejecutor (Odoo simulado).
- Privacidad: el resultado del ejecutor y el diario no contienen teléfono, correo ni enlace; el módulo no imprime ni lee entorno; el
  enlace de check-in solo se acepta de `login.smoobu.com` por HTTPS.
- Duplicados: repetir la sincronización (con o sin diario) no crea otro pedido ni otra nota ni otro enlace.
- Sin envío: ninguna llamada a WhatsApp, SMS o correo; el guard sigue aceptando solo notas internas `ATH-SYNC`.

## Limitaciones conocidas

- **Booking suele no entregar el teléfono.** En la reserva 162332151 (Booking) `phone` viene vacío y el correo es un alias. Esas
  reservas saldrán con «WhatsApp no disponible» y la alternativa por Smoobu/Booking.
- **El enlace de check-in no llega por la API** en esa reserva (`guest-app-url` vacío, sin campo de estado). Hay que revisar en la
  interfaz de Smoobu si el enlace solo existe vía la plantilla de mensajes; mientras tanto el mensaje sale sin él.
- La nota interna con `wa.me` contiene el teléfono (ya guardado en el contacto); es interna, nunca va a reportes públicos.
- La URL de la alternativa (`login.smoobu.com/en/booking/detail/<id>`) sale de lo observado en la interfaz; confirmar con una reserva real.
- Solo aplica a pedidos creados **después** de activar escrituras; no se retrocede sobre pedidos existentes.
