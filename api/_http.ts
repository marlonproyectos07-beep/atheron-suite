/* ============================================================
   ENVOLTORIO HTTP — lo unico que saben de HTTP los endpoints

   Cada archivo de /api queda en diez lineas: declara que metodo
   acepta y llama al servicio. Todo lo demas -leer el cuerpo, los
   codigos de estado, el error que no debe filtrar nada- esta aqui,
   una vez.

   TRES COSAS QUE SE DECIDEN AQUI Y NO EN CADA ENDPOINT

   1. NO SE CACHEA NADA. Una respuesta de esta API cacheada por un
      intermediario es una redencion que se ve "pendiente" cuando ya
      esta hecha, o al reves. Con Cache-Control: no-store no hay
      forma de que ocurra.

   2. LOS ERRORES NO CUENTAN DE MAS. Si algo se rompe por dentro, la
      respuesta dice "error" y punto: el mensaje real va al registro
      del servidor. Un fallo de base de datos con su texto entero
      dentro de un JSON publico es un mapa del sistema para quien
      quiera mirarlo.

   3. FALTA DE ALMACEN = 503, NO 500. No es un fallo: es que todavia
      no se ha autorizado y configurado el backend. Se distingue para
      que la pantalla pueda decir exactamente eso.
   ============================================================ */

import { SinAlmacen } from './_almacen.ts';

/* Tipos minimos de la peticion y la respuesta de Vercel. Se
   declaran aqui para no anadir @vercel/node solo por los tipos: en
   ejecucion no hace falta, y una dependencia menos es una menos que
   auditar. */
export interface Peticion {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface Contestacion {
  status(codigo: number): Contestacion;
  setHeader(nombre: string, valor: string): void;
  json(cuerpo: unknown): void;
}

export const parametros = (peticion: Peticion): URLSearchParams =>
  new URL(peticion.url ?? '/', 'http://local').searchParams;

/** El cuerpo como objeto. Vercel ya lo analiza; si llega en texto, se analiza aqui. */
export function cuerpo(peticion: Peticion): Record<string, unknown> {
  const crudo = peticion.body;
  if (!crudo) return {};
  if (typeof crudo === 'object') return crudo as Record<string, unknown>;
  if (typeof crudo === 'string') {
    try {
      const analizado: unknown = JSON.parse(crudo);
      return analizado && typeof analizado === 'object' ? (analizado as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Texto de un campo, recortado. Nunca devuelve undefined por sorpresa. */
export const texto = (datos: Record<string, unknown>, campo: string, max = 200): string =>
  typeof datos[campo] === 'string' ? (datos[campo] as string).trim().slice(0, max) : '';

export const numero = (datos: Record<string, unknown>, campo: string): number => Number(datos[campo]);

/**
 * Envuelve un endpoint: comprueba el metodo, no cachea, y traduce
 * cualquier excepcion a una respuesta que no cuenta de mas.
 */
export function maneja(
  metodo: 'GET' | 'POST',
  accion: (peticion: Peticion) => Promise<{ estado?: number; cuerpo: unknown }>,
) {
  return async (peticion: Peticion, contestacion: Contestacion): Promise<void> => {
    contestacion.setHeader('cache-control', 'no-store');
    contestacion.setHeader('content-type', 'application/json; charset=utf-8');

    if (peticion.method !== metodo) {
      contestacion.setHeader('allow', metodo);
      contestacion.status(405).json({ ok: false, motivo: 'METODO_NO_PERMITIDO' });
      return;
    }

    try {
      const { estado = 200, cuerpo: salida } = await accion(peticion);
      contestacion.status(estado).json(salida);
    } catch (error) {
      if (error instanceof SinAlmacen) {
        contestacion.status(503).json({ ok: false, motivo: error.codigo, explicacion: error.message });
        return;
      }
      console.error('[atheron/api]', error);
      contestacion.status(500).json({ ok: false, motivo: 'ERROR' });
    }
  };
}

/* ------------------------------------------------------------
   AUTORIZACION DEL INFORME

   El informe lleva cifras de negocio del aliado, asi que no es
   publico. Se protege con un token en cabecera, comparado en tiempo
   constante: comparar cadenas con === filtra por cuanto tarda, y
   aunque aqui el riesgo sea pequeno, hacerlo bien cuesta cinco
   lineas.

   Si no hay token configurado, el informe NO se sirve. Nunca "abierto
   porque no se ha configurado": eso es como acaban abiertos.
   ------------------------------------------------------------ */
export function autorizado(peticion: Peticion): boolean {
  const esperado = process.env.ATHERON_TOKEN_ADMIN;
  if (!esperado) return false;

  const cabecera = peticion.headers.authorization;
  const recibido = (Array.isArray(cabecera) ? cabecera[0] : cabecera ?? '').replace(/^Bearer\s+/i, '');
  if (recibido.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
