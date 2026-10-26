# Pruebas obligatorias en staging antes de autorizar produccion (ATH-DEV-014)

Estado: **ninguna ejecutada**. El motor es solo simulacion (`writesEnabled:false`, liberaciones y coberturas `BLOCKED_UNTIL_STAGING_PROOF`). Base de staging: `atheron1-hotel-staging-20260923` (la unica autorizada; ver `integrations/odoo-hotel-gateway/src/config/odoo-staging-guard.mjs`). Cada prueba se hace con una copia/datos de prueba, con las reglas 167/169 activas tal como estan en produccion, y se documenta con ids de turnos antes y despues.

## Bloque A — crear (minimo imprescindible)
1. **Crear un turno de una noche** en el rol 37 con `state='published'`, `company_id=5`, recurso 31, `name`=clave. Comprobar: se crea el espejo de Casa (rol 69) con el mismo intervalo y `x_bloqueo_ref` = id del turno; no se crean turnos extra.
2. **Mismo turno con `state='draft'`**: comprobar que NO se crea espejo (confirma el dominio de las reglas).
3. **Valores de `x_hotel_block_kind` y `x_channel`** de turnos reales (lectura) y prueba de que el turno creado cuenta como ocupado en el motor de disponibilidad (accion 1914) y en el endpoint de disponibilidad: debe desaparecer la noche de la oferta de 301 y de Casa.
4. **Repetir la creacion con la misma clave** (ejecucion repetida): el motor debe reportar `matched`, cero propuestas; ningun duplicado.
5. **Noche contigua** (stay de 3 noches por noche): 3 turnos + 3 espejos, sin huecos de Casa (invariante del motor).
6. **Casa Completa**: un turno en rol 69 genera 5 turnos espejo en habitaciones libres; con una habitacion ocupada la propuesta debe haber sido rechazada.

## Bloque B — huecos de la regla 169 (cobertura)
7. **Reproducir el hueco**: con un turno de Casa que cubre solo parte de la noche, crear el turno de 301: confirmar que la regla omite el espejo (Casa queda libre en el tramo restante).
8. **`x_bloqueo_ref`**: tipo, escritura desde JSON-2 y que un turno de Casa con `x_bloqueo_ref` no vacio **no dispara** 167/169.
9. **Turno de cobertura**: crearlo para el tramo omitido; el motor 1914 debe contarlo como ocupado y la oferta de Casa debe cerrarse. Sin esto `coverGaps` no se activa.

## Bloque C — liberar (decide el mecanismo)
10. **Cancelar con `x_checkin_state='cancelled'`** un turno propio: ¿vuelve a ofrecerse la noche en el motor 1914 y el endpoint? ¿Que pasa con el espejo de Casa (queda)? 
11. **Despublicar con `state='draft'`** un turno propio: mismas preguntas; ademas, ¿otro turno solapado sigue sin recibir espejo?
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
