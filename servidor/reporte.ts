/* GET /api/reporte?fecha=AAAA-MM-DD — el informe semanal del aliado.

   Lleva cifras de negocio, asi que NO es publico: exige el token de
   administracion, por la misma politica de autenticacion que el
   resto. Sin token configurado no se sirve, nunca "abierto mientras
   tanto".

   LA FECHA INVALIDA ES UN 400, NO LA SEMANA DE HOY. Sustituirla en
   silencio devolveria un informe correcto de OTRA semana, y quien lo
   mire no tiene forma de saberlo: firmaria una liquidacion que no es
   la que pidio. */
import { maneja, parametros, DEMASIADAS, type Peticion } from './_http.ts';
import { informe, hoyColombiano } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { autoriza, pasaLimite, quienLlama, RESPUESTA_AUTORIZACION } from './_autorizacion.ts';
import { fechaIso } from '../src/data/validacion.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!(await pasaLimite(deposito, 'reporte', quien))) return DEMASIADAS;

  const veredicto = await autoriza(deposito, peticion.headers, 'ADMIN', '');
  if (veredicto !== 'OK') return RESPUESTA_AUTORIZACION[veredicto];

  const pedida = parametros(peticion).get('fecha');
  if (pedida === null) return { cuerpo: await informe(hoyColombiano(), deposito) };

  const fecha = fechaIso(pedida);
  if (fecha.valor === undefined) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        motivo: 'FECHA_INVALIDA',
        explicacion: 'La fecha se escribe AAAA-MM-DD y tiene que existir en el calendario.',
      },
    };
  }
  return { cuerpo: await informe(fecha.valor, deposito) };
});
