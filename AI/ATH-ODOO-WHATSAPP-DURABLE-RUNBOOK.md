# WhatsApp TEST/Preview: credencial duradera y recuperación

Estado al 2026-10-02: **WHATSAPP_DURABLE READY** para TEST/Preview. El E2E TEST previo de dos turnos pasó y la prueba final con el token del usuario del sistema llegó al teléfono TEST. La [guía oficial de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) recomienda el token de usuario del sistema para el uso estable.

## Alcance comprobado

- App: `Atheron Hotels Pilot` (`1606991587743431`), portfolio `atheron_suite` (`524859384038487`).
- WABA TEST: `1046729744842771`; Phone Number ID TEST: `1354963861014065`.
- Webhook Meta: HOTEL-011 Preview, campo `messages` suscrito, URL configurada en Meta. El token saliente vive como secreto `WHATSAPP_ACCESS_TOKEN` en Vercel, únicamente en Preview de `feature/ath-odoo-hotel-016-whatsapp-natural-media`.
- El titular autorizó expresamente la certificación de la política de Meta. Se creó el usuario del sistema `ath_wa_test` (Employee), ID `61594674195276`, con solo dos activos: app `Atheron Hotels Pilot` y WABA TEST. El WABA tiene acceso parcial a `Mensajes` y `Números de teléfono (solo ver)`.
- Se generó un token de ese usuario con caducidad **Nunca** y solo permiso `whatsapp_business_messaging`. Meta confirmó la emisión. El primer token se revocó inmediatamente tras exponerse en la URL de la herramienta oficial de depuración. Un segundo token del mismo alcance se guardó como `Secret` en Vercel únicamente para Preview de HOTEL-016. No se imprimen valores.
- El deployment Preview de HOTEL-016 se redesplegó desde el commit `671a96f` como `29DMZ6iPkXSn6koerLvyhC54N8sM`; Vercel lo marcó Ready. En la última prueba, HOTEL-011 registró POST 200 a las 16:31:55 (America/Bogota), HOTEL-016 aceptó un mensaje (duplicados 0), el Gateway registró `availability` en `x_hotel_api_log` ID 396 de Odoo STAGING a las 21:32:22 UTC y HOTEL-016 obtuvo HTTP 200 de Meta en dos envíos. El titular confirmó después que la respuesta llegó al teléfono TEST.

## Mecanismo oficial previsto

1. En Configuración del negocio de Meta, conservar `ath_wa_test` con rol Employee y acceso al WABA TEST limitado a mensajes. No asignar cuentas publicitarias, otras apps ni otros WABA. Una solicitud de control total del WABA fue rechazada por la revisión automática por ser excesiva; se usó el permiso parcial permitido.
2. Para rotar, generar otro token de ese usuario para `Atheron Hotels Pilot`, caducidad `Nunca`, permiso único `whatsapp_business_messaging`. No abrir la herramienta de depuración con el token: esta lo incorpora a una URL visible en historial y registros.
3. Editar `WHATSAPP_ACCESS_TOKEN` como **Secret**, limitado al Preview de `feature/ath-odoo-hotel-016-whatsapp-natural-media`. Redesplegar esa misma rama y verificar el resultado. Revocar el token anterior una vez que el nuevo E2E pase; si se expone, revocarlo inmediatamente y sustituir el secreto antes de redesplegar.
4. Confirmar webhook entrante en HOTEL-011, envío saliente aceptado en HOTEL-016 y recepción en el teléfono TEST. No aplicar cambios a Production.

## Ciclo de vida, renovación y recuperación

- Meta ofreció y confirmó la opción `Nunca`; no hay fecha de caducidad programada. El token sigue sujeto a revocación, pérdida de permisos, eliminación del usuario/activo o cambios de Meta. No requiere copiar un token temporal cada pocas horas.
- Rotación planificada: emitir un segundo token para los mismos activos y permisos; sustituir el secreto de Preview, redesplegar, ejecutar E2E TEST, y luego revocar el anterior. Nunca imprimir ni versionar tokens.
- Ante `send_failed` o HTTP 401/190: comprobar primero el alcance de la variable de Vercel, el despliegue activo, los permisos del usuario del sistema y el WABA/Phone Number ID TEST. Rotar solo el secreto de Preview y repetir el E2E. Ante fallo de entrada: revisar suscripción `messages`, callback HOTEL-011 y logs de webhook antes de tocar la credencial saliente.
- Observabilidad disponible: logs sanitizados `send_failed`/`send_accepted` de HOTEL-016 y estados `sent`/`delivered`/`read` de Meta. Falta una alerta automática gratuita comprobada para 401/190; por ello la estabilidad no se debe declarar READY solo con logs históricos.

## Gate de cierre

Se verificaron el tipo y vigencia del token en Meta, su alcance TEST/Preview en Vercel, el redespliegue de HOTEL-016, la entrada por HOTEL-011, la consulta Odoo STAGING y la recepción en el teléfono TEST. La alerta automática de fallos aún no fue configurada; el control operativo disponible es revisar `send_failed`/401/190 y los estados de entrega en los logs de Preview.
