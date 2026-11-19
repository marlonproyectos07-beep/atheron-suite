# Despliegue: registro de importes pagados (TRA) y nombre TRA - listo para aprobar (2026-11-18)

Repositorio publico: sin datos personales, importes reales ni secretos.
No activa envios: `TRA_EMITTER_ENABLED`, `TRA_AUTO_SEND` y `TRA_ENABLED` siguen en `no`. No toca la sincronizacion
Smoobu -> Odoo, ni pedidos, pagos, facturas o contabilidad.

## 1. Codigo
- PR #118 (borrador). Codigo de Odoo y del emisor identico desde `2484390`; lo posterior es solo documentacion.
- Paquete de produccion: `node scripts/sire-tra-prod-bundle.mjs` desde la cabeza aprobada; sha256 de `src/` en
  `2484390`: `ee1f9bce...` (comprobar antes de ejecutar). Huella del manifiesto: `6ead35ac6e33321f`.
- Pruebas: 465/465 (`npm test`).

## 2. Que cambia en produccion (simulacion de solo lectura contra produccion, 18/11 ~19:10 Bogota)
- **26 creaciones, 0 bloqueos:**
  - modelo `x_tra_amount` y sus 13 campos;
  - `x_establishment.x_tra_establishment_name` y `x_tra_establishment_name_source`;
  - 2 permisos (usuario y administrador: leer y crear; nadie edita ni borra);
  - 3 acciones: Confirmar con evidencia, Anular importe y guardia de creacion; las tres con grupo
    `base.group_user`;
  - 1 automatizacion `au_amount_guard` (al crear), que **nace apagada**;
  - 2 vistas, 1 accion de ventana y el menu "Importes pagados (TRA)".
- **235 reescrituras idempotentes** de objetos propios (mismo valor), salvo la vista del establecimiento, que suma los
  dos campos de nombre TRA.
- **Sin cambio:**
  - automatizaciones propias existentes: Aplicar intento sigue apagada; Preparar enlace y Formulario terminado
    siguen activas;
  - 112 automatizaciones activas en total;
  - el cron estandar "Automation Rules: check and execute", que ya esta activo en produccion. Odoo lo recalcula al
    escribir automatizaciones: en la copia lo reactivo y se volvio a apagar para mantenerla aislada.

## 3. Pruebas en la copia `atheron1-pruebas-20261108` (aislada; paquete verificado por sha256)
Con `591bfe5` (ORM real, usuario interno sin administracion) se demostraron tres defectos:
- **D1:** se podia crear un importe ya "confirmado", sin evidencia y con confirmador falso.
- **D2:** el administrador podia cambiar un importe confirmado.
- **D3:** el usuario no podia ejecutar Confirmar ni Anular, porque una accion sin grupo exige escritura sobre el modelo.

Con `2484390`, instalado con el mismo procedimiento que produccion (automatizacion nueva apagada y activada aparte):
- crear sin estado: OK. Escribir o borrar: denegado al usuario y al administrador.
- crear con estado, confirmador o fecha de confirmacion: rechazado por la guardia.
- Confirmar: rechaza USD, falta de archivo de evidencia y fecha de corte futura. Acepta con todo completo y registra
  quien y cuando. Un segundo confirmado en la misma reserva: rechazado.
- Anular: conserva el registro, quien y cuando confirmo, y anade la nota de anulacion. Anular dos veces: rechazado.
  Tras anular se puede confirmar otro.
- El emisor acepta el confirmado real: la ultima escritura no es posterior a la confirmacion.
- Historial: 11 registros (8 sin confirmar, 2 anulados, 1 confirmado). Ninguno borrado.
- Acciones temporales de prueba borradas. Copia aislada al cierre.

**Leccion operativa:** la instalacion tarda mas que el limite de la herramienta del navegador. Se lanza **una sola
vez** en segundo plano y se consulta su estado; no se relanza mientras corre. En la copia, un segundo lanzamiento
concurrente fallo por xmlid duplicado, sin duplicar objetos.

## 4. Procedimiento en produccion (solo con aprobacion; consola de atheron1.odoo.com con sesion de administrador)
1. Cargar el paquete de la cabeza aprobada y comprobar su sha256.
2. `p = ATH_SIRE_TRA_PROD.bootProduction(window, <frase de aprobacion de Marlon>)`.
3. `await p.snapshot()`: respaldo de configuracion sin datos personales (campos x_, automatizaciones activas,
   inventario del modulo y conteos de pedidos, fichas, enlaces, asientos y pagos).
4. `await p.plan()`: debe dar 26 creaciones y 0 bloqueos. Si difiere, se detiene.
5. `p.apply()` lanzado una vez en segundo plano y consultado hasta terminar.
6. `await p.verify()`: 0 creaciones pendientes. Despues, `await p.setAutomation('au_amount_guard', true)`, y solo esa.
7. Comprobar:
   - conteos iguales al respaldo;
   - estado de las demas automatizaciones sin cambio;
   - cron "Automation Rules" sin cambio;
   - permisos (sin escritura ni borrado) y grupo en las tres acciones.
8. Registrar en el establecimiento el nombre TRA segun el certificado RNT y su fuente, sin tocar `x_name` ni el titular.
9. Fusionar la cabeza exacta de la PR #118.

## 5. Reversion
- **Inmediata, sin borrar:** `p.setAutomation('au_amount_guard', false)` y ocultar solo el menu "Importes pagados (TRA)".
  El emisor esta apagado, asi que nada en produccion depende de este registro.
- **Codigo:** revertir la fusion. Sin efecto en produccion mientras el emisor siga apagado.
- **Vista del establecimiento:** reaplicar el manifiesto de `fe64f05` con el aplicador de produccion (reescribe la vista).
- **Borrado de los 26 objetos:** no se expone. Solo con orden expresa de Marlon y sin registros de importes.

## 6. Pendiente oficial (no bloquea la instalacion tecnica)
- **Motivo:** el MinCIT no publica la lista de valores. `reasons` sigue vacio y `verified: false`. Las propuestas de
  `reasonsProposed` no son verificacion oficial.
- **Momento de corte del importe:** la norma pide "valor total pagado por el servicio de alojamiento" (Res. 409 de
  2022, art. 2). No precisa si es lo pagado al registrar la llegada o el total de la estancia.
- **Radicado 1-2026-041876:** solo acuse. El 18/11/2026 escribio la Direccion de Analisis Sectorial y Promocion del
  MinCIT ofreciendo una videoconferencia (Teams) sobre TRA-PMS. Es la via para obtener ambas respuestas por escrito.
