# Despliegue, reversion y piloto real (ATH-HOTELS-SIRE-TRA-001)

**No desplegado.** Esta mision solo probo en `atheron1-pruebas-20261108`. Desplegar exige aprobacion de Marlon sobre el resultado probado.

## Que se instala (inventario: `src/sire-tra/manifest.mjs`, todo con xmlid `__ath_sire_tra__.*`)
- Modelos nuevos: `x_establishment`, `x_report_attempt` (+ 3 permisos).
- Campos nuevos en modelos existentes: `x_guests_line` (35), `survey.user_input` (6), `resource.resource` (3), `l10n_latam.identification.type` (1), `res.country` (1).
- 1 encuesta (185 preguntas/secciones), 11 acciones de servidor (7 en el menu *Accion*), 2 automatizaciones, 11 vistas propias (prioridad 90; no reemplazan vistas existentes), 8 acciones de ventana, 8 menus.
- **No toca**: vistas, automatizaciones ni acciones existentes; limpieza (17/18); Booking Engine; conector Smoobu; sale.order (solo lee).

## Efectos conocidos al desplegar
- Crear automatizaciones hace que Odoo recalcule el cron 48 (en produccion ya esta activo: sin cambio).
- Escribir `x_establishment_id` en recursos dispara la automatizacion 26 (marca disponibilidad para recalcular; interno).
- Las 7 acciones enlazadas aparecen en el menu *Accion* de reservas, huespedes y enlaces.

## Pasos (cuando se apruebe)
1. Punto de restauracion: confirmar respaldo diario de Odoo y `git tag` del commit desplegado.
2. Simulacion contra produccion: `ATH_DEPLOY_PRODUCTION=si-aprobado-por-marlon ODOO_BASE_URL=https://atheron1.odoo.com ODOO_DATABASE=atheron1 ODOO_API_KEY=*** node scripts/sire-tra-apply.mjs --production` (solo lee; debe dar 0 bloqueos).
3. Aplicar: lo mismo con `--apply` y `ATH_PRODUCTION_BACKUP_CONFIRMED=yes`.
4. Configurar en Odoo: establecimiento Atheron Suite (RNT, titular, operador, reportante SIRE, codigos SIRE vacios hasta verificarlos), unidades 201-302 *fisica* con el establecimiento, Casa Completa *derivada* con sus 5 componentes.
5. Repetir el recorrido corto con una reserva real del piloto (ver checklist).

## Reversion
`node scripts/sire-tra-apply.mjs --production --rollback` simula; con `--apply` borra solo lo de `__ath_sire_tra__` en orden inverso.
**Borra los datos guardados en los campos nuevos**: exportar antes los huespedes e intentos si ya hay datos reales.

## Checklist del piloto real (DONE operativo)
- [ ] Paquete de guia SIRE descargado en el portal: codigos de documento, pais, ciudad, movimiento, formato de fecha, codificacion.
- [ ] Prueba de carga SIRE con **un** huesped real extranjero (no ficticio) y PDF de *Consultar carga* adjunto.
- [ ] MinCIT confirma: software propio valido en Grupo 1, catalogos de `tipo_identificacion`, `motivo`, `tipo_acomodacion`, semantica de `costo`, ambiente de pruebas.
- [ ] Token TRA vigente cargado como secreto `TRA_TOKEN` (sin renovar a ciegas: comprobar que no invalida otra integracion).
- [ ] Conectividad GitHub Actions -> pms.mincit.gov.co.
- [ ] `tra-catalog.json` con `"verified": true` y `x_tra_config_verified` en el establecimiento.
- [ ] Primer envio TRA real de una estancia y confirmacion en *Consulta de huespedes*.
- [ ] Recepcion hace el recorrido completo una vez con acompanamiento.
- [ ] Decision sobre quien esta obligado (RNT a nombre de persona natural; cuenta SIRE de ATHERON SAS).
