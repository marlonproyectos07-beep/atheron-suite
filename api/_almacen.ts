/* ============================================================
   ALMACEN DE LA RED — el backend transaccional de ATH-LOOP-002

   POR QUE EXISTE

   El piloto tecnico (ATH-PILOT-001) guardaba el estado en el
   navegador. Eso permitio probar el recorrido, pero tiene tres
   agujeros que ningun diseno de pantalla arregla:

     - el movil del cliente y el del local no se ven entre si;
     - borrar los datos del navegador borra la redencion;
     - nada impide redimir dos veces desde dos aparatos.

   La orden ATH-LOOP-002 pide exactamente lo contrario: registro
   transaccional, idempotencia y nada de copiar a mano. Eso necesita
   servidor, y esto es el servidor.

   ============================================================
   DONDE CORRE
   ============================================================

   Son funciones serverless en la carpeta /api, que es lo que Vercel
   ejecuta para cualquier framework que no sea Next. El sitio sigue
   siendo estatico: no se ha metido ningun adaptador de Astro ni se
   ha cambiado el modo de construccion, asi que las 38 paginas de hoy
   se siguen generando igual y ninguna se vuelve dinamica.

   ============================================================
   DONDE GUARDA, Y QUE PASA SI NO HAY DONDE
   ============================================================

   En un Redis por HTTP (Vercel KV o Upstash, que es el mismo
   protocolo), con dos variables de entorno:

     KV_REST_API_URL
     KV_REST_API_TOKEN

   SI NO ESTAN, LA API NO FUNCIONA Y LO DICE: 503 y un codigo de
   error claro. NO hay modo "memoria" en produccion, y es
   deliberado: en serverless cada peticion puede tocar una instancia
   distinta, asi que un almacen en memoria daria la impresion de
   guardar y perderia una redencion de cada dos. Un backend que
   pierde datos en silencio es peor que no tener backend, porque
   nadie deja de confiar en el a tiempo.

   Para las pruebas hay un almacen en memoria explicito, que se
   inyecta a mano (ver abajo) y nunca se activa solo.

   ============================================================
   LO QUE ESTE ARCHIVO NO HACE
   ============================================================

   No habla con Odoo. No hay integracion, ni credenciales, ni se ha
   supuesto ninguna: el mapeo campo a campo esta en
   docs/piloto-la-triada.md y la importacion sigue siendo una
   decision de direccion.
   ============================================================ */

import type { Transaccion } from '../src/data/transacciones-red.ts';

export interface Almacen {
  /** Guarda solo si no existia. false = ese codigo ya estaba. */
  crea(t: Transaccion): Promise<boolean>;
  lee(codigo: string): Promise<Transaccion | null>;
  /** Sobrescribe. Solo para transacciones que ya existen. */
  guarda(t: Transaccion): Promise<void>;
  /** Todas las de un dia (AAAA-MM-DD en hora de Colombia). */
  delDia(dia: string): Promise<Transaccion[]>;
  /** Cerrojo de un solo uso, para que dos redenciones a la vez no se pisen. */
  cierra(clave: string, segundos: number): Promise<boolean>;
}

export class SinAlmacen extends Error {
  readonly codigo = 'ALMACEN_NO_CONFIGURADO';
  constructor() {
    super(
      'Faltan KV_REST_API_URL y KV_REST_API_TOKEN. La API no guarda nada hasta que ' +
        'dirección autorice y configure el almacén.',
    );
  }
}

/* ------------------------------------------------------------
   REDIS POR HTTP
   ------------------------------------------------------------ */
const CLAVE_TX = (codigo: string) => `ath:tx:${codigo}`;
const CLAVE_DIA = (dia: string) => `ath:dia:${dia}`;

/* Los codigos caducan el mismo dia, pero la transaccion hay que
   conservarla para conciliar y para el informe. Un ano cubre
   cualquier cierre contable y evita que el almacen crezca para
   siempre sin que nadie lo mire. */
const RETENCION_SEGUNDOS = 400 * 24 * 60 * 60;

class RedisHttp implements Almacen {
  /* Sin propiedades de parametro: Node ejecuta estos modulos
     quitando los tipos y nada mas, y esa azucar del constructor
     genera codigo, no solo tipos. */
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async manda<T>(...orden: (string | number)[]): Promise<T> {
    const respuesta = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(orden.map(String)),
    });
    if (!respuesta.ok) {
      throw new Error(`El almacén respondió ${respuesta.status}.`);
    }
    const cuerpo = (await respuesta.json()) as { result?: T; error?: string };
    if (cuerpo.error) throw new Error(`El almacén rechazó la orden: ${cuerpo.error}`);
    return cuerpo.result as T;
  }

  async crea(t: Transaccion): Promise<boolean> {
    const puesto = await this.manda<string | null>(
      'SET',
      CLAVE_TX(t.codigo),
      JSON.stringify(t),
      'NX',
      'EX',
      RETENCION_SEGUNDOS,
    );
    if (puesto === null) return false;
    /* El indice por dia es lo que permite sacar el informe sin
       recorrer el almacen entero. Se indexa por el dia de
       ACTIVACION; el informe ya sabe que lo que factura es la
       redencion, y busca en los dias que le interesan. */
    await this.manda('SADD', CLAVE_DIA(t.activadoEn.slice(0, 10)), t.codigo);
    await this.manda('EXPIRE', CLAVE_DIA(t.activadoEn.slice(0, 10)), RETENCION_SEGUNDOS);
    return true;
  }

  async lee(codigo: string): Promise<Transaccion | null> {
    const crudo = await this.manda<string | null>('GET', CLAVE_TX(codigo));
    if (!crudo) return null;
    try {
      return JSON.parse(crudo) as Transaccion;
    } catch {
      /* Un registro ilegible no se borra ni se ignora en silencio:
         se trata como error para que alguien lo mire. */
      throw new Error(`La transacción ${codigo} está guardada en un formato ilegible.`);
    }
  }

  async guarda(t: Transaccion): Promise<void> {
    await this.manda('SET', CLAVE_TX(t.codigo), JSON.stringify(t), 'EX', RETENCION_SEGUNDOS);
  }

  async delDia(dia: string): Promise<Transaccion[]> {
    const codigos = await this.manda<string[]>('SMEMBERS', CLAVE_DIA(dia));
    if (!codigos?.length) return [];
    const crudos = await this.manda<(string | null)[]>('MGET', ...codigos.map(CLAVE_TX));
    return crudos
      .filter((c): c is string => Boolean(c))
      .map((c) => JSON.parse(c) as Transaccion);
  }

  async cierra(clave: string, segundos: number): Promise<boolean> {
    const puesto = await this.manda<string | null>('SET', `ath:lock:${clave}`, '1', 'NX', 'EX', segundos);
    return puesto !== null;
  }
}

/* ------------------------------------------------------------
   ALMACEN EN MEMORIA — SOLO PARA PRUEBAS

   No se activa solo nunca: las pruebas se lo pasan a mano a cada
   funcion del servicio. El nombre lo dice por si acaso, para que
   nadie lo confunda con el de verdad.
   ------------------------------------------------------------ */
export class AlmacenDePrueba implements Almacen {
  private readonly datos = new Map<string, Transaccion>();
  private readonly cerrojos = new Set<string>();

  async crea(t: Transaccion): Promise<boolean> {
    if (this.datos.has(t.codigo)) return false;
    this.datos.set(t.codigo, structuredClone(t));
    return true;
  }
  async lee(codigo: string): Promise<Transaccion | null> {
    const t = this.datos.get(codigo);
    return t ? structuredClone(t) : null;
  }
  async guarda(t: Transaccion): Promise<void> {
    this.datos.set(t.codigo, structuredClone(t));
  }
  async delDia(dia: string): Promise<Transaccion[]> {
    return [...this.datos.values()].filter((t) => t.activadoEn.startsWith(dia));
  }
  async cierra(clave: string): Promise<boolean> {
    if (this.cerrojos.has(clave)) return false;
    this.cerrojos.add(clave);
    return true;
  }
  /** Todo lo guardado. Solo lo usan las pruebas. */
  todo(): Transaccion[] {
    return [...this.datos.values()];
  }
}

export function almacen(): Almacen {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new SinAlmacen();
  return new RedisHttp(url, token);
}
