/* GET /api/transaccion?c=ATH-TRI-XXXXX — el estado de una visita.

   DOS VISTAS, SEGUN QUIEN PREGUNTE

   Con el codigo a secas se devuelve la VISTA DEL CLIENTE: su estado,
   su consumo y su credito. Con credencial de operador del aliado se
   devuelve ademas lo que el local necesita para atender: personas,
   fuente y la comision que le corresponde a Atheron.

   Tener el codigo NO da el papel de operador. Esa era exactamente la
   confusion que encontro la auditoria. */
import { maneja, parametros, DEMASIADAS, type Peticion } from './_http.ts';
import { consultar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { credencialDe, esOperador, pasaLimite, quienLlama } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';
import { EXPLICACION_RECHAZO } from '../src/data/transacciones-red.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  if (!(await pasaLimite(deposito, 'transaccion', quienLlama(peticion.headers)))) return DEMASIADAS;

  const lectura = leerCodigo(parametros(peticion).get('c') ?? '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        motivo: 'CODIGO_INVALIDO',
        explicacion: lectura.explicacion ?? EXPLICACION_RECHAZO.CODIGO_INVALIDO,
      },
    };
  }

  const operador = esOperador(credencialDe(peticion.headers), PILOTO.slugAliado);
  const resultado = await consultar(lectura.codigo, deposito, { operador });
  return { estado: resultado.ok ? 200 : 404, cuerpo: { ...resultado, operador } };
});
