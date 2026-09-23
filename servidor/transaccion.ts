/* GET /api/transaccion?c=ATH-TRI-XXXXX — el estado de una visita.

   DOS VISTAS, SEGUN QUIEN PREGUNTE

   Con el codigo a secas se devuelve la VISTA DEL CLIENTE: su estado,
   su consumo y cuanto credito genero. Con credencial de operador se
   devuelve lo que el local necesita para atender: personas, fuente y
   la comision que le corresponde a Atheron.

   Tener el codigo NO da el papel de operador.

   Y si viene una credencial, TIENE que valer. Antes, una credencial
   equivocada se ignoraba y se devolvia la vista del cliente: eso
   convertia este endpoint en un sitio comodo para probar
   credenciales sin que nadie llevara la cuenta. Ahora pasa por la
   misma politica que los demas. */
import { maneja, parametros, DEMASIADAS, type Peticion } from './_http.ts';
import { consultar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { autoriza, credencialDe, pasaLimite, quienLlama, RESPUESTA_AUTORIZACION } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';
import { EXPLICACION_RECHAZO } from '../src/data/transacciones-red.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  if (!(await pasaLimite(deposito, 'transaccion', quienLlama(peticion.headers)))) return DEMASIADAS;

  /* Sin cabecera, consulta de cliente. Con cabecera, se exige que
     sea valida: no hay degradacion silenciosa. */
  let operador = false;
  if (credencialDe(peticion.headers).tipo !== 'AUSENTE') {
    const veredicto = await autoriza(deposito, peticion.headers, 'OPERADOR', PILOTO.slugAliado);
    if (veredicto !== 'OK') return RESPUESTA_AUTORIZACION[veredicto];
    operador = true;
  }

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

  const resultado = await consultar(lectura.codigo, deposito, { operador });
  return { estado: resultado.ok ? 200 : 404, cuerpo: { ...resultado, operador } };
});
