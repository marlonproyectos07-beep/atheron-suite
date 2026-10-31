# Escritura de la sincronizacion Smoobu -> Odoo (ATH-DEV-116)

Estado: **desarrollado y probado solo en simulacion**. El cliente real esta DESARMADO: `WRITES_ENABLED=false`,
`RELEASE_UNLOCKED=false`. No se han creado credenciales ni se ha escrito en Odoo.

## Arquitectura

```
Smoobu (GET) ─┐
              ├─> conciliacion por ID ─> planSync (sync-intent) ─> applyPlan (sync-apply)
Odoo (lectura)┘                                                       │
                                                                      ├─ prevalidacion: lecturas frescas
                                                                      ├─ Journal INTENT (sync-journal)
                                                                      ├─ writer.execute ─> validateWrite (sync-write-guard)
                                                                      │                    └─ SyncWriteClient (3 llaves) | RecordingWriter (sombra)
                                                                      ├─ postvalidacion: relectura
                                                                      └─ Journal DONE / AMBIGUOUS / VERIFY_FAILED
```

| Pieza | Responsabilidad |
|---|---|
| `sync-write-guard.mjs` | Lista blanca pura de modelo, metodo y campos. Sin `unlink`, sin `account.*`, sin `planning.slot`; `price_unit` solo al crear; impuestos vacios; solo los 5 productos de habitacion; notas internas `ATH-SYNC`. |
| `sync-write-client.mjs` | `SyncWriteClient`: armado solo si `WRITES_ENABLED && RELEASE_UNLOCKED && arm === SYNC_ARM_PHRASE`; host/base `atheron1`; tope de escrituras; cuenta antes de enviar (un fallo ambiguo no se reintenta). `RecordingWriter`: misma lista blanca, no envia. |
| `sync-journal.mjs` | Diario write-ahead (JSONL, sin datos personales) y cerrojo exclusivo (`FileLock` con `wx`). |
| `sync-apply.mjs` | Elegibilidad, idempotencia, prevalidacion, escritura, postvalidacion, paradas y recuperacion. |

### Garantias

- **Idempotencia doble**: clave de operacion en el diario + busqueda de `SMOOBU-<id>` en Odoo antes de crear.
  Aunque se pierda el diario, no se duplica el pedido. Contacto por correo exacto; 2+ contactos con el mismo correo = no se crea nada.
- **Prevalidacion**: la reserva se relee en Smoobu (estado, habitacion, fechas, precio); el pedido se relee en Odoo
  (`write_date` igual al del plan, sin facturas, precio intacto); noches libres; pagos del cliente para cancelar.
- **Postvalidacion**: relectura del pedido (un solo pedido con la referencia, estado, precio = precio manual, sin
  impuesto; tras confirmar, turno creado y tarifa NO sobrescrita; tras cancelar, turnos liberados).
- **Paradas**: cerrojo ocupado, interruptor `halt`, incompletas sin resolver, error de red durante una escritura,
  fallo parcial o postvalidacion fallida. Un fallo de PREvalidacion solo salta esa operacion.
- **Recuperacion**: al empezar, cada entrada abierta del diario se resuelve leyendo Odoo (hecha / no aplicada /
  duplicado -> parada). Nunca se borra nada para deshacer; un contacto creado sin pedido queda senalado para revision.
- **Concurrencia**: cerrojo de archivo + `concurrency` de GitHub Actions (sin cancelar la ejecucion en curso).

## Reglas de negocio aplicadas

- Smoobu es la fuente; el pedido se identifica solo por `SMOOBU-<id>`.
- Precios: total de Smoobu = `price_unit` = `x_precio_manual` al crear; nunca se modifica un precio existente.
- IVA no validado: crear borrador sin impuesto si; **confirmar, bloqueado** (incluso con aprobacion).
- Casa Completa (ATH-DEV-117): UNA reserva comercial con el producto existente `CASA-MAGIA` (57850, rol 69), un solo
  ingreso. Las cinco habitaciones las bloquea Odoo (automatizacion 167) y la postvalidacion comprueba los cinco bloqueos.
  Minimo 10 personas (automatizacion 71): si Smoobu no trae el numero o es menor, BLOQUEADO. La sobreventa del 04/01 sigue bloqueada.
- Contactos (ATH-DEV-117, `sync-contact.mjs`): correo opcional. Nombre identificable obligatorio; `ref` = `SMOOBU-<id>` en el
  contacto creado (idempotencia y recuperacion). Busca por ref, correo exacto, telefono normalizado y nombre; coincidencias
  multiples, llaves que apuntan a personas distintas o coincidencia solo por nombre = BLOQUEO. Nunca se inventa un dato.
- Facturadas, pagadas, con estancia iniciada, con sobreventa o ambiguas: no se tocan.

## Pendiente del contador

1. IVA por canal: reserva directa, Booking.com, Airbnb; y huesped extranjero no residente (posible exencion).
2. Si el precio de Smoobu se registra con IVA incluido o excluido en cada canal (hoy hay pedidos de ambos tipos).
3. Tratamiento de la comision de Booking (hoy se deja fuera del pedido).
4. Reparto del precio de Casa Completa entre las 5 habitaciones (o alternativa contable).
5. Serie de factura (VENT interna o FAC electronica) cuando la sincronizacion cree pedidos.

## Usuario tecnico de Odoo: hechos leidos (30/10/2026, solo lectura) y requisitos (NO creado)

- Hoy hay **1 usuario interno activo** (el del gerente, administrador) y 2 de portal. Suscripcion con renovacion el 02/01/2027.
- Odoo cobra por usuario; un usuario interno adicional implica, con alta probabilidad, una licencia mas (confirmar en el portal
  de suscripcion de Odoo antes de crearlo). Un usuario de portal NO sirve: no puede leer ni escribir pedidos de venta.
- Compañias: ATHERON S.A.S. (5) y Atheron_Administrador (1). El usuario puede limitarse a la compañia 5 (`company_ids`=[5]).
- Grupos minimos: Usuario interno; Ventas / Usuario: todos los documentos (16); Contacto / Creacion (9); Planning / Usuario (57)
  para leer turnos; Contabilidad / Solo lectura (35) para comprobar facturas y pagos. SIN: Ventas Administrador, Contabilidad
  Facturacion/Contable/Administrador, Planning Administrador, Administrador del sistema, Funciones tecnicas.
- Alternativa sin licencia extra: seguir con la clave del gerente (administrador). Es mas simple pero da al conector mas
  permisos de los necesarios; la lista blanca del cliente lo compensa en parte, no del todo.

## Usuario tecnico de Odoo (requisitos; NO creado)

- Usuario interno dedicado, sin acceso de administrador, solo compania ATHERON S.A.S. (id 5).
- Permisos: Ventas (usuario: sus documentos y todos los documentos), Contactos (crear), lectura de Planning,
  lectura de Contabilidad (facturas y pagos) sin derechos de creacion ni validacion.
- Sin permisos de Ajustes, Contabilidad (escritura), Planning (escritura), Sitio web ni usuarios.
- Clave API propia con caducidad (p. ej. 1 ano), guardada solo como secreto `ODOO_SYNC_API_KEY` de GitHub.
- Comprobacion previa con `odoo-auth-readonly` y una sombra completa con esa clave.

## Activacion gradual (cada paso con orden expresa de gerencia)

0. Hoy: sombra diaria manual (`sync-shadow`), sin escrituras.
1. Decisiones del contador y producto/regla de Casa; usuario tecnico y su clave.
2. PR de activacion aparte: `WRITES_ENABLED=true`, `RELEASE_UNLOCKED=true`, frase de armado por variable de entorno,
   workflow manual (no programado), `maxOps=1`, solo `CREATE_ORDER` en borrador.
3. Una operacion real aprobada, conciliacion de verificacion y revision en Odoo.
4. Ampliar a rellenos `UPDATE_ORDER`, despues `maxOps` mayor.
5. Confirmar y cancelar: siempre con aprobacion por clave de operacion; nunca automatico.
6. Programacion diaria solo cuando 2-5 lleven al menos 2 semanas sin incidencias.

## Piloto controlado (ATH-DEV-118, `src/sync-pilot.mjs`)

- Una sola reserva: exactamente una operacion `CREATE_ORDER` en estado LISTO, del ID de Smoobu indicado y con su clave aprobada.
- Solo `res.partner.create`, `sale.order.create` y la nota interna, con un tope de 3 escrituras. Nunca confirma, cancela,
  modifica, factura ni cobra; el pedido queda en borrador y sin turno.
- Si la clave pertenece a un administrador (hoy la unica clave es del gerente), exige una segunda aprobacion ligada a la
  operacion: `APROBADO-ADMIN-SMOOBU-<id>-<clave>`. Si no se puede comprobar el grupo, se trata como administrador.
- Sigue sin poder escribir: necesita ademas las tres llaves del cliente real (PR de activacion aparte).

## Estabilidad de la sincronizacion programada (ATH-DEV-129, `src/sync-auto.mjs`)

- **Cupo diario persistente**: como mucho 3 reservas nuevas por dia de Bogota y 1 por ejecucion. El contador se LEE de
  Odoo en cada ejecucion (notas internas `ATH-SYNC | clave ... | CREATE_ORDER` desde las 05:00 UTC), asi que no se
  reinicia entre ejecuciones ni tras reinicios de GitHub Actions. Si no se puede leer completo, no se escribe y se apaga.
  Cupo agotado = parada normal (`CUPO_DIARIO_AGOTADO`), no apaga.
- **Apagado automatico = BLOQUEO PERSISTENTE DE ESCRITURA (ATH-DEV-130)**: si el job `sync` no termina bien, el job
  `apagado` (unico con permiso de escritura, `issues: write`) abre una incidencia `BLOQUEO-ESCRITURA-SYNC`. El workflow NO se
  deshabilita: sigue corriendo cada 2 horas, pero SIEMPRE EN SOMBRA (vigila, avisa, tablero), sin poder crear pedidos.
  Motivos (`shutdownReason`): error de lectura/configuracion/pruebas, escritura parcial (`FALLO_PARCIAL`), resultado
  ambiguo, verificacion fallida, rechazo de Odoo, duplicados (`DUPLICADO_DETECTADO`), cambio inesperado entre el plan y la
  escritura (`CAMBIO_INESPERADO`), auditoria de Odoo, privacidad. No bloquean: identidad dudosa del contacto (queda para
  una persona y no consume el cupo), conflictos ya conocidos (pedido facturado, sobreventa), cupo agotado, `SYNC_KILL=1`.
- **Desbloqueo, solo gerencia**: revisar el fallo y fijar la variable de Actions `SYNC_DESBLOQUEO = DESBLOQUEO-<numero de
  la incidencia>` (GitHub pide confirmacion 2FA). Cerrar la incidencia, relanzar, reiniciar o cambiar `SYNC_ENABLED`,
  `SYNC_KILL`, `SYNC_MAX_OPS` o `SYNC_ARM` no desbloquea. Si el pestillo no se puede leer, se trata como bloqueado.
  Solo cuentan incidencias creadas por `github-actions[bot]`: nadie puede falsificar un desbloqueo.
- **Segundo cerrojo en Odoo** (`auditSyncWrites`, independiente de GitHub): un contacto `SMOOBU-<id>` sin pedido (resto de
  una escritura parcial) o una reserva con mas de un pedido vigente entre los creados por la sincronizacion impiden escribir
  hasta que una persona lo corrija en Odoo. Lectura truncada = bloqueado.
- El conciliador diario es otro workflow, solo lectura, y no depende de nada de esto.
- **Alertas (ATH-DEV-132)**: los conflictos conocidos del plan (pedido facturado, sobreventa, ambigua, noches ocupadas...) salen
  como avisos de GitHub (`::warning::`) y en la seccion "Alertas" del resumen. Solo avisan: no paran la vigilancia ni abren
  bloqueo.
- **Prueba controlada del bloqueo**: ejecucion manual con `prueba_bloqueo = true`. La sincronizacion corre normal en sombra y,
  si termina bien, el mismo job `apagado` abre una incidencia de bloqueo REAL (sin provocar ningun fallo). Solo puede anadir un
  bloqueo; quitarlo sigue exigiendo `SYNC_DESBLOQUEO`. Las ejecuciones programadas nunca la activan.
- **Idempotencia entre ejecuciones**: no depende de la bitacora (que es temporal por ejecucion). El plan se recalcula
  cada vez desde Odoo; el pedido se identifica por `SMOOBU-<id>` en `x_pms_reference` (se revalida justo antes de crear)
  y el contacto por `ref = SMOOBU-<id>`. Un corte entre escrituras nunca duplica: deja el contacto sin pedido, lo que activa
  el cerrojo de Odoo hasta revision humana.
