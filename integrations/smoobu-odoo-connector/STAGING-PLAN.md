# Plan de staging aislado para el conector Smoobu -> Odoo (ATH-DEV-016)

**Estado: DISENO. No se creo ninguna base ni se cambio ninguna automatizacion.** Las bases `atheron1-hotel-staging-20260923` y `-20261009` responden 404 (ATH-DEV-015).

## 1. Opciones de staging para ESTA instancia (lo verificado y lo que no)
Verificado por lectura: Odoo Online/SaaS (modulos `saas_*`, `saas_studio`), 19.0.1.3, produccion NO neutralizada, suscripcion con vencimiento 2026-12-02 por renovacion. **No es Odoo.sh**, asi que no hay ramas de staging.
| Opcion | Estado | Que hay que comprobar (no verificable por API) |
|---|---|---|
| **A. Duplicar la base de produccion** desde el gestor de bases de datos de la cuenta propietaria en odoo.com | RECOMENDADA, **NO VERIFICADA**: depende del plan y de la cuenta | que el plan permita duplicar; que la copia nazca **neutralizada** (se prueba con `database.is_neutralized=True`, lo mide `precheck` G4); duracion/expiracion de la copia; cupo; que copia datos personales reales (hay que anonimizar) |
| **B. Nueva base de prueba gratuita + marco de recuperacion** (`integrations/odoo-hotel-gateway/recovery`, R1-R4) | Posible, ya usada dos veces; caduca (los dos staging dan 404); el esquema se reconstruye, no es identico | que el marco reproduzca los campos `x_bloqueo_ref`, `x_channel`, `x_checkin_state`, `x_availability` y el Booking Engine, que hoy son de produccion |
| C. Odoo.sh | **No aplica** (instancia Online) | — |
| D. Instancia local | No viable (Enterprise + Studio SaaS) | — |
Evidencia en el repo de que las bases de prueba son neutralizadas y caducan: `AI/ota/PHASE_C_C0_BASELINE.md` (banner "base neutralizada para pruebas" y prueba gratuita que expira) y `AI/staging-backup/README.md`.

## 2. Respaldo, aislamiento y restauracion
1. **Antes de nada, produccion no se toca.** Solo lecturas (auditorias ya hechas).
2. **Respaldo de configuracion de produccion**: `node recovery/run.mjs snapshot --tag pre` (solo lectura, hashes de codigo, sin PII) y los volcados de `AI/staging-backup/`. Guardar la ruta del snapshot.
3. **Creacion de la base (cuando se autorice)**: preferir A. Registrar nombre, host y fecha; añadirlos a `src/staging-guard.mjs` por un cambio revisado.
4. **Aislamiento**: ejecutar `precheck` G1-G8 y `runIsolationCheck` (esta rama) con la credencial de **staging**. Debe dar `STAGING_AISLADO`; cualquier fallo o dato ilegible => STOP.
5. **Datos sinteticos reversibles**: reservas de prueba con ids fuera del rango real (p. ej. >= 900000000) y clave `SMOOBU-<id>:...`; un diario JSONL de todo id creado (turnos propios y espejos por `x_bloqueo_ref`).
6. **Restauracion**: (a) preferida, descartar la base y volver a duplicar; (b) alternativa, borrar SOLO los ids del diario (y sus espejos) en staging y comparar conteos/hash con el snapshot previo, como el `rollback` del marco. Nunca borrar en produccion.
7. **Un solo escritor**: una sesion a la vez, sin automatizaciones nuevas, sin tocar 167/169.

## 3. Lista de neutralizacion (13 items, `src/staging-plan.mjs`)
N01 base y host de staging; N02 correo saliente; N03 crons (solo recalculo del Booking Engine); N04 iCal/OTA/Worker/Smoobu sin apuntar a staging; N05-N06 webhooks (51 y acciones tipo webhook); N07 pagos (proveedor 14); N08 parametros `nobeds.*`; N09 automatizaciones con nombres de canales externos; N10 sitio web despublicado; N11 credencial propia de staging; N12 datos personales anonimizados; N13 sin conexion con Smoobu/OTAs. Los items con `autoCheck` los verifica `runIsolationCheck`; el resto requiere atestacion humana. **Todos bloquean las escrituras.**

## 4. Que bloquea crear el staging hoy
1. Decision de Marlon: opcion A o B y que cuenta/plan lo permite (no verificable desde aqui).
2. Nombre y host de la base nueva (la guardia solo conoce la antigua).
3. Credencial de staging y GitHub Environment con aprobacion.
4. Politica de datos personales de la copia.
5. Renovacion de la suscripcion de produccion antes de 2026-12-02 (riesgo operativo, no del conector).

## 5. Condiciones para habilitar escrituras sinteticas
Todas verdaderas: `precheck` G1-G8 en verde; `runIsolationCheck` = `STAGING_AISLADO`; items manuales N04, N08, N10-N13 atestados por escrito; credencial distinta de la de produccion (la guardia lo comprueba); diario de ids activo; snapshot previo guardado; sin Smoobu en el entorno; autorizacion expresa de Marlon. Hasta entonces `writesEnabled=false` y `RELEASE_UNLOCKED=false`.

## 6. Pruebas sinteticas que se podran hacer (de `STAGING-TESTS.md`, ajustadas)
Crear 1 noche; borrador (sin espejo y sin liberar); espejo de Casa y su ausencia ante solape; hueco de la regla 169 y cobertura; noche contigua; Casa Completa; efecto sobre `x_availability`; presencia del turno en el .ics (y clave visible); borrar turno propio y observar 168/23/158; espejo compartido; confirmar que sin `x_nobeds_id` no se crean ordenes (170) ni se borra nada (164).
