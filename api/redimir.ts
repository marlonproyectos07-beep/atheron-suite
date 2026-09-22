/* POST /api/redimir — el local confirma el consumo.
   Idempotente: repetir la misma peticion devuelve la primera
   respuesta con yaRedimida en true, no un error. Eso es lo que hace
   seguro reintentar cuando se cae la conexion a mitad.
   Con {cerrar: true} se cierra sin consumo, que tambien es un
   desenlace valido y hay que poder registrarlo. */
import { maneja, cuerpo, texto, numero, type Peticion } from './_http.ts';
import { redimir, cerrar } from './_servicio.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const datos = cuerpo(peticion);
  const lectura = leerCodigo(texto(datos, 'codigo', 20), PILOTO.codigoAliado);
  if (!lectura.valido) {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion } };
  }

  if (datos.cerrar === true) {
    const cerrada = await cerrar(lectura.codigo);
    return { estado: cerrada.ok ? 200 : 409, cuerpo: cerrada };
  }

  const personas = numero(datos, 'personas');
  const resultado = await redimir({
    codigo: lectura.codigo,
    consumo: numero(datos, 'consumo'),
    personas: Number.isFinite(personas) ? personas : undefined,
    nota: texto(datos, 'nota', 200),
  });

  /* 404 si no existe, 409 si ya no se puede, 400 si el dato esta mal. */
  const estado = resultado.ok
    ? 200
    : resultado.motivo === 'NO_EXISTE'
      ? 404
      : resultado.motivo === 'CONSUMO_INVALIDO' || resultado.motivo === 'PERSONAS_INVALIDAS'
        ? 400
        : 409;
  return { estado, cuerpo: resultado };
});
