# Formulario de registro: opcion "Trabajo" en "Motivo principal del viaje" (produccion, 26/11/2026)

Ordenado por Marlon el 26/11/2026 (15:13 Bogota). TRA sigue apagado; Smoobu -> Odoo y SIRE sin cambios.

## Por que
- **Respaldo:** "Trabajo" es el valor de `motivo` del ejemplo oficial del manual Grupo 1. Respalda ese valor exacto; no
  es la lista completa. Se envia solo si el huesped lo declara.
- **Sin valor por defecto:** ninguna opcion viene preseleccionada.
- **"Negocios o motivos profesionales" no se asigna a "Trabajo".** En estadistica de turismo (RIET 2008) designa viajes
  por negocios o por actividad profesional, y el visitante excluye a quien viaja para emplearse en una entidad del lugar
  visitado. El MinCIT no publica que entiende por "Trabajo". Sin una definicion oficial no son equivalentes.

## Que cambio (una sola escritura)
- Pregunta 27 ("Motivo principal del viaje", formulario "Registro de huespedes - Atheron"):
  - **nueva** opcion `Trabajo`, id 345, secuencia 7, sin marcar como correcta;
  - la opcion `Otro` (id 174) pasa de la secuencia 7 a la 8 para seguir siendo la ultima.
- Las opciones 168 a 173 no cambian: mismo id, mismo texto y misma secuencia. No se toco ninguna respuesta recibida.
- Orden final:
  1. Vacaciones, recreacion u ocio
  2. Visita a familiares o amigos
  3. Negocios o motivos profesionales
  4. Salud
  5. Educacion
  6. Religion
  7. Trabajo
  8. Otro

## Como se hizo
- **Codigo:** `src/sire-tra/delta-motivo-2026-11-26.mjs` (commit `6350e433814ab2ba52a40c222915afddd297d38d`).
- **Paquete de produccion:** armado en la pagina desde raw.githubusercontent.com. 128 735 bytes, sha256
  `36364cabdb6e04112f74fb8b2dc9c5fa08995e5aedd26b244fb28335065ca34a`, igual al local.
- **Respaldo de configuracion:** `snapshot()`.
- **Plan de solo lectura:** pendiente, sin bloqueo; las opciones eran exactamente las 7 esperadas.
- **Respaldo de las opciones:** `deploy/tra-motivo-respaldo-produccion-2026-11-26.json` (459 bytes, sha256 (12)
  `1289d1f0d45f`). Identico byte a byte al tomado en la pagina.
- **Verificacion:**
  - `ok`, con los ids anteriores conservados;
  - automatizaciones identicas y conteos iguales al respaldo;
  - el despliegue del 25/11 sigue verificado;
  - el texto "Trabajo" es igual en es_419 y en_US.
- **Ensayo:** la copia `atheron1-pruebas-20261125` ya habia vencido. Se ensayo con pruebas sobre los ids reales
  (`test/sire-tra-motivo.test.mjs`): plan, aplicacion, deriva y reversion.

## Reversion (conservada; no ejecutada)
`await p.revertMotivo(<respaldo>)` borra "Trabajo" y devuelve "Otro" a la secuencia 7.
- Se niega si algun huesped ya respondio "Trabajo"; esas respuestas se conservan.
- Solo con orden expresa.

## Pendiente
- Fusionar esta rama: mientras `main` no la tenga, una ejecucion del aplicador completo desde `main` se detendria con
  `ANSWERS_DRIFT`. Es una parada segura, no una escritura.
