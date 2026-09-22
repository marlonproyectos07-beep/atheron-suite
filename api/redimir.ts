/* POST /api/redimir — el local confirma el consumo.

   ESTE ES EL ENDPOINT QUE MUEVE DINERO

   Declarar una venta genera una comision que La Triada le debe a
   Atheron y un credito que Atheron le debe al cliente. Por eso exige
   CREDENCIAL DE OPERADOR del aliado: conocer el codigo del cliente
   -que es publico para cualquiera que vea su movil- no autoriza.

   Con {cerrar: true} se cierra sin consumo, que tambien es del
   operador: cerrar la visita de otro seria borrarle su beneficio.

   Idempotente: repetir la misma peticion devuelve la primera
   respuesta con yaRedimida en true, no un error ni una segunda
   comision.

   VALIDACION SIN CONVERSIONES. El consumo tiene que ser un numero
   entero de pesos. Ni "100000", ni true, ni [100000]. Si un campo
   opcional viene y no vale, se responde 400: descartarlo en silencio
   es registrar una venta distinta de la que el local declaro. */
import { maneja, cuerpo, DEMASIADAS, type Peticion } from './_http.ts';
import { redimir, cerrar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { autoriza, pasaLimite, quienLlama, RESPUESTA_AUTORIZACION } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';
import { EXPLICACION_RECHAZO, MAX_CONSUMO, MAX_PERSONAS } from '../src/data/transacciones-red.ts';
import { entero, pesosEnteros, texto } from '../src/data/validacion.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!(await pasaLimite(deposito, 'redimir', quien))) return DEMASIADAS;

  const veredicto = await autoriza(deposito, peticion.headers, 'OPERADOR', PILOTO.slugAliado);
  if (veredicto !== 'OK') return RESPUESTA_AUTORIZACION[veredicto];

  const datos = cuerpo(peticion);
  const lectura = leerCodigo(typeof datos.codigo === 'string' ? datos.codigo : '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion } };
  }

  if (datos.cerrar === true) {
    const cerrada = await cerrar(lectura.codigo, deposito);
    return { estado: cerrada.ok ? 200 : 409, cuerpo: cerrada };
  }

  /* Se valida AQUI, en la frontera, y se responde 400 con el motivo.
     El servicio vuelve a validar por su cuenta: una validacion que
     solo vive en la frontera no protege a quien llame por dentro. */
  const consumo = pesosEnteros(datos.consumo, MAX_CONSUMO);
  if (consumo.valor === undefined) {
    return {
      estado: 400,
      cuerpo: { ok: false, motivo: 'CONSUMO_INVALIDO', explicacion: EXPLICACION_RECHAZO.CONSUMO_INVALIDO },
    };
  }

  let personas: number | undefined;
  if (datos.personas !== undefined && datos.personas !== null) {
    const leidas = entero(datos.personas, 1, MAX_PERSONAS);
    if (leidas.valor === undefined) {
      return {
        estado: 400,
        cuerpo: { ok: false, motivo: 'PERSONAS_INVALIDAS', explicacion: EXPLICACION_RECHAZO.PERSONAS_INVALIDAS },
      };
    }
    personas = leidas.valor;
  }

  if (datos.nota !== undefined && datos.nota !== null && texto(datos.nota, 200).fallo === 'TIPO') {
    return { estado: 400, cuerpo: { ok: false, motivo: 'NOTA_INVALIDA', explicacion: 'La nota tiene que ser texto.' } };
  }

  const resultado = await redimir(
    { codigo: lectura.codigo, consumo: consumo.valor, personas, nota: datos.nota },
    deposito,
  );

  const estado = resultado.ok
    ? 200
    : resultado.motivo === 'NO_EXISTE'
      ? 404
      : resultado.motivo === 'CONSUMO_INVALIDO' || resultado.motivo === 'PERSONAS_INVALIDAS'
        ? 400
        : 409;
  return { estado, cuerpo: resultado };
});
