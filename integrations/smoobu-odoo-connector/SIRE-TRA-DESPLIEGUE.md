# Despliegue, reversion y piloto real (ATH-HOTELS-SIRE-TRA-001)

## Estado en produccion (2026-11-17, autorizado por Marlon en el GOAL)
- **Instalado en atheron1** con el procedimiento propio de produccion (`src/sire-tra/prod-browser-entry.mjs`,
  paquete `scripts/sire-tra-prod-bundle.mjs`, commit `6b0159a`, sha256 `9218cf44...`). 325 registros `__ath_sire_tra__`;
  verificacion: 0 creaciones pendientes; las 110 automatizaciones previas identicas; sin cambios en reservas, huespedes,
  asientos ni pagos. Respaldo: `deploy/prod-respaldo-2026-11-17.md`. Menu raiz *Registro SIRE/TRA*: https://atheron1.odoo.com/odoo?menu_id=1014.
- Automatizaciones: **au_invite ACTIVA** (preparar enlace al confirmar / revocar al cancelar); **au_map ACTIVA**
  desde el recorrido del formulario (ver abajo); **au_attempt APAGADA**. Emisor TRA y exportador SIRE apagados.
- Recorrido del formulario como huesped anonimo (navegador sin sesion, reserva sintetica COT/2026/03901
  `...-C`, ya cancelada): principal extranjero (pasaporte, ES) + 1 acompanante (tarjeta de identidad, CO) -> pagina
  de gracias; Odoo creo 2 fichas *Recibido* con documento y paises del catalogo, consentimiento y version del aviso;
  respuestas brutas borradas; enlace *procesado*. Guardias: *Registrar llegada* sin validar y *Validar* sin habitacion
  se rechazan con mensaje claro. Con autorizacion de Marlon se intento validar con la habitacion 201 asignada:
  **bloqueado por configuracion pendiente** ("asignar habitacion fisica ... habitacion sin establecimiento"). En
  produccion hay 0 establecimientos y ninguna unidad marcada fisica/derivada (paso 4). Hasta configurarlo con datos
  reales (RNT, titular, operador, reportante SIRE), **Recepcion no puede validar ni registrar llegadas**. Se quito la
  habitacion de las fichas sinteticas; la ocupacion de la 201 no cambio. Llegada y salida solo probadas en la copia.
- Observacion: la pagina de gracias ofrece *Volver a responder*; esa nueva respuesta no queda ligada a la reserva y
  `au_map` la ignora (no crea fichas), pero queda como respuesta suelta en la encuesta.
- Prueba sintetica (reservas COT/2026/03899 y 03900, sin lineas, `SMOOBU-PRUEBA-SINTETICA-20261117[-B]`, contacto
  `ZZ PRUEBA SINTETICA`, correo `example.invalid`): confirmar -> 1 enlace vigente (vence 23:59 Bogota del check-out) + nota
  interna; repetir -> sin duplicado; cancelar -> revocado + nota; URL revocada = misma pagina que un token inventado;
  inicio anonimo sin invitacion -> redirige al inicio sin crear respuestas; 0 correos al contacto. Ambas quedan canceladas
  (no se borran). La automatizacion 1 existente pudo crear una tarea interna por la confirmacion.
- No probado en produccion: fallo de base de datos dentro de la confirmacion (prohibido instalar restricciones);
  cubierto por prueba unitaria con Python real tras la correccion `invalidate_all(flush=False)` y por la sexta ronda en la copia (variante anterior).
- **Establecimiento configurado (2026-11-18):** Atheron Suite (id 1, codigo RNT-235267), 201-302 fisicas y Casa Completa
  (recurso 79) derivada; disponibilidad, ocupacion y calendario identicos a la linea base; *Validar datos* operativo.
  Datos, fuentes, pendientes y evidencia: `deploy/prod-establecimiento-2026-11-17.md`.

## Historico

## Que se instala (inventario: `src/sire-tra/manifest.mjs`, todo con xmlid `__ath_sire_tra__.*`)
- Modelos nuevos: `x_establishment`, `x_report_attempt` (+ 3 permisos).
- Campos nuevos en modelos existentes: `x_guests_line` (38), `survey.user_input` (9), `resource.resource` (3), `l10n_latam.identification.type` (1), `res.country` (1); en `x_report_attempt`, 16.
- 1 encuesta (185 preguntas/secciones), 12 acciones de servidor (7 en el menu *Accion*), 3 automatizaciones, 11 vistas propias (prioridad 90; no reemplazan vistas existentes), 9 acciones de ventana, 9 menus.
- **No toca**: vistas, automatizaciones ni acciones existentes; limpieza (17/18); Booking Engine; conector Smoobu; sale.order (solo lo lee; el puente solo agrega notas internas en la reserva).

## Efectos conocidos al desplegar
- Crear automatizaciones hace que Odoo recalcule el cron 48 (en produccion ya esta activo: sin cambio).
- Escribir `x_establishment_id` en recursos dispara la automatizacion 26 (marca disponibilidad para recalcular; interno).
- Las 7 acciones enlazadas aparecen en el menu *Accion* de reservas, huespedes y enlaces.

- `x_date_gap` es un campo calculado y almacenado en `x_guests_line`: Odoo lo recalcula al cambiar el check-out de la reserva, el estado TRA o la salida real. Solo lee `sale.order`; no escribe en reservas, no llama a TRA y no cambia estados. Las lineas aceptadas antes del despliegue no tienen fechas guardadas y no generan alerta.

- **Puente al confirmar (`au_invite`)**: al confirmar una reserva de Smoobu (o al completar sus fechas) Odoo deja preparado el enlace de registro. Si la reserva se cancela, revoca el enlace vigente (la URL anterior deja de recibir datos; se conservan el historial y los formularios recibidos). No lo envia, no confirma pedidos, no escribe en la reserva y nunca lanza error (SAVEPOINT de PostgreSQL + try/except por reserva: un fallo de base de datos se deshace solo en esa reserva y la confirmacion sobrevive). Reversion suave: `--disable --apply` tambien lo apaga.

## Pasos (cuando se apruebe)
1. Punto de restauracion: confirmar respaldo diario de Odoo y `git tag` del commit desplegado.
2. Simulacion contra produccion: `ATH_DEPLOY_PRODUCTION=si-aprobado-por-marlon ODOO_BASE_URL=https://atheron1.odoo.com ODOO_DATABASE=atheron1 ODOO_API_KEY=*** node scripts/sire-tra-apply.mjs --production` (solo lee; debe dar 0 bloqueos).
3. Aplicar: lo mismo con `--apply` y `ATH_PRODUCTION_BACKUP_CONFIRMED=yes`.
4. Configurar en Odoo: establecimiento Atheron Suite (RNT, titular, operador, reportante SIRE, codigos SIRE vacios hasta verificarlos), unidades 201-302 *fisica* con el establecimiento, Casa Completa *derivada* con sus 5 componentes.
5. Repetir el recorrido corto con una reserva real del piloto (ver checklist).

## Respaldo, validacion y reversion (todas simulan sin `--apply`)
- Antes: `--snapshot` guarda la configuracion actual (campos x_, automatizaciones activas, inventario) sin datos personales.
- Despues: `--verify` exige 0 creaciones pendientes y todo lo propio activo.
- Reversion suave (recomendada): `--disable --apply` apaga automatizaciones y menus y quita las acciones del menu *Accion*. **No borra nada** (historicos intactos).
- Reversion dura: `--rollback --apply` borra solo lo de `__ath_sire_tra__`; si hay datos en campos o modelos propios **se detiene** salvo `--export <carpeta local>`, que exporta antes de borrar (contiene datos personales: no subir al repositorio).

## Checklist del piloto real (DONE operativo)
- [ ] Paquete de guia SIRE descargado en el portal: codigos de documento, pais, ciudad, movimiento, formato de fecha, codificacion.
- [ ] Prueba de carga SIRE con **un** huesped real extranjero (no ficticio) y PDF de *Consultar carga* adjunto.
- [ ] MinCIT confirma: software propio valido en Grupo 1, catalogos de `tipo_identificacion`, `motivo`, `tipo_acomodacion`, semantica de `costo`, ambiente de pruebas.
- [ ] Token TRA vigente cargado como secreto `TRA_TOKEN` (sin renovar a ciegas: comprobar que no invalida otra integracion).
- [ ] Conectividad GitHub Actions -> pms.mincit.gov.co.
- [ ] `tra-catalog.json` con `"verified": true` y `x_tra_config_verified` en el establecimiento.
- [ ] Primer envio TRA real de una estancia y confirmacion en *Consulta de huespedes* (la consulta no muestra codigo, estado ni constancia: definir con MinCIT como se confirma).
- [ ] MinCIT confirma como se corrige un cambio de fechas posterior a la aceptacion (prorroga o salida anticipada); hasta entonces la alerta solo avisa.
- [ ] Recepcion hace el recorrido completo una vez con acompanamiento.
- [ ] Decision sobre quien esta obligado (RNT a nombre de persona natural; cuenta SIRE de ATHERON SAS).
