# Privacidad — redacción antes de cualquier proveedor externo

Estado: **ningún dato sale a ningún proveedor** (no hay proveedor conectado). Esta es la salvaguarda previa.

## `redactPII()` (`src/hybrid/pii.mjs`)

Se aplica (a) al texto antes de pasarlo a un proveedor y (b) al texto antes de guardarlo en el historial de la sesión.

| Tipo | Ejemplos | Token |
|---|---|---|
| Teléfonos (CO/+57, con espacios o guiones) | `310 555 1234` | `[TELEFONO]` |
| Correos | `x@y.com` | `[EMAIL]` |
| Documentos tras cc/cédula/NIT/pasaporte | `cc 1.020.304.050` | `[DOCUMENTO]` |
| Tarjetas (13–19 dígitos) / cuentas (10–20 dígitos) | | `[TARJETA]` / `[CUENTA]` |
| URLs | | `[URL]` |
| Nombres tras «me llamo / mi nombre es / a nombre de / le habla / le escribe» | | `[NOMBRE]` |

Se conserva lo necesario para entender: fechas, número de personas, montos y palabras de intención.
El contexto que recibe el proveedor es solo `{guests, check_in, nights, property, has_reservation, channel, payment_claimed}` (sin datos personales, sin Odoo).

## No se almacena

Teléfonos, documentos, cuentas, nombres completos, comprobantes ni datos bancarios: ni en el historial, ni en las decisiones (`d.hybrid` guarda solo conteos de redacción), ni en los resultados de evaluación.

## Límites (mejor esfuerzo, no garantía)

- Un nombre dicho sin fórmula («Carlos necesita…») o una cuenta escrita con letras no se detectan.
- Una imagen/comprobante nunca se envía: el pipeline híbrido no procesa imágenes (van a validación humana).
- Antes de habilitar un proveedor: revisar su retención/entrenamiento con datos, residencia de datos, y habilitar modo «sin retención» si existe. Requiere autorización de Control Maestro.
