# Recepcion: registro de huespedes, SIRE y TRA (guia breve)

Menu **Registro SIRE/TRA** en Odoo.

> **Desde el 17/11/2026:** el enlace se prepara solo al confirmar y el formulario recibido se convierte solo en fichas
> de *Huespedes* (verificado con un huesped ficticio). Ya se pueden enviar enlaces. Pendientes del dia: *Enlaces de
> registro* (vigentes / error) y *Huespedes* > *Por validar*. Desde el 18/11 el establecimiento **Atheron Suite** esta
> configurado y las habitaciones 201, 202, 203, 301 y 302 son *fisicas*: **Validar datos funciona** (asigne siempre una
> de esas cinco; Casa Completa no sirve). Ignore las reservas `PRUEBA-SINTETICA` (canceladas) y sus fichas *Zz ... Ficticio*.
>
> **Reservas listas (18/11):** 03838 (201, en casa hoy), 03839 (301, 21-22 nov), 03840 (302, 2-3 dic) y 03841
> (301, 11-13 dic) tienen su enlace en *Enlaces de registro* y una nota interna en la reserva con lo que falta
> (numero de huespedes en 0, correo/telefono) y el siguiente paso. Envie cada enlace por la mensajeria del canal.
> **Prioridad hoy: 03838 (huesped alojado en la 201, sale el 18/11).** Opcion A: enviar el enlace por Airbnb.
> Opcion B: capturar en recepcion con el documento a la vista (*Huespedes* > *Nuevo*, origen *Recepcion*), y *Validar*.
> Ya hay una ficha **borrador** del huesped principal (nombre de la reserva Airbnb); complete con el documento a la vista
> lo que falta: tipo y numero de documento, nombres y apellidos segun documento, nacionalidad, fecha de nacimiento,
> residencia, procedencia, destino, motivo y acompanantes. El **consentimiento** solo se registra por el formulario.
> **Ojo:** *Registrar llegada real* (version instalada hoy) guarda la hora en que se pulsa; si se registra tarde, anote en
> la reserva la hora real. La version corregida (hora real + hora de captura + motivo) esta en la rama, pendiente de
> probar en la copia antes de instalarla.
> **Siguiente caso: 03839.** Registre llegada y salida solo cuando ocurran. TRA/SIRE oficiales siguen apagados.

## Antes de la llegada
1. Al **confirmar** una reserva que viene de Smoobu, Odoo deja el enlace de registro **preparado** (no lo envia). Una reserva en borrador no lo tiene.
   Se ve en **Registro SIRE/TRA > Enlaces de registro** y en una nota interna de la reserva. Si no hay enlace, ahi mismo aparece la **causa** (por ejemplo, falta la fecha de entrada o salida): completela en la reserva y el enlace se prepara solo.
   Para generarlo a mano (reserva que no viene de Smoobu, o para reemplazarlo): **Reservas** > abrir la reserva > menu *Accion* > **[SIRE/TRA] Generar enlace de registro**.
2. Copiar el enlace (boton de copiar) y enviarlo al huesped principal por el canal habitual.
   - Un enlace por reserva; vence el dia del check-out a las 23:59 (hora de Bogota); sirve una sola vez.
   - Generar otro enlace a mano revoca el anterior. **Revocar enlace** lo anula sin generar otro; Odoo no lo vuelve a crear solo. Si la reserva de Smoobu se cancela, Odoo revoca el enlace vigente solo (el huesped ya no puede registrar datos con la URL anterior); lo ya recibido se conserva.
3. El huesped principal llena sus datos y los de sus acompanantes (hasta 21). Al terminar, los datos aparecen en **Huespedes** como *Recibido* y las respuestas del formulario se borran (solo quedan en Odoo, en la ficha de cada huesped).

## A la llegada
4. La reserva debe estar confirmada y hoy dentro de sus fechas (no se usa el estado de alquiler: en este Odoo pasa a "devuelto" al confirmar).
5. **Huespedes** > filtro *Por validar* > abrir cada huesped:
   - asignar la **habitacion fisica** (Casa Completa no sirve: es un producto derivado);
   - corregir nacionalidad, ciudades o documento si hace falta;
   - **Validar datos**. Si falta algo, Odoo dice que y no valida nada.
6. **Registrar llegada real** (uno a uno o varios con *Accion*). Solo aqui nacen las obligaciones:
   SIRE entrada (solo extranjeros) y TRA (todos). **TRA queda pendiente y NO se envia hasta el check-out**: el MinCIT
   (respuesta 2-2026-039958) pide enviar los registros completos al realizar el check-out.

## Reportar
- **SIRE**: *Hoja guiada SIRE* muestra los datos en el orden del formulario del portal. Cargar en el portal SIRE,
  luego *Accion* > **Marcar cargado en portal SIRE**. Al confirmar en *Consultar carga de informacion*, abrir el
  huesped > **Registrar resultado de reporte** > resultado *Aceptado* + **adjuntar el PDF/captura** (sin evidencia no se acepta).
  El archivo TXT automatico esta **deshabilitado** hasta tener los codigos oficiales del paquete de guia SIRE.
- **TRA**: mientras el emisor por API este apagado, usar *Hoja guiada TRA* en el portal TRA y registrar el resultado
  con evidencia (captura de "Huespedes registrados"). Nota 18/11/2026: el portal del RNT 235267 (grupo PMS) solo
  muestra "Mis Huespedes" y "Generar token"; no se encontro formulario de registro manual.
- **Importe (TRA)**: **despues de registrar la salida real de todos los huespedes**, en *Importes pagados (TRA)*
  registrar el costo total del alojamiento del principal y de todos sus acompanantes, **sin impuestos**, en COP, con
  fecha de corte igual o posterior a la salida y evidencia (comprobante, liquidacion del canal, factura pagada o
  extracto). Marcar las dos constancias (*no incluye impuestos* y *cubre al principal y a todos sus acompanantes*) y
  pulsar *Confirmar con evidencia*. La tarifa de la reserva y un anticipo no sirven. Un "Paid" de Smoobu u otro
  reporte sin soporte se puede anotar, pero sin confirmar no habilita el envio. No se crean ni modifican pagos
  contables. Casos dudosos (saldo pendiente, comision del canal, descuentos, consumos extra, varias habitaciones): no
  confirmar; consultar (ver `deploy/tra-grupo1-manual-y-respuesta-2026-11-24.md`).
- **Incierto** (no se sabe si llego): revisar el portal PMS (https://pms.mincit.gov.co/login/, usuario = RNT). Si
  aparece: *Aceptado* con evidencia. Si no aparece: *Comprobado: no recibido* (vuelve a pendiente). Nunca reenviar sin
  revisar. Tras **dos** fallos reales de la misma ficha el emisor la bloquea (`INTENTOS_FALLIDOS_REPETIDOS`): soporte.
- **Registro enviado por error o con datos equivocados**: no se puede modificar ni reenviar. Pedir el borrado por correo
  a soporte MinCIT (procedimiento en `deploy/tra-grupo1-manual-y-respuesta-2026-11-24.md`).

## A la salida
7. **Registrar salida real** de cada huesped > nace SIRE salida (extranjeros). Reportar igual que la entrada.
   Con la salida de **todos** registrada y el importe confirmado, la estancia queda lista para TRA (el envio sigue
   apagado hasta revisar el primer caso).

## Limites que hay que saber
- Hay un solo usuario de Odoo: el historial no identifica a la persona; el campo *Actor* es declarado.
- El historial de intentos solo se crea y se lee desde la interfaz; un administrador podria cambiar esa regla.
