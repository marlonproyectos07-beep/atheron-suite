/* GET /api/transaccion?c=ATH-TRI-XXXXX — lo que mira el local al
   escanear. Nunca devuelve el contacto del cliente: para cobrar no
   hace falta saber quien es. */
import { maneja, parametros, type Peticion } from './_http.ts';
import { consultar } from './_servicio.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';
import { EXPLICACION_RECHAZO } from '../src/data/transacciones-red.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const lectura = leerCodigo(parametros(peticion).get('c') ?? '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return {
      estado: 400,
      cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion ?? EXPLICACION_RECHAZO.CODIGO_INVALIDO },
    };
  }
  const resultado = await consultar(lectura.codigo);
  return { estado: resultado.ok ? 200 : 404, cuerpo: resultado };
});
