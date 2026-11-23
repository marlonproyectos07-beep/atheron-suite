# ATH-WA-INGEST-001 — Recepción automática de Cartera Atheron

**Estado:** diseño técnico, **no conectado ni instalado**. Dependencia: ATH-FIN-AUTO-001.
**Objetivo:** los reportes continúan enviándose al grupo privado de WhatsApp; un servicio de Atheron los recibe automáticamente y los deja disponibles para consulta en ChatGPT y conciliación contable segura.

## Evidencia técnica y decisión

- La vía **oficial** de Meta WhatsApp Business Platform incluye Groups API para grupos creados por API y cuentas OBA elegibles. **No se puede asumir que lea el grupo existente de la app**. El modo Coexistence no habilita Groups API.
- Meta AI (incluso Private Processing) puede ser agregado como miembro en grupos elegibles y leer mensajes nuevos, pero **no hay una interfaz confirmada de exportación evento-a-evento a Odoo** ni una garantía de conexión entre ese agente del grupo y los conectores de Muse.
- Alternativa de prototipo sin cambiar el grupo: cuenta de pruebas dedicada, añadida al grupo actual como participante, conectada como dispositivo vinculado a puente WAHA/Evolution API (WhatsApp Web). Recibir mensajes por **webhooks**. Esta es una vía **no oficial**, con riesgo de restricciones, ruptura y desconexiones; nunca usar el número principal del hotel para iniciar el piloto. Confirmar consentimiento y política empresarial.
- **No usar Vercel Serverless para alojar la sesión WhatsApp Web persistente**. Puede recibir webhooks, pero la conexión de dispositivo vinculado necesita un servicio persistente con almacenamiento cifrado de sesión. Evaluar host existente para evitar nuevos costes; no contratar infraestructura sin autorización.
- Fase oficial alternativa: crear entrada 1:1 en Cloud API con número de empresa, o grupo nuevo mediante Groups API solo si la cuenta alcanza elegibilidad OBA. Esto cambia el flujo actual.

Fuentes consultadas (21/11/2026):
- https://faq.whatsapp.com/1455734669560058/
- https://docs.360dialog.com/docs/messaging/groups
- https://waha.devlike.pro/docs/how-to/receive-messages/
- https://github.com/evolution-foundation/evolution-api
- https://www.meta.com/en-gb/help/superintelligence/1687253048996149/

## Arquitectura propuesta

```
Grupo privado 'Cartera Atheron' (personal habitual)
          | mensaje, foto, nota de voz (sin reenviar manualmente)
          v
Numero de pruebas agregado al grupo
          | WhatsApp Web vinculado (solo piloto, proveedor no oficial)
          v
Puente WAHA o Evolution API, servicio persistente
          | webhook HTTPS autenticado + reintentos
          v
ATH-WA-INGEST — receptor aislado SOLO LECTURA
          | allowlist de group_id y sender_id; validate schema; idempotencia
          v
Bandeja privada de evidencia (mensaje bruto cifrado + hash + fuente)
          | extractor en segundo proceso con salida estructurada
          v
ControlGate ATH-FIN-AUTO-001
          | origen (Caja Hotels vs banco), monto, fecha, concepto, custodio
          | cross-check caja/banco + Odoo 19, SOLO LECTURA
          v
PENDIENTE_DE_VALIDACION / POSIBLE_DUPLICADO / LISTO_PARA_APROBAR
          |
          +--> Conector privado ChatGPT/MCP: consulta por cuenta/fecha/ID
          +--> Alerta al responsable con enlace privado para aprobar
          |
          v
[FASE POSTERIOR; INACTIVA] Escritor Odoo de permisos mínimos
          | después de autorización de una operación específica
          v
Documento Odoo + saldo Caja Hotels posterior + evidencia de verificación
```

## Esquema de evento normalizado — no retornar textos financieros al chat abierto

```json
{
  "eventVersion": 1,
  "source": "WHATSAPP_GROUP",
  "groupId": "only-allowlisted-chat-id",
  "messageId": "provider-id",
  "senderId": "allowlisted-staff-id",
  "receivedAt": "ISO-8601",
  "type": "text|image|audio|document",
  "payloadEncryptedRef": "internal-only",
  "attachmentsSha256": ["..."],
  "businessUnit": "HOTELS|SECURITY|REVIEW",
  "cashBankSource": "CAJA_HOTELS|BANCO|UNKNOWN",
  "direction": "INGRESO|RETIRO|TRANSFERENCIA|UNKNOWN",
  "amountCop": null,
  "concept": null,
  "custodian": null,
  "status": "REPORTADO_PENDIENTE_VERIFICACION",
  "odooWriteCount": 0
}
```

No inferir businessUnit de nombres propios ni cashBankSource por asociación vaga. No considerar el texto emitido por WhatsApp una instrucción de ejecución del servidor.

## Seguridad y controles de caja

1. Los números de WhatsApp del grupo se informan de la integración y del tratamiento de sus mensajes. Únicamente se lee el grupo autorizado; no se ingieren chats personales ni de huéspedes.
2. Claves del puente, cookies y sesión de WhatsApp fuera de GitHub y fuera de las respuestas del asistente; TLS, rotación, copia cifrada y acceso mínimo.
3. Webhook autenticado, validación de origin/verificación de firma si está soportada. No confiar en el campo `fromMe` ni en nombres visibles como autorización de gasto.
4. **Idempotencia única:** `(provider, groupId, messageId)`. No deduplicar por importe/fecha; varias transacciones iguales pueden ser legítimas.
5. Texto, audio, imagen y adjuntos del grupo son **datos no confiables**. No interpretarlos como instrucciones que desactiven controles o publiquen asientos. Escanear archivos y limitar tamaño.
6. Si se pierde enlace WhatsApp, expira sesión, webhook falla o desaparecen mensajes: detener recepción con estado `SIN_COBERTURA` y alertar; no rellenar huecos ni afirmar auditoría completa.
7. Caja Hotels: una retirada de efectivo **no requiere correo Bancolombia**; exige monto, persona responsable, motivo, fuente de caja y arqueo/recibo. No convertirla por defecto en gasto del hotel ni anticipo al socio.
8. Bancos: `PAYMENT_REPORTED != PAYMENT_CONFIRMED != ACCOUNTED`; confirmar con extracto o fuente bancaria verificable.
9. Estados separados: `REPORTADO`, `CONCILIADO`, `PROPUESTO`, `APROBADO`, `REGISTRADO` y `RECHAZADO`. Ningún estado final se deduce de una sola foto.
10. El resumen de caja posterior a un asiento debe distinguir saldo de Odoo, arqueo físico y diferencias pendientes. Nunca inventar saldos.
11. Las aprobaciones de contabilidad se realizan por canal privado autenticado, **no mediante un «sí» de cualquier participante del grupo**. Verificación final de coincidencia exacta y de que no existe asiento previo.
12. Fase piloto: **sin escrituras** a Odoo, Smoobu, WhatsApp ni bancos. Prohibido borrar/editar mensajes originales.

## Prueba de aceptación (sin exponer transacciones reales en logs públicos)

- T1: retiro ficticio 'Salieron 90.000 de Caja Hotels, entregados a ...' en grupo autorizado → 1 evento REPORTADO y borrador de clasificación, 0 asientos.
- T2: mismo evento recibido dos veces por webhook → una sola entrada idempotente.
- T3: dos mensajes distintos, mismo monto y hora → dos entradas, advertencia posible duplicado.
- T4: mensaje en grupo no autorizado y DM personal → 0 registros.
- T5: pago bancario reportado por foto → no marcar banco CONFIRMADO sin soporte bancario externo.
- T6: retiro sin custodio/concepto → bloqueado PENDIENTE_DATOS, sin asiento.
- T7: caída de puente → aviso inmediato SIN_COBERTURA, sin afirmar que todos los mensajes llegaron.
- T8: enlace privado ChatGPT consulta última entrada y la evidencia, sin escritura.
- T9: con intervención del dueño, comprobar posibilidad de aprobación segura y bitácora; crear asientos queda fuera de este PR.

## Orden de ejecución sin alterar operación

**G0**: confirmar que existe grupo, un teléfono de prueba o número no crítico, consentimiento de participantes y servidor persistente autorizado. Si falta alguno, no instalar.
**G1**: instalar puente aislado y verificar lectura de 1 evento ficticio; no habilitar envío.
**G2**: webhook autenticado solo grupo + caja de eventos cifrada + pruebas anti-duplicado.
**G3**: preparar consulta MCP privada de ChatGPT con bandeja read-only; probar desde celular.
**G4**: enlazar conciliación read-only de Caja Hotels y Odoo; verificar contra arqueo real.
**G5**: habilitar escritor Odoo solo tras nueva autorización específica y prueba en staging.

No hay implementación de WAHA, Evolution, conexión de Meta AI, servidor, webhooks ni envío contable en esta rama. El usuario debe aprobar el canal y los recursos antes de que se conecte cualquier WhatsApp real.
