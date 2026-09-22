/* POST /api/seguimiento — "¿Como te fue en La Triada?"

   Solo sobre una visita que consta redimida. No se manda ningun
   mensaje desde aqui: esto recoge la respuesta, no la provoca.

   FUSIONA, NO REEMPLAZA. Una segunda peticion vacia no borra lo que
   el cliente escribio antes: la auditoria encontro justo eso, y el
   dano no es tecnico -es una queja que desaparece sin que nadie lo
   sepa-. */
import { maneja, cuerpo, DEMASIADAS, type Peticion } from './_http.ts';
import { opinar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { pasaLimite, quienLlama } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const deposito = almacen();
  if (!(await pasaLimite(deposito, 'seguimiento', quienLlama(peticion.headers)))) return DEMASIADAS;

  const datos = cuerpo(peticion);
  const lectura = leerCodigo(typeof datos.codigo === 'string' ? datos.codigo : '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion } };
  }

  const resultado = await opinar(
    {
      codigo: lectura.codigo,
      satisfaccion: datos.satisfaccion,
      comentario: datos.comentario,
      incidencia: datos.incidencia === true,
    },
    deposito,
  );
  return { estado: resultado.ok ? 200 : 404, cuerpo: resultado };
});
