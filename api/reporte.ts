/* GET /api/reporte?fecha=AAAA-MM-DD — el informe semanal del aliado.

   Lleva cifras de negocio, asi que NO es publico: exige el token de
   administracion, que se compara contra su SHA-256 y en tiempo
   constante. Sin token configurado no se sirve, nunca "abierto
   mientras tanto". */
import { maneja, parametros, DEMASIADAS, type Peticion } from './_http.ts';
import { informe, hoyColombiano } from './_servicio.ts';
import { almacen } from './_almacen.ts';
import { credencialDe, esAdmin, pasaLimite, quienLlama } from './_autorizacion.ts';
import { fechaIso } from '../src/data/validacion.ts';

export default maneja('GET', async (peticion: Peticion) => {
  const deposito = almacen();
  const quien = quienLlama(peticion.headers);
  if (!(await pasaLimite(deposito, 'reporte', quien))) return DEMASIADAS;

  if (!esAdmin(credencialDe(peticion.headers))) {
    await pasaLimite(deposito, 'credencial', quien);
    return { estado: 401, cuerpo: { ok: false, motivo: 'NO_AUTORIZADO' } };
  }

  /* Que encaje con AAAA-MM-DD no basta: "2026-02-31" encaja y no
     existe. fechaIso lo reconstruye para comprobar que el dia es
     real. Sin fecha valida, la semana de hoy. */
  const pedida = fechaIso(parametros(peticion).get('fecha'));
  return { cuerpo: await informe(pedida.valor ?? hoyColombiano(), deposito) };
});
