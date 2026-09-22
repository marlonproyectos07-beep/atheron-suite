/* POST /api/seguimiento — "¿Como te fue en La Triada?"
   Solo sobre una visita que consta redimida. No se manda ningun
   mensaje desde aqui: esto recoge la respuesta, no la provoca. */
import { maneja, cuerpo, texto, numero, type Peticion } from './_http.ts';
import { opinar } from './_servicio.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const datos = cuerpo(peticion);
  const lectura = leerCodigo(texto(datos, 'codigo', 20), PILOTO.codigoAliado);
  if (!lectura.valido) {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion } };
  }
  const satisfaccion = numero(datos, 'satisfaccion');
  const resultado = await opinar({
    codigo: lectura.codigo,
    satisfaccion: Number.isFinite(satisfaccion) ? satisfaccion : undefined,
    comentario: texto(datos, 'comentario', 500),
    incidencia: datos.incidencia === true,
  });
  return { estado: resultado.ok ? 200 : 404, cuerpo: resultado };
});
