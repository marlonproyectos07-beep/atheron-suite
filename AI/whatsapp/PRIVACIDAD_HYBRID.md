# Privacidad v2 — redacción y fallo cerrado antes de cualquier proveedor

Estado: **ningún dato sale a ningún proveedor** (no hay proveedor conectado). Esta es la salvaguarda previa.

## `redactPII()` v2 (`src/hybrid/pii.mjs`)

Se aplica (a) al texto antes de pasarlo a un proveedor y (b) al texto antes de guardarlo en el historial (también en modo `rules`).
Normaliza primero (NFKC: dígitos de ancho completo, caracteres invisibles, espacios raros).

| Marcador | Qué cubre | ¿Bloquea el envío? |
|---|---|---|
| `[PHONE]` | celulares CO (con o sin +57, separadores), fijos, internacionales | no |
| `[EMAIL]` | correos, incluso ofuscados («arroba», «punto») | no |
| `[URL]` | enlaces | no |
| `[NAME]` | nombres tras «me llamo», «mi nombre es», «a nombre de», «titular», «se llama», «soy Nombre», «señor/a», parentesco («mi esposa Luisa…»), con apellidos con partículas | no |
| `[ADDRESS]` | calle/carrera/avenida…, `#10-32`, «mi dirección es…», «vivo en…» | no |
| `[RESERVATION_REF]` | códigos de Booking/Airbnb (innecesarios para entender) | no |
| `[CARD]` | 13–19 dígitos (con separadores), cvv, vencimiento | **sí** |
| `[ACCOUNT]` | 10–20 dígitos, agrupados o con contexto bancario | **sí** |
| `[DOCUMENT]` | cédula, NIT, pasaporte, otros documentos | **sí** |
| `[ACCESS_CODE]` | claves, PIN, códigos de puerta/OTP, tokens, llaves privadas | **sí** |

Se conserva lo necesario para entender: fechas, número de personas, montos y horas.

## Fallo cerrado (`src/hybrid/privacy.mjs`)

Si se detecta tarjeta, cuenta, documento, código de acceso/secreto **o** algo sensible que no se reconoce con seguridad
(número largo sin clasificar, número deletreado, contexto de pago/clave con dígitos), entonces:

`external_provider_allowed = false` → el proveedor **no se llama** → `ESCALATE_HUMAN` (`HYBRID_FALLBACK:PRIVACY_BLOCKED`, bandera `EXTERNAL_PROVIDER_ALLOWED=false`).
Se prefiere no enviar antes que arriesgar PII. Aplica por igual a proveedores locales.

Detecta también **datos fragmentados en varios mensajes** (p. ej. una tarjeta enviada en dos o tres burbujas) y reescribe esos turnos en el historial como `[CARD]`/`[ACCOUNT]`.
Un teléfono, correo, nombre, dirección, URL o referencia de reserva **se redacta pero no bloquea** (un teléfono aparece en pagos por Nequi).

El contexto que recibe el proveedor es solo `{guests, check_in, nights, property, has_reservation, channel, payment_claimed}`.

## No se almacena

Teléfonos, documentos, cuentas, tarjetas, nombres completos, comprobantes ni datos bancarios: ni en el historial, ni en las decisiones (`d.hybrid` guarda solo conteos), ni en los informes de corpus.

## Límites (mejor esfuerzo, no garantía)

- Un nombre dicho sin fórmula («Carlos necesita…») no se detecta; tampoco datos escritos de formas no previstas.
- Los últimos 4 dígitos de una tarjeta («terminada en 1111») no se tratan como sensibles.
- Una imagen/comprobante nunca se envía: el pipeline híbrido no procesa imágenes (van a validación humana).
- Antes de habilitar un proveedor: revisar retención/entrenamiento con datos, residencia y modo sin retención. Requiere autorización de Control Maestro.
