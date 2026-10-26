# Pruebas obligatorias en staging antes de autorizar produccion (ATH-DEV-014)

Ver tambien `AUDITORIA-AUTOMATIZACIONES.md` y `STAGING-PLAN.md` (neutralizacion y condiciones). Estado: **ninguna ejecutada; el staging actual no existe (404, ATH-DEV-015)**. Requisitos previos nuevos: (a) duplicar la base de produccion como staging neutralizado (correo, pagos, cron y webhooks externos apagados, sin acceso a Booking/Airbnb/Smoobu), (b) cargar `ODOO_STAGING_BASE_URL`, `ODOO_STAGING_DATABASE` (variables) y `ODOO_STAGING_API_KEY` (secreto), distintos de los de produccion, (c) correr `runIsolationCheck` y exigir `STAGING_AISLADO`, (d) autorizar el nombre de la nueva base en `src/staging-guard.mjs`. El motor es solo simulacion (`writesEnabled:false`, liberaciones y coberturas `BLOCKED_UNTIL_STAGING_PROOF`). Base de staging: `atheron1-hotel-staging-20260923` (la unica autorizada; ver `integrations/odoo-hotel-gateway/src/config/odoo-staging-guard.mjs`). Cada prueba se hace con una copia/datos de prueba, con las reglas 167/169 activas tal como estan en produccion, y se documenta con ids de turnos antes y despues.

## Bloque A — crear (minimo imprescindible)
1. **Crear un turno de una noche** en el rol 37 con `state='published'`, `company_id=5`, recurso 31, `name`=clave. Comprobar: se crea el espejo de Casa (rol 69) con el mismo intervalo y `x_bloqueo_ref` = id del turno; no se crean turnos extra.
2. **Mismo turno con `state='draft'`**: comprobar que NO se crea espejo (confirma el dominio de las reglas).
3. ~~Valores de `x_hotel_block_kind`/`x_channel`~~ LEIDOS en produccion: el primero no existe; `x_channel` vacio y sin valor smoobu. Queda por probar que el turno creado cuenta como ocupado en el calculo REAL de disponibilidad (Booking Engine 1493/1495 y reglas ATHERON) y desaparece la noche de la oferta de 301 y de Casa.
3b. **Efectos laterales** de crear un turno: leer y probar las automatizaciones 12, 22, 55, 157, 164, 170, 171 (horarios, ordenes borrador, iCal hacia OTAs, deduplicacion NOBEDS). Un turno nuevo NO debe crear ordenes ni regenerar un iCal que vuelva a Smoobu.
4. **Repetir la creacion con la misma clave** (ejecucion repetida): el motor debe reportar `matched`, cero propuestas; ningun duplicado.
5. **Noche contigua** (stay de 3 noches por noche): 3 turnos + 3 espejos, sin huecos de Casa (invariante del motor).
6. **Casa Completa**: un turno en rol 69 genera 5 turnos espejo en habitaciones libres; con una habitacion ocupada la propuesta debe haber sido rechazada.

## Bloque B — huecos de la regla 169 (cobertura)
7. **Reproducir el hueco**: con un turno de Casa que cubre solo parte de la noche, crear el turno de 301: confirmar que la regla omite el espejo (Casa queda libre en el tramo restante).
8. **`x_bloqueo_ref`**: ya demostrado por metadatos que es `char` escribible y por el codigo de 167/169 que las salta; falta probar escritura real desde JSON-2 y que las otras automatizaciones no reaccionen.
9. **Turno de cobertura**: crearlo para el tramo omitido; el motor 1914 debe contarlo como ocupado y la oferta de Casa debe cerrarse. Sin esto `coverGaps` no se activa.

## Bloque C — liberar (decide el mecanismo)
10. **Cancelar con `x_checkin_state='cancelled'`** un turno propio: por el codigo del Booking Engine NO deberia liberar la noche; confirmar midiendo `x_availability` y el .ics (si lo libera, el analisis esta mal).
11. **Despublicar con `state='draft'`**: por el codigo NO libera la noche en el Booking Engine y solo sale del .ics; confirmar. Ademas, ¿otro turno solapado sigue sin recibir espejo?
12. **Espejo compartido**: dos habitaciones con un solo espejo de Casa (la segunda omitida por solape); liberar la primera y confirmar a mano que Casa no queda libre para la segunda. Definir la politica manual.
13. **Huesped presente** (`checked_in`): confirmar que el motor rechaza liberar.
Hasta resolver 10-12 `RELEASE_UNLOCKED` permanece en `false`.

## Bloque D — modificaciones y errores
14. Extender una estancia (+1 noche), acortarla (-1), moverla y cambiar de unidad: solo se proponen altas nuevas y liberaciones de turnos propios; ningun turno ajeno cambia.
15. Dos reservas de Smoobu solapadas y Carrera 19: sin turnos.
16. Reintento tras fallo parcial (se crea el turno principal, falla la cobertura): reejecutar y confirmar que se completa sin duplicar.
17. Zona horaria/horario: turnos 15:00 -> 11:00 Bogota (20:00Z -> 16:00Z) y recurso `America/Bogota`.

## Criterios para pasar a produccion
Bloques A y D completos; Bloque B resuelto (o `coverGaps` apagado y las noches con hueco siguen rechazadas); Bloque C con mecanismo demostrado y politica escrita; punto de restauracion; interruptor de escritura apagado por defecto; autorizacion expresa de Marlon. Y Smoobu autenticada (hoy 401).


## Anadidos por la auditoria de ATH-DEV-016
18. Crear un turno sintetico SIN `x_nobeds_id`: confirmar que NO se crea `sale.order`, `res.partner` ni se borra el turno (automatizaciones 164/170/171).
19. Crear un turno y medir en cuanto tiempo y con que SUMMARY aparece en el .ics (cron 147 apagado: ejecutar 1654 a mano solo en staging). Evaluar si la clave en `name` es aceptable.
20. Borrar un turno propio con espejo compartido (prueba 12) y medir si Casa queda abierta en `x_availability`.
21. Cambiar las fechas de un turno con espejo y confirmar que el espejo queda desfasado (justifica no modificar turnos).
22. Confirmar que 12 (Fix Slot Times) deja intactos inicio y fin de un turno ya en 15:00/11:00 Bogota.
