/* GET /api/operador — ¿esta credencial sirve para este aliado?

   Existe para que la pantalla del local pueda decir "esa credencial
   no es" en el momento de teclearla, en vez de dejar que el operador
   lo descubra cuando ya tiene al cliente delante con la cuenta
   pedida.

   Pasa por la MISMA politica de autenticacion que redimir: si no,
   seria la puerta comoda para adivinar la credencial sin que nadie
   lleve la cuenta de los intentos. */
import { maneja, type Peticion } from './_http.ts';
import { almacen } from './_almacen.ts';
import { autoriza, RESPUESTA_AUTORIZACION } from './_autorizacion.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  const veredicto = await autoriza(deposito, peticion.headers, 'OPERADOR', PILOTO.slugAliado);
  if (veredicto !== 'OK') return RESPUESTA_AUTORIZACION[veredicto];
  return { estado: 200, cuerpo: { ok: true, operador: true } };
});
