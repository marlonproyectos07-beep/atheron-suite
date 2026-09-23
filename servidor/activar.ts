/* POST /api/activar — el cliente pide su codigo.
   Una sola accion por parte de quien lo usa: el cuerpo puede venir
   vacio. Fuente, personas y contacto son opcionales, y el contacto
   solo se guarda con consentimiento expreso.

   Es un endpoint publico -tiene que serlo-, asi que lleva limite de
   peticiones: sin el, un bucle llena el almacen en un minuto. */
import { maneja, cuerpo, DEMASIADAS, type Peticion } from './_http.ts';
import { activar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { pasaLimite, quienLlama } from './_autorizacion.ts';
import { entero } from '../src/data/validacion.ts';
import { EXPLICACION_RECHAZO, MAX_PERSONAS } from '../src/data/transacciones-red.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const deposito = almacen();
  if (!(await pasaLimite(deposito, 'activar', quienLlama(peticion.headers)))) return DEMASIADAS;

  const datos = cuerpo(peticion);

  /* Personas es opcional, pero si viene y no vale se dice: antes se
     descartaba en silencio y el local acababa preparando mesa para
     un numero que el cliente creia haber enviado. */
  if (datos.personas !== undefined && datos.personas !== null) {
    if (entero(datos.personas, 1, MAX_PERSONAS).valor === undefined) {
      return {
        estado: 400,
        cuerpo: { ok: false, motivo: 'PERSONAS_INVALIDAS', explicacion: EXPLICACION_RECHAZO.PERSONAS_INVALIDAS },
      };
    }
  }
  if (datos.contacto !== undefined && datos.contacto !== null && typeof datos.contacto !== 'string') {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CONTACTO_INVALIDO', explicacion: 'El WhatsApp se manda como texto.' } };
  }

  const resultado = await activar(
    {
      /* Sin conversiones: la validacion estricta vive en el modelo
         (src/data/validacion.ts) y decide que es un numero y que no. */
      fuente: datos.fuente,
      personasPrevistas: datos.personas,
      consienteSeguimiento: datos.consienteSeguimiento === true,
      contacto: datos.contacto,
    },
    deposito,
  );

  return { estado: resultado.ok ? 201 : 500, cuerpo: resultado };
});
