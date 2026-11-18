# Identidad, roles y primer caso operativo (atheron1, 2026-11-18)

Repositorio publico: los numeros de documento se citan enmascarados (`10***36`). Los valores completos estan en Odoo
(notas de auditoria en cada contacto) y en los documentos fuente.

## Auditoria de contactos (solo lectura primero)
| Contacto | Hallazgo | Uso en Odoo | Accion |
|---|---|---|---|
| 1934 "Marlon Parra" (archivado) | NIT con un digito errado (`10***26`); correo y telefono del gerente | 1 cotizacion cancelada; sin asientos ni pagos | **Corregido** a `10***36` con nota de auditoria; sigue archivado |
| 958 (arrendador del inmueble) | tiene el NIT del titular del RNT (`10***36`), cargado en 2024 por el contador externo | 3 asientos publicados del arriendo de nov-2026 (compania ATHERON S.A.S) | **No modificado** (falta su documento real; historicos contables). Nota de auditoria |
| 2402 "ATHERON SUITE" | sin direccion | 1 pago de caja y 1 recibo borrador | **Direccion completada**: Carrera 9 # 10-32, Zipaquira (250251), Cundinamarca, Colombia; nota de auditoria |

Fuentes de la identidad del titular (`10***36`): certificado RNT 235267 (CCB, 18/03/2026), comunicacion DIAN (06/08/2026)
y derecho de peticion propio. Respaldo de valores anteriores: en las notas de auditoria de cada contacto.

## Roles (evidencia, sin inferir representacion)
| Rol | Quien | Evidencia |
|---|---|---|
| Titular del RNT 235267 (TRA) | persona natural (gerente) | certificado RNT; correos del RNT y de TRA |
| Operador | ATHERON S.A.S (compania 5) | paga el arriendo del inmueble (MISCE/2026/11/0005 y 0008) y es la compania de las reservas |
| Persona que reporta a SIRE | ATHERON SAS, cod. empresa 119520, ciudad 25899 | correos de Migracion "Solicitud de Registro 7384617" y "Control Empresarial: cuenta autorizada" |
| Usuario autorizado SIRE | una persona natural con cuenta dentro de ATHERON SAS | mismo correo; **no** acredita representacion legal |

**Pendiente de aplicar en el establecimiento** (`x_rnt_holder_id` = 1934, `x_address_partner_id` = 2402,
`x_operator_company_id` = 5, `x_sire_reporter_id` = contacto ATHERON S.A.S): la escritura fue bloqueada por el control de
seguridad de la sesion; requiere confirmacion explicita.

**Pregunta abierta (obligado):** el RNT esta a nombre de la persona natural, pero opera y reporta a SIRE ATHERON SAS.

## MinCIT radicado 1-2026-041876
Solo acuse de recibo (13/11/2026). Sin respuesta de fondo al 18/11. Catalogos TRA y `x_tra_config_verified` sin cambios (no verificados).

## Reservas reales con enlace (sin enviar; 1 por reserva; reservas sin escritura; 0 correos)
| Reserva | Canal | Unidad | Fechas | Enlace vence | Falta |
|---|---|---|---|---|---|
| COT/2026/03838 | Airbnb | 201 | 17-18 nov (en casa) | 18/11 23:59 | n. huespedes, correo, telefono |
| COT/2026/03839 | Booking.com | 301 | 21-22 nov | 22/11 23:59 | n. huespedes, correo, telefono |
| COT/2026/03840 | Airbnb | 302 | 2-3 dic | 03/12 23:59 | n. huespedes, correo, telefono |
| COT/2026/03841 | Directa | 301 | 11-13 dic | 13/12 23:59 | n. huespedes, correo |
Cada reserva tiene una nota interna con estado, faltantes y siguiente paso.

## Primer caso operativo real: COT/2026/03839
Enviar el enlace por Booking.com antes del 21/11 -> formulario -> Huespedes > Por validar > habitacion 301 > Validar ->
llegada real el 21/11 solo cuando ocurra -> salida real el 22/11. TRA/SIRE oficiales apagados: revisar el primer
registro y autorizar la transmision antes de encenderlos. No se registraron llegadas ni salidas.
