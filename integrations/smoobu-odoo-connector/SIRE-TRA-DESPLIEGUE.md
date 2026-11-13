# Despliegue, reversion y piloto real (ATH-HOTELS-SIRE-TRA-001)

**No desplegado.** Esta mision solo probo en `atheron1-pruebas-20261108`. Desplegar exige aprobacion de Marlon sobre el resultado probado.

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

- **Puente al confirmar (`au_invite`)**: al confirmar una reserva de Smoobu (o al completar sus fechas) Odoo deja preparado el enlace de registro. Si la reserva se cancela, revoca el enlace vigente (la URL anterior deja de recibir datos; se conservan el historial y los formularios recibidos). No lo envia, no confirma pedidos, no escribe en la reserva y nunca lanza error (try/except por reserva). Reversion suave: `--disable --apply` tambien lo apaga.

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
