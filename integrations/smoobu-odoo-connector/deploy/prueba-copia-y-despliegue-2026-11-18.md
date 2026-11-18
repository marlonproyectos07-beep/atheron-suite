# Prueba en la copia y despliegue en produccion (2026-11-18)

Codigo probado e instalado: commit `f986889` (rama `feat/ath-sire-tra-inc1-estructura`). Datos de prueba: todos ficticios.

## Superficies usadas
- **Copia** `atheron1-pruebas-20261108`: navegador integrado de la app (sesion de administrador abierta por Marlon).
  Aislamiento 8/8 antes, despues de instalar (el cron 48 se reactivo al escribir automatizaciones y se apago SOLO en la
  copia) y al terminar.
- **Huesped anonimo**: Chrome, sin sesion en la copia.
- **Produccion** `atheron1`: Chrome, sesion de administrador.

## Autenticacion probada (importante)
El conector se ejecuto con sus **modulos reales** (29 archivos cargados desde GitHub en el commit fijado) y el **cliente
real de copia** `CopyWriteClient` con todas sus guardias. Solo se cambio el transporte: las llamadas JSON-2 viajaron por la
**sesion del navegador** de la copia (adaptador que rechaza cualquier host distinto de la copia).
**No se probo la conexion JSON-2 con clave de API** (la clave de la copia daba 401): queda pendiente.
Equivalencias de Node en el navegador: SHA-256/HMAC verificados con vectores estandar; `fs` vacio (bitacora en memoria).

## Conector en la copia (camino programado `runAuto`)
| Prueba | Resultado |
|---|---|
| Guardias del cliente | produccion, base/host distintos, sin clave, sin armar y campo fuera de lista blanca: rechazados, 0 llamadas |
| A: telefono compartido por 2 contactos previos | `PRECONDICION_FALLIDA CONTACTO_DUPLICADO_EN_ODOO`, sin parada ni bloqueo |
| B: reserva valida en el mismo lote | `APLICADA`: contacto + pedido en **borrador** + nota (3 escrituras) |
| Repeticion con la misma bitacora | `YA_APLICADA`, 0 escrituras |
| Repeticion con bitacora nueva y el mismo plan forzado | `PEDIDO_YA_EXISTE` -> parada sin escribir (por diseno: en produccion el plan se recalcula) |
| Duplicado por referencia `SMOOBU-<id>` | bloquea: auditoria `CONTACTO_SIN_PEDIDO` (camino programado) y `CONTACTOS_DUPLICADOS` -> `DUPLICADO_DETECTADO` (contacto); 0 escrituras. Contactos de prueba archivados (no borrados) |
| Resultado neto | 1 pedido, 1 contacto, 1 enlace para B; 0 duplicados |
| Nombres con palabras genericas ("Reserva") | `NOMBRE_NO_IDENTIFICABLE` (guardia correcta) |

## Recorrido del huesped en la copia
- Enlace preparado **desde el borrador**, con excepcion visible "Falta: telefono" y mensaje redactado (no enviado).
- Formulario como huesped anonimo (Chrome) -> ficha *Recibido* (extranjero, pasaporte) -> validada con habitacion 202.
- Llegada: sin hora -> rechaza; tardia sin motivo -> rechaza; con motivo -> hora real de ayer + hora/usuario de captura
  aparte; repetir -> rechaza. Salida con hora real. Correccion: exige motivo; valor anterior en bitacora y nota.
- TRA **simulador**: aceptado por el simulador (codigo 101, canal `simulador`, NO oficial), fechas reportadas guardadas;
  repeticion 0 envios; modo real bloqueado (`TRA_ENABLED_APAGADO`, `SIN_TOKEN`, `CATALOGO_NO_VERIFICADO`,
  `CONFIG_ESTABLECIMIENTO_NO_VERIFICADA`).

## Produccion (despliegue)
- Paquete de produccion del mismo commit, sha256 `49fa5112...`; respaldo de configuracion 15:35 UTC (112 automatizaciones
  activas: 110 previas + 2 propias); simulacion: 11 creaciones (10 campos + `sa_fix_move`), 0 bloqueos.
- Aplicado: 11 creados, 254 actualizados. Verificacion: 0 pendientes; automatizaciones activas **identicas** a antes;
  conteos de reservas, huespedes, enlaces, asientos y pagos **sin cambio**; estados conservados (Formulario terminado y
  Preparar enlace activas, Aplicar intento apagada). El puente ya prepara desde borrador.
- Reversion: `disable({apply:true})` (no borra) o `setAutomation('au_invite', false)`; volver a la version anterior del
  manifiesto con el aplicador de produccion.

## Pendiente
- Valores efectivos de `TRA_EMITTER_ENABLED`, `TRA_AUTO_SEND`, `TRA_ENABLED` en GitHub: no leidos (sin sesion de GitHub en
  los navegadores; el uso de la credencial de git para la API fue bloqueado por el control de seguridad).
- Conexion JSON-2 con clave de API en la copia.
- Fusion del PR #112 y `DESBLOQUEO-111`: NO realizados.

## Segunda ronda (misma fecha, 11:00-11:20 Bogota) - ejecutada por Claude en esta sesion
Aclaracion de autoria: la evidencia anterior de este archivo (enlace desde borrador, formulario anonimo, validacion,
llegada/salida con hora real, TRA simulado) la ejecuto Claude en esta misma sesion; no proviene de otro reporte.

### Otra sesion en la copia
COT/2026/03895 (`...0962`) la creo esta sesion (10:31 Bogota). COT/2026/03896 y 03897 (`...0981`, `...0982`) los creo OTRA
sesion con el mismo usuario entre 10:53 y 10:58 (pedido, enlace, fichas e intentos). No se tocaron ni se borraron. Las
pruebas de esta ronda usan ids `1704010xx`.

### JSON-2 con clave de API: IMPEDIMENTO
- Red desde el portatil: OK (`version_info` 200; `/json/2/...` responde 401 sin clave, como corresponde).
- No hay clave exclusiva de la copia en este equipo: ninguna variable `ODOO_TEST_*`/`ODOO_*` en el entorno ni en archivos
  locales revisados (solo nombres de variables). No se uso ninguna clave de produccion.
- Para probarlo: crear en la copia una clave de API propia y dejarla en una variable de entorno local
  `ODOO_TEST_API_KEY` (sin pegarla en el chat); luego `node scripts/sync-copy.mjs <archivo> [--apply]`.

### sync-copy (misma logica del script, transporte por sesion web)
| Paso | Resultado |
|---|---|
| Simulacion (`RecordingWriter`), lote de 3 | 2 `SIMULADA`, 1 `COINCIDENCIA_SOLO_POR_NOMBRE`; 6 escrituras registradas, 0 enviadas, 0 pedidos |
| Aplicacion (`CopyWriteClient`) | 2 `APLICADA` (COT/2026/03898, 03899, borrador, enlace con "Falta: telefono"), 1 en revision; 6 escrituras |
| Repeticion | 3 sin escribir (`PEDIDO_YA_EXISTE` x2 + revision); 0 escrituras; 2 pedidos, 2 contactos, 2 enlaces |
| Nombre no identificable | `NOMBRE_NO_IDENTIFICABLE`, sin pedido |
| Sin correo ni telefono | `APLICADA` (COT/2026/03900); contacto sin correo ni telefono inventados; enlace "Falta: telefono, correo" |
| Contacto ambiguo vs referencia duplicada | ver primera ronda (sin cambio de codigo) |
Aislamiento 8/8 al terminar. El script exige correo `@example.invalid`, por eso el caso sin correo se probo con `applyPlan`.

### Produccion
Sin cambios de codigo desde `f986889`: no se redesplego. Las acciones instaladas coinciden con el commit (sha256 de
`sa_invite_auto`, `sa_arrive`, `sa_depart`, `sa_fix_move`: b682e6aabf, 57d4e50348, 97de05fb22, 62b527c1c1), 0 creaciones
pendientes.

### Decision lista para aprobacion (no ejecutada)
1. Confirmar en GitHub (Settings > Secrets and variables > Actions > Variables) que `TRA_EMITTER_ENABLED`, `TRA_AUTO_SEND`
   y `TRA_ENABLED` no existen o no valen `yes` / `yes-real` (no se pudieron leer desde esta sesion).
2. Fusionar el PR #112 en `main` (trae la correccion del conector y `tra-emitter.yml` apagado por variables).
3. Fijar `SYNC_DESBLOQUEO = DESBLOQUEO-111` y revisar la siguiente ejecucion programada.
