/* POST /api/redimir — el local confirma el consumo.

   ============================================================
   ESTE ES EL ENDPOINT QUE MUEVE DINERO
   ============================================================

   Declarar una venta genera una comision que La Triada le debe a
   Atheron y un credito que Atheron le debe al cliente. Por eso exige
   CREDENCIAL DE OPERADOR del aliado, y no basta con conocer el
   codigo del cliente: un codigo identifica una visita, no autoriza a
   mover dinero. Esa confusion era el primer bloqueador de la
   auditoria.

   Con {cerrar: true} se cierra sin consumo, que tambien es un
   desenlace valido y tambien es del operador: cerrar la visita de
   otro seria borrarle su beneficio.

   Idempotente: repetir la misma peticion devuelve la primera
   respuesta con yaRedimida en true, no un error ni una segunda
   comision. Eso es lo que hace seguro reintentar cuando se cae la
   conexion a mitad. */
import { maneja, cuerpo, DEMASIADAS, type Peticion } from './_http.ts';
import { redimir, cerrar } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { credencialDe, esOperador, pasaLimite, quienLlama } from './_autorizacion.ts';
import { leerCodigo } from '../src/data/codigos-referido.ts';
import { PILOTO } from '../src/data/piloto-la-triada.ts';

export default maneja('POST', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!(await pasaLimite(deposito, 'redimir', quien))) return DEMASIADAS;

  const credencial = credencialDe(peticion.headers);
  if (!esOperador(credencial, PILOTO.slugAliado)) {
    /* Los intentos con credencial equivocada tienen su propio
       contador, mucho mas corto: es lo que usa quien prueba a
       adivinarla. Y se cuentan aunque la respuesta sea la misma. */
    await pasaLimite(deposito, 'credencial', quien);
    return {
      estado: 401,
      cuerpo: {
        ok: false,
        motivo: 'NO_AUTORIZADO',
        explicacion: 'Esta pantalla es del personal de La Triada. Hace falta la credencial del local.',
      },
    };
  }

  const datos = cuerpo(peticion);
  const lectura = leerCodigo(typeof datos.codigo === 'string' ? datos.codigo : '', PILOTO.codigoAliado);
  if (!lectura.valido) {
    return { estado: 400, cuerpo: { ok: false, motivo: 'CODIGO_INVALIDO', explicacion: lectura.explicacion } };
  }

  if (datos.cerrar === true) {
    const cerrada = await cerrar(lectura.codigo, deposito);
    return { estado: cerrada.ok ? 200 : 409, cuerpo: cerrada };
  }

  const resultado = await redimir(
    { codigo: lectura.codigo, consumo: datos.consumo, personas: datos.personas, nota: datos.nota },
    deposito,
  );

  /* 404 si no existe, 400 si el dato esta mal, 409 si ya no se puede. */
  const estado = resultado.ok
    ? 200
    : resultado.motivo === 'NO_EXISTE'
      ? 404
      : resultado.motivo === 'CONSUMO_INVALIDO' || resultado.motivo === 'PERSONAS_INVALIDAS'
        ? 400
        : 409;
  return { estado, cuerpo: resultado };
});
