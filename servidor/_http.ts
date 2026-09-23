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

import { RespuestaInvalida, SinAlmacen } from './_almacen.ts';
import { objetoPlano } from '../src/data/validacion.ts';
import { registra } from './_servicio.ts';

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

/**
 * El cuerpo como objeto plano. Vercel ya lo analiza; si llega en
 * texto, se analiza aqui. Un array o un numero tambien son JSON
 * valido y ninguno es un cuerpo de peticion: se descartan, igual que
 * las claves que ensucian el prototipo.
 */
export function cuerpo(peticion: Peticion): Record<string, unknown> {
  const crudo = peticion.body;
  if (typeof crudo === 'string') {
    try {
      return objetoPlano(JSON.parse(crudo));
    } catch {
      return objetoPlano(null);
    }
  }
  return objetoPlano(crudo);
}

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
      if (error instanceof RespuestaInvalida) {
        /* El almacen contesto algo que no se puede tratar como exito.
           503 y no 500: no es un fallo del codigo, es que el registro
           no consta, y quien llama tiene que poder reintentar. */
        registra('hablar con el almacén', error);
        contestacion.status(503).json({ ok: false, motivo: 'ALMACEN_INCIERTO' });
        return;
      }
      /* Nunca el error entero: los registros se leen, se exportan y a
         veces se reenvian. Solo el sitio y el tipo. */
      registra('atender la petición', error);
      contestacion.status(500).json({ ok: false, motivo: 'ERROR' });
    }
  };
}

/* ------------------------------------------------------------
   LIMITE DE ABUSO

   Se comprueba en el endpoint, no aqui, porque cada uno tiene su
   ventana y porque necesita el almacen. Lo que si vive aqui es la
   respuesta, para que sea igual en todos.
   ------------------------------------------------------------ */
export const DEMASIADAS = {
  estado: 429,
  cuerpo: {
    ok: false,
    motivo: 'DEMASIADAS_PETICIONES',
    explicacion: 'Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
  },
} as const;
