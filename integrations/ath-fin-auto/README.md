# ATH-FIN-AUTO-001 — piloto bancario móvil, solo lectura

**Estado: prototipo en rama y PR borrador. No instalado, ni fusionado, ni conectado a Odoo.**

Objetivo final: desde el celular (ChatGPT como canal principal), recibir alertas bancarias,
identificar cuál operación corresponde a ATHERON, verificarla contra bancos y Odoo,
solicitar concepto y aprobación del responsable, y devolver el enlace del documento.

## Primera entrega (este PR)

Módulo puro `src/alert-readonly.mjs` que recibe texto de una alerta ya consultada
por un canal autorizado y devuelve un registro mínimo de revisión:

- Tipo: transferencia saliente, QR entrante, retiro, ingreso o aviso no financiero.
- Importe COP y últimos cuatro dígitos solo cuando son explícitos.
- Etiqueta tentativa de cuenta empresarial *0136, no confirmación de titularidad.
- Fecha **de recepción de Gmail**, no fecha certificada por el banco.
- La operación nunca aparece como PAGADA, CONFIRMADA o CONTABILIZADA.
- Huella SHA-256 del ID de Gmail para identificar la misma alerta repetida.
- Colisiones por cuenta/importe/día únicamente como *posibles* duplicados;
  no descartar ni unir movimientos distintos sin referencia bancaria oficial.
- No devuelve cuerpos, nombres de contrapartes, direcciones de correo, enlaces,
  fotos, extractos ni saldos.
- **No realiza llamadas a Gmail, bancos, Odoo ni Smoobu. No escribe nada.**

Las pruebas usan **exclusivamente textos ficticios**, no datos de clientes.

## Siguiente integración (no incluida y no autorizada para escrituras)

1. Conectar Gmail de manera autenticada y con mínimos permisos; consultar un lote pequeño.
2. Separar remitente verificado de simple texto de correo; detectar avisos engañosos o sin cuenta.
3. Cruzar con **extracto bancario oficial** y mayor Odoo, inicialmente solo lectura.
4. Preparar bandeja móvil de revisión: origen, cuenta, dirección, importe, verificación,
   duplicados posibles, concepto pendiente y **cero escrituras**.
5. Incorporar aprobaciones específicas y servicio escritor aislado *solo después*
   de nueva autorización explícita de gerencia.
6. Conservar **Hotels / Security** separados y excluir cuentas personales.

## Seguridad crítica

`PAYMENT_REPORTED != PAYMENT_CONFIRMED != ACCOUNTED`

La alerta de Gmail y el comprobante de WhatsApp **no prueban el recaudo efectivo**.
No asumir que *0136 basta para certificar titularidad del mensaje.
Nunca compensar, contabilizar en transitorias, acreditar a Marlon o marcar pago
recibido por heurística. No registrar facturas DIAN ni emitir pagos.

No publicar muestras reales bancarias en GitHub Actions, logs ni artefactos.
No persistir credenciales ni datos financieros en el repositorio.

## Ejecutar pruebas locales

```sh
cd integrations/ath-fin-auto
npm test
```

El CI ejecuta estas pruebas sin secretos ni acceso a red.
