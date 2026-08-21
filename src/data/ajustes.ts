/* ============================================================
   AJUSTES GLOBALES DEL SITIO

   Interruptores que afectan a varias paginas a la vez y que
   deben poder cambiarse en un solo sitio.
   ============================================================ */

/* ------------------------------------------------------------
   FORMULARIO DE CONTACTO — DESACTIVADO A PROPOSITO

   Por que esta apagado:
   el formulario NO envia los datos a ningun servidor. Al pulsar
   "Enviar consulta" respondia "Gracias, recibimos tu mensaje",
   que es falso. Un cliente se iba creyendo que nos habia escrito,
   y nosotros nunca recibiamos nada. Eso pierde reservas reales.

   Que se ve mientras tanto:
   en su lugar aparece el bloque de WhatsApp, que es el canal por
   el que si respondemos.

   Que NO se ha borrado:
   el marcado completo del formulario sigue en cada pagina, dentro
   de la rama "true" de la condicion. No hay que reescribir nada.

   Como volver a encenderlo:
   cuando el formulario envie de verdad (pendiente 50: conectarlo a
   un servicio de envio real), poner true aqui abajo. Y antes de
   eso, corregir el mensaje de confirmacion en
   public/assets/js/main.js, que hoy sigue diciendo que el mensaje
   fue recibido.
   ------------------------------------------------------------ */
export const formularioContactoActivo = false;

/* ------------------------------------------------------------
   WhatsApp: destino de respaldo.

   Solo se usa si el JavaScript no carga. El numero de trabajo
   vive en public/assets/js/main.js, que es quien construye los
   enlaces con el mensaje ya escrito. Aqui esta duplicado a
   proposito, para que el boton nunca quede muerto.
   ------------------------------------------------------------ */
export const whatsappRespaldo = 'https://wa.me/573188983167';
