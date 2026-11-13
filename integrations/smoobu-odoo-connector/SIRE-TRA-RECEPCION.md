# Recepcion: registro de huespedes, SIRE y TRA (guia breve)

Menu **Registro SIRE/TRA** en Odoo.

## Antes de la llegada
1. Al **confirmar** una reserva que viene de Smoobu, Odoo deja el enlace de registro **preparado** (no lo envia). Una reserva en borrador no lo tiene.
   Se ve en **Registro SIRE/TRA > Enlaces de registro** y en una nota interna de la reserva. Si no hay enlace, ahi mismo aparece la **causa** (por ejemplo, falta la fecha de entrada o salida): completela en la reserva y el enlace se prepara solo.
   Para generarlo a mano (reserva que no viene de Smoobu, o para reemplazarlo): **Reservas** > abrir la reserva > menu *Accion* > **[SIRE/TRA] Generar enlace de registro**.
2. Copiar el enlace (boton de copiar) y enviarlo al huesped principal por el canal habitual.
   - Un enlace por reserva; vence el dia del check-out a las 23:59 (hora de Bogota); sirve una sola vez.
   - Generar otro enlace a mano revoca el anterior. **Revocar enlace** lo anula sin generar otro; Odoo no lo vuelve a crear solo.
3. El huesped principal llena sus datos y los de sus acompanantes (hasta 21). Al terminar, los datos aparecen en **Huespedes** como *Recibido* y las respuestas del formulario se borran (solo quedan en Odoo, en la ficha de cada huesped).

## A la llegada
4. La reserva debe estar confirmada y hoy dentro de sus fechas (no se usa el estado de alquiler: en este Odoo pasa a "devuelto" al confirmar).
5. **Huespedes** > filtro *Por validar* > abrir cada huesped:
   - asignar la **habitacion fisica** (Casa Completa no sirve: es un producto derivado);
   - corregir nacionalidad, ciudades o documento si hace falta;
   - **Validar datos**. Si falta algo, Odoo dice que y no valida nada.
6. **Registrar llegada real** (uno a uno o varios con *Accion*). Solo aqui nacen las obligaciones:
   SIRE entrada (solo extranjeros) y TRA (todos).

## Reportar
- **SIRE**: *Hoja guiada SIRE* muestra los datos en el orden del formulario del portal. Cargar en el portal SIRE,
  luego *Accion* > **Marcar cargado en portal SIRE**. Al confirmar en *Consultar carga de informacion*, abrir el
  huesped > **Registrar resultado de reporte** > resultado *Aceptado* + **adjuntar el PDF/captura** (sin evidencia no se acepta).
  El archivo TXT automatico esta **deshabilitado** hasta tener los codigos oficiales del paquete de guia SIRE.
- **TRA**: mientras el emisor por API este apagado, usar *Hoja guiada TRA* en el portal TRA y registrar el resultado
  con evidencia (captura de "Huespedes registrados").
- **Incierto** (no se sabe si llego): revisar el portal. Si aparece: *Aceptado* con evidencia. Si no aparece: *Comprobado: no recibido* (vuelve a pendiente). Nunca reenviar sin revisar.

## A la salida
7. **Registrar salida real** > nace SIRE salida (extranjeros). Reportar igual que la entrada.

## Limites que hay que saber
- Hay un solo usuario de Odoo: el historial no identifica a la persona; el campo *Actor* es declarado.
- El historial de intentos solo se crea y se lee desde la interfaz; un administrador podria cambiar esa regla.
