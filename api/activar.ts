/* POST /api/activar — el cliente pide su codigo.
   Una sola accion por parte de quien lo usa: el cuerpo puede venir
   vacio. Fuente, personas y contacto son opcionales, y el contacto
   solo se guarda si viene con consentimiento expreso. */
import { maneja, cuerpo, texto, numero, type Peticion } from './_http.ts';
import { activar } from './_servicio.ts';
import { esFuente } from '../src/data/transacciones-red.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const datos = cuerpo(peticion);
  const fuente = texto(datos, 'fuente', 40);
  const personas = numero(datos, 'personas');

  const resultado = await activar({
    fuente: esFuente(fuente) ? fuente : undefined,
    personasPrevistas: Number.isFinite(personas) ? personas : undefined,
    consienteSeguimiento: datos.consienteSeguimiento === true,
    contacto: texto(datos, 'contacto', 25),
  });

  return { estado: resultado.ok ? 201 : 500, cuerpo: resultado };
});
