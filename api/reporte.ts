/* GET /api/reporte?fecha=AAAA-MM-DD — el informe semanal del aliado.
   Lleva cifras de negocio, asi que NO es publico: exige el token de
   administracion. Sin token configurado no se sirve, nunca "abierto
   mientras tanto". */
import { maneja, parametros, autorizado, type Peticion } from './_http.ts';
import { informe, hoyColombiano } from './_servicio.ts';

export default maneja('GET', async (peticion: Peticion) => {
  if (!autorizado(peticion)) {
    return { estado: 401, cuerpo: { ok: false, motivo: 'NO_AUTORIZADO' } };
  }
  const pedida = parametros(peticion).get('fecha') ?? '';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoyColombiano();
  return { cuerpo: await informe(fecha) };
});
