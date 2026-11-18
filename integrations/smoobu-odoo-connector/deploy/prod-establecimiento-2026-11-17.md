# Establecimiento SIRE/TRA en produccion (atheron1, 2026-11-17/18)

## Datos acreditados y fuente
| Campo | Valor | Fuente |
|---|---|---|
| Nombre | Atheron Suite | orden de gerencia |
| Codigo interno estable | `RNT-235267` (xmlid `__ath_sire_tra__.est_atheron_suite`) | interno |
| RNT | 235267 | certificado RNT (Camara de Comercio de Bogota, expedido 18/03/2026), adjunto "RNT ACTUAL.pdf" en correo enviado; correos del RNT y de TRA |
| Vencimiento RNT | 2027-03-31 | mismo certificado |
| Categoria (informativa, no hay campo) | Viviendas turisticas / Casa turistica | mismo certificado |
| Direccion comercial (informativa) | Carrera 9 # 10-32, Zipaquira, Cundinamarca | mismo certificado |
| Titular inscrito en el RNT (informativo) | persona natural (gerente); NIT en el certificado, no se copia aqui (repositorio publico) | mismo certificado; correo RNT "Cambio de estado" (4 ene) |
| SIRE codigo empresa | 119520 | correo Migracion "Control Empresarial: Cuenta de Usuario Autorizada" (28 ago) |
| SIRE codigo ciudad | 25899 | mismo correo |
| TRA modo | manual (portal) | emisor por API apagado por decision previa |

Banderas: `x_sire_codes_verified = false`, `x_sire_export_enabled = false`, `x_tra_config_verified = false`.

## Pendientes (campo exacto y motivo)
- `x_rnt_holder_id` (Titular del RNT): **vacio**. Ningun contacto coincide con el certificado: el contacto 1934 tiene
  un NIT con un digito distinto y el NIT del certificado esta en el contacto 958, que es de otra persona.
  Corregir contactos antes de vincular.
- `x_address_partner_id` (Direccion): **vacio**; el contacto "ATHERON SUITE" (id 2402) no tiene direccion. No se creo otro.
- `x_operator_company_id` (Operador): **vacio**. No acreditado si opera ATHERON S.A.S (compania 5) o la persona natural.
- `x_sire_reporter_id` (Quien reporta a SIRE): **vacio**. La autorizacion SIRE esta dirigida a una tercera persona; no prueba usuario ni representacion.
- Obligado (persona natural titular del RNT vs. ATHERON SAS titular de la cuenta SIRE): **sin decidir**.
- `x_sire_move_in_code`, `x_sire_move_out_code`, `x_sire_date_format`, `x_sire_encoding`: requieren paquete de guia SIRE.
- `x_tra_accommodation_type`, `x_tra_cost_basis`: requieren respuesta MinCIT (radicado 1-2026-041876, solo acuse).

## Habitaciones (solo metadatos propios)
- 201 (28), 202 (29), 203 (30), 301 (31), 302 (32): `x_unit_kind = fisica`, establecimiento 1.
- Casa Completa - La Magia de Zipaquira (79): `derivada`, establecimiento 1, componentes 28-32 (agregados, no reemplazados).
- No se crearon habitaciones; producto Casa Completa (58223) y sus relaciones intactos.

## Automatizacion 26 (Booking Engine)
`on_create_or_write` con campos disparadores `active` y `calendar_id` unicamente: escribir los campos propios no la dispara.
Unica otra regla activa en `resource.resource`: 27 (al borrar). No se desactivo nada.

## Linea base (antes = despues, comparacion registro a registro)
- Disponibilidad (`x_availability` de las 6 ofertas): 2500 filas, 556 noches reservadas, 0 por recalcular,
  0 filas distintas (id, fecha, reservado, total, recalcular, activo y write_date).
- Recursos: sin cambios fuera de los campos propios (ocupacion 201 ocupada, 202/301/302 salida hoy, 203 libre; 0 ocupantes).
- planning.slot de esas unidades: 518 (8 futuras, identicas).
- Repetido tras validar las fichas sinteticas: 0 diferencias.

## Verificacion de Recepcion
- Fichas sinteticas (COT/2026/03901, cancelada) con habitacion 203: **Validar datos OK**, quedan *validadas* con el
  establecimiento; sin llegada no nace ninguna obligacion; 203 sigue libre. No se registraron llegadas ni salidas.
- Caso real preparado (sin enviar): COT/2026/03839 (Smoobu, 21-22 nov), enlace vigente generado con
  *Generar enlace de registro*; reserva sin escritura; 0 correos en cola.
- Llegada/salida y transiciones de ocupacion: solo probadas en la copia `atheron1-pruebas-20261108` (vence 24/11).
