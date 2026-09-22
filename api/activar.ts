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

export default maneja('POST', async (peticion: Peticion) => {
  const deposito = almacen();
  if (!(await pasaLimite(deposito, 'activar', quienLlama(peticion.headers)))) return DEMASIADAS;

  const datos = cuerpo(peticion);
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
