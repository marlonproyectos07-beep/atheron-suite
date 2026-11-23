# ATH-CONTROL-AI — Plan de ejecución para Claude Code / Opus 5.5

**Fecha:** noviembre de 2026. **Cliente:** ATHERON S.A.S.
**Objetivo prioritario:** capturar automáticamente los movimientos de caja y comprobantes del grupo existente de WhatsApp **Cartera Atheron**; conciliarlos con bancos y Odoo 19. **Segundo objetivo:** recibir eventos nativos de Odoo (ventas en mostrador, pagos, contactos, inventario y compras), aunque nadie los publique en WhatsApp.

## Contexto confirmado

- Odoo 19 Enterprise en `atheron1.odoo.com` con acceso JSON-2 comprobado.
- WhatsApp Cloud Hotels integrado a Odoo; un mensaje de prueba individual quedó en `whatsapp.message` y pudo localizarse exactamente con `search_count`. **Cloud individual no significa acceso a grupos nativos existentes**.
- WhatsApp antiguo de recepción, comercial y publicado: +57 318 898 3167; no desconectarlo ni modificar su perfil de WhatsApp Business, ni alterar enlaces públicos. Número Cloud nuevo también debe permanecer intacto.
- `Cartera Atheron` es un grupo nativo usado por el personal para reportar retiros Caja Hotels, consignaciones, pagos, transferencias y movimientos de Security. **Aún no hay integración automática al grupo**.
- GitHub PR #119, rama `ath-fin-auto-001-alerts-readonly`, contiene: parser Gmail, clasificador de mensajes Odoo, adaptador Odoo JSON-2, poller restringido y receptor de webhook de grupo **sin despliegue**. Solo pruebas ficticias y sin escrituras.
- El repositorio GitHub puede ser público. **Nunca subir** mensajes, fotos, números, identificadores de grupos reales, datos de huéspedes, tokens, cookies, claves ni saldos bancarios a git, logs CI o artefactos públicos.

## Decisión técnica — sistema de eventos único

```
(1) Grupo Cartera Atheron -- dispositivo WhatsApp auxiliar NO CRÍTICO,
    miembro consensuado del grupo -- WAHA bridge [NO OFICIAL, SOLO PILOTO]
    -> Webhook HTTPS HMAC (sha512), solo chatId autorizado, solo senderId autorizado
    -> STORE privado cifrado con idempotencia -> evento REPORTADO

(2) Odoo 19 Enterprise -- Send Webhook Notification en Studio / automatizaciones
    por modelos selectos, o un poller JSON-2 de solo lectura donde no haya evento
    -> mismo STORE privado cifrado con deduplicación -> evento ODOO_OBSERVADO

(3) Gmail alertas Bancolombia empresariales, extractos bancarios permitidos
    -> mismo STORE privado -> evidencia financiera (sin confundir notificación
    con saldo real ni con pago confirmado)

(4) Motor de clasificación + conciliación read-only -> estados
    PENDIENTE_DATOS | REPORTADO | CONCILIADO | PROPUESTO | POSIBLE_DUPLICADO
    -> panel privado ChatGPT (MCP) con fuente/fecha/cuentas y enlaces a Odoo
    -> APROBACIÓN PRIVADA EXPLÍCITA POR OPERACIÓN
    -> [FASE FUTURA] único escritor Odoo con permisos mínimos, control de saldo
```

No usar n8n como requisito. Puede utilizarse si aporta orquestación, pero el pipeline debe funcionar sin n8n. No usar Meta AI/Muse como si pudiera exportar mensajes del grupo; esa capacidad no se ha confirmado. No convertir Cloud API en cliente WhatsApp Web ni vincular los números de producción a WAHA.

## Orden estrictamente prioritario de implementación

### G0. Bloqueo de seguridad y acceso

1. Validar que existe un **número WhatsApp auxiliar no crítico** y que se puede agregar al grupo actual con conocimiento de los miembros. Si no existe, detener el enlace real; **NO usar el 318 de recepción ni el nuevo Cloud de Hotels o Security**.
2. Desplegar WAHA en servidor privado con sesión persistente cifrada, backups, red privada, QR de autenticación y admin sin acceso público. WAHA utiliza un cliente WhatsApp Web no oficial; hay riesgo de restricción o suspensión del número y de pérdida de cobertura.
3. Obtener ID real del grupo y sender IDs desde el dispositivo auxiliar y guardar exclusivamente como secretos de despliegue. No publicarlos.
4. Elegir Postgres privado / infraestructura de eventos con cifrado en reposo, TLS, retención y acceso restringido. **Sin DB duradera privada no activar webhook**.
5. Fijar webhook `message` con HMAC y reintentos; nunca habilitar endpoints de envío de WAHA en la ruta de automatización contable. Solo chat/group exacto, solo remitentes autorizados; todos los mensajes fuera de alcance quedan excluidos.
6. Validar contrato del motor WAHA elegido, porque `participant` a veces puede ser `@lid`. Si falta identidad verificable, poner en cuarentena y alertar en lugar de deducir un número o registrar un asiento.
7. Monitoreo de `session.status`, cobertura y pérdida de mensajes. Si falla receptor, usar estado `SIN_COBERTURA`; no afirmar que todos los mensajes llegaron.

### G1. Captura de texto y fotos

1. Usar `integrations/ath-fin-auto/src/waha-group-ingest-readonly.mjs` como núcleo de receptor HTTP firmado; usar solo `storeOnce` atómico contra DB duradera cifrada. Verificar antes de publicar que el servidor web preserve el **raw POST body** para HMAC.
2. Empezar con un texto inventado: `ATH-PRUEBA: salieron $90.000 de Caja Hotels, sin movimiento real, no contabilizar`. Debe entrar a DB como evento `REPORTADO` o `PRUEBA`, 0 asientos Odoo.
3. Capturar una imagen inventada de comprobante, **no un extracto o identificación real**; registrar metadata, y luego un worker separado descargará exclusivamente del host/endpoint media configurado con token y protección SSRF, validación de tamaño/formato, antivirus y evidencia cifrada. `media.url` recibida por webhook es no confiable.
4. Notas de voz: incorporar transcripción solo después de privacidad, consentimiento y pruebas; transcripción incierta se marca `PENDIENTE_VERIFICACION`.
5. Garantizar que mensajes diferentes con el mismo importe no se fusionen. Clave `(provider, groupId, messageId)`; reintentos del mismo webhook se deduplican.

### G2. Conciliación financiera (SIN escribir)

- Para **Caja Hotels** y **Caja Security**, identificar negocio, importe, dirección, concepto, responsable, fecha, soporte y cuenta. Un reporte de retiro no basta para decidir si es gasto, anticipo o transferencia; exigir custodia y recibo/arqueo.
- Para **Bancolombia empresa**, validar que la notificación es de cuenta empresarial y cruzarla con movimiento bancario verificable. **Gmail por sí solo no demuestra saldo ni titularidad de una cuenta sin identificador explícito**.
- Evitar mezclar la cuenta personal de Luz, Nequi personal y cuentas de la empresa. Solo identificar por cuenta en soporte, no por nombre del remitente.
- Cruzar con `account.move`, `account.payment`, `account.bank.statement.line`, `pos.order`, `sale.order` en Odoo antes de proponer. No convertir un WhatsApp en publicación directa.
- Guardar estados `PAYMENT_REPORTED != PAYMENT_CONFIRMED != ACCOUNTED`. Reportar saldos **comprobados** (banco, libro y caja) y diferencias, nunca saldo inventado.
- Cada propuesta debe referenciar su evidencia original y constar como una sola operación, revisable desde móvil.

### G3. Odoo emite eventos (nativos; SIN depender de WhatsApp)

Auditar configuraciones disponibles de Studio/Automated Actions para eventos salientes. La documentación de Odoo 19 permite `Send Webhook Notification` en reglas activadas por creación/actualización de registros. **Primero staging**, con campos de mínima necesidad y privacidad.

| Modelo Odoo | Evento de interés | Acción |
|--|--|--|
| `pos.order` | transición a pago / finalización | Venta mostrador de cámara, balun, fuente |
| `sale.order` | confirmación o edición relevante | Pedido comercial, no asumir ingreso |
| `account.move` | factura o asiento publicado | Evidencia contable de venta/gasto |
| `account.payment` | pago registrado / estado | Conciliación con banco y factura |
| `stock.picking` | entrega validada | Salida inventario, costo |
| `purchase.order` | compra aprobada | Compromiso, no asumir cuenta por pagar |
| `res.partner` | contacto nuevo | Revisión de duplicado y consentimiento |

Usar evento estable `model,id,write_date,operation,state` y claves idempotentes; no enviar dirección/número de cliente completos salvo necesidad autorizada. Cambios no confirmados no se reportan como ventas realizadas. Reconciliar webhooks con auditoría periódica JSON-2 contra fallos/desconexiones.

### G4. Consulta y alertas privadas en ChatGPT

Construir una herramienta privada MCP **read-only** que permita:
- `ath_get_recent_events(business,from,to,status)`
- `ath_get_pending_cash_movements(business)`
- `ath_get_sales_today(business)`
- `ath_get_reconciliation_status(account,date)`

Autenticar usuario, controlar accesos, limitar PII, paginar, registrar auditoría privada y mostrar fuente de cada dato. **No decir que ChatGPT oye el grupo espontáneamente**: el webhook debe persistir primero y el conector debe estar instalado y enlazado. Alertas proactivas requieren programador/notificador real.

### G5. Publicación contable CONTROLGATE (FASE SEPARADA)

No construir flujo que publique automáticamente a partir de un WhatsApp, correo o simple venta sin conciliación y autorización. El dueño aprueba **una operación específica** por un canal autenticado; se verifica tercero, documento, fecha, importe, diario, compañía y duplicado. Solo entonces una tarea escritora segregada con permiso mínimo puede crear/aprobar registro según política. Devolver referencia Odoo y saldo/libro de cuenta verificado **después del asiento**. En caso de fallo, no afirmar éxito.

## Criterios de aceptación

- Grupo real: 1 texto y 1 imagen ficticios de remitentes permitidos llegan solos al almacén privado; no se incluyen clientes ajenos ni mensajes de otras conversaciones; sin reenviar a ChatGPT.
- Reenvío/reintento del mismo webhook: 1 solo evento persistido.
- Dos mensajes legítimos de igual monto: 2 eventos.
- Al perder el puente: `SIN_COBERTURA` y aviso, sin asentarlos retroactivamente sin soporte.
- Bancolombia, Caja Hotels, Caja Security y cuentas personales no se mezclan.
- Venta directa de una cámara/balun en Odoo produce evento de Odoo con estado apropiado sin intervención de WhatsApp.
- Consulta ChatGPT móvil muestra operaciones y fuentes en solo lectura; 0 escrituras.
- Tests CI sintéticos en verde; no PII ni secretos ni saldos reales en GitHub.
- Ningún despliegue a producción, cambios a WhatsApp, importación de históricos ni escritura contable antes de aprobación explícita de cada fase.

## Estado REAL al crear este plan

**Código de pruebas y núcleo del receptor preparados.** No hay número auxiliar vinculado, webhook WAHA real, DB de eventos privada, conexión ChatGPT/MCP final, alertas ni reglas Odoo de producción activadas. No presentarlos como terminados.

Fuentes técnicas:
- https://waha.devlike.pro/docs/how-to/events/
- https://waha.devlike.pro/docs/how-to/receive-messages/
- https://docs.360dialog.com/docs/messaging/groups
- https://www.odoo.com/documentation/19.0/applications/studio/automated_actions.html
