/* ============================================================
   ALMACEN DE LA RED — reescrito tras la auditoria independiente

   QUE ENCONTRO LA AUDITORIA, Y QUE SE HIZO CON CADA COSA

   1. "Lectura antes del cerrojo, sin revalidar despues." Cierto.
      Se leia, se decidia y luego se pedia un cerrojo: entre lo uno
      y lo otro cabia otra peticion entera.

   2. "Cerrojo sin propietario, y escritura despues de que venza."
      Tambien cierto. Un cerrojo de 30 segundos que nadie libera y
      que cualquiera puede pisar no protege nada; solo hace que el
      fallo sea mas dificil de reproducir.

   3. "Transaccion, indice y TTL son operaciones independientes."
      Cierto: si la segunda fallaba, quedaba una transaccion que el
      informe no veia nunca.

   4. "Un 200 con {} se aceptaba como escritura correcta." Cierto, y
      es el peor de los cuatro: el sistema creia haber guardado.

   EL CERROJO NO SE ARREGLO: SE QUITO

   Un cerrojo distribuido bien hecho necesita propietario, renovacion
   y liberacion segura, y aun asi deja huecos cuando el proceso se
   para entre el vencimiento y la escritura. Para lo que hace falta
   aqui -mover una transaccion de un estado a otro- hay algo mas
   simple y estrictamente mas fuerte: COMPARE-AND-SET sobre un numero
   de version, ejecutado DENTRO del servidor.

   Cada registro lleva "version". Para cambiarlo se manda la version
   que se leyo y la nueva; el servidor compara y escribe en la misma
   operacion. Si otro llego antes, la version ya no coincide y la
   respuesta es CONFLICTO. No hay ventana: no existe el intervalo
   entre "leo" y "escribo" porque la comparacion pasa en el servidor.

   LA ATOMICIDAD ES DEL SERVIDOR, NO DE ESTE ARCHIVO

   Cada operacion que escribe es UN solo EVAL: un script que Redis
   ejecuta entero, sin que ninguna otra orden se meta en medio. No
   hay dos viajes, no hay "leer y luego escribir", y no se simula
   nada que el proveedor no ofrezca. Redis garantiza la ejecucion
   atomica de EVAL, y eso es exactamente lo que se usa.

   Las pruebas lo ejecutan contra un Redis DE VERDAD
   (scripts/prueba-almacen-real.mts), no contra una imitacion.

   ============================================================
   DONDE GUARDA
   ============================================================

   Redis por HTTP (Vercel KV o Upstash, mismo protocolo):

     KV_REST_API_URL
     KV_REST_API_TOKEN

   Si faltan, la API responde 503. No hay modo "memoria" en
   produccion: en serverless cada peticion puede tocar una instancia
   distinta, asi que perderia una redencion de cada dos.
   ============================================================ */

/** Todo lo que se guarda lleva identidad y version. */
export interface Registro {
  id: string;
  version: number;
}

export type ResultadoCambio = 'OK' | 'CONFLICTO' | 'NO_EXISTE' | 'ILEGIBLE' | 'INCONSISTENTE';

export interface Almacen {
  /**
   * Crea si no existe, y mete el id en sus indices. Todo o nada.
   * @returns false si ese id ya estaba.
   */
  crea(ns: string, registro: Registro, indices?: string[]): Promise<boolean>;

  lee<T extends Registro>(ns: string, id: string): Promise<T | null>;

  /**
   * Compare-and-set. Escribe solo si la version guardada es
   * `registro.version - 1`, e incluye el id en `indices` en la misma
   * operacion atomica.
   */
  cambia(ns: string, registro: Registro, indices?: string[]): Promise<ResultadoCambio>;

  /** Los ids de un indice. */
  indice(nombre: string): Promise<string[]>;

  /**
   * Lee varios. Devuelve tambien los que el indice nombraba y no
   * estan: una lectura parcial no puede parecer una lectura completa.
   */
  leeVarios<T extends Registro>(ns: string, ids: string[]): Promise<{ encontrados: T[]; faltantes: string[] }>;

  /** Contador con ventana, para limitar abuso. Devuelve el conteo tras sumar 1. */
  contador(clave: string, ventanaSegundos: number): Promise<number>;

  /** Lee un contador SIN sumarle nada. 0 si no existe. */
  cuenta(clave: string): Promise<number>;

  /**
   * Todos los ids guardados de un tipo, recorriendo el almacen.
   *
   * Existe por un hallazgo de la reauditoria: mirando solo los
   * indices es IMPOSIBLE ver una transaccion a la que ningun indice
   * apunta, y eso es justo lo que pasa cuando una escritura se queda
   * a medias. Hay que poder mirar desde el otro lado.
   *
   * Devuelve "truncado" si hubo que parar: un recuento que se
   * quedo corto no puede presentarse como completo.
   */
  escanea(ns: string, limite?: number): Promise<{ ids: string[]; truncado: boolean }>;

  /** Segundos que le quedan a un registro. -1 sin caducidad, -2 si no está. */
  vida(ns: string, id: string): Promise<number>;

  /** Lo mismo para un índice. La conciliación compara los dos. */
  vidaIndice(nombre: string): Promise<number>;
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

/** El almacen contesto algo que no se puede tratar como exito. */
export class RespuestaInvalida extends Error {
  readonly codigo = 'ALMACEN_RESPUESTA_INVALIDA';
}

/* Un ano y pico: cubre cualquier cierre contable y evita que el
   almacen crezca para siempre sin que nadie lo mire. El mismo valor
   para el registro y para sus indices, en la misma operacion: si
   caducaran por separado, el indice apuntaria a la nada. */
export const RETENCION_SEGUNDOS = 400 * 24 * 60 * 60;

const clave = (ns: string, id: string): string => `ath:${ns}:${id}`;

/* ------------------------------------------------------------
   LOS DOS SCRIPTS

   Estan escritos para leerse: cada uno hace una cosa y devuelve un
   numero que dice exactamente que paso.
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   POR QUE LOS SCRIPTS COMPRUEBAN ANTES DE TOCAR NADA

   La reauditoria encontro el fallo de la version anterior, y es un
   fallo de concepto, no de codigo: EVAL garantiza que nadie se mete
   EN MEDIO, pero NO deshace lo ya escrito si una orden posterior
   falla. Redis no tiene rollback dentro de un script.

   Lo reprodujo preparando un indice con el tipo equivocado -una
   cadena donde deberia haber un conjunto-: el script escribia el
   objeto, escribia el primer indice, y el SADD siguiente reventaba.
   Resultado: escritura a medias, con el registro cambiado y el
   indice sin el.

   La forma correcta con esta herramienta es no dejar que exista esa
   posibilidad: PRIMERO se comprueban los tipos de TODAS las claves
   que se van a tocar, y solo si todas admiten la operacion se
   empieza a escribir. A partir de ahi ninguna orden puede fallar:
   SET sobre una clave de tipo string o inexistente, SADD sobre set o
   inexistente, y EXPIRE, que nunca falla.

   Si algun tipo no encaja, el script devuelve -3 y NO ha escrito
   nada. Eso es lo que se puede demostrar, y es lo que se demuestra
   en scripts/prueba-almacen-real.mts.

   Codigos de vuelta, iguales en los dos scripts:
     1 hecho · 0 no se pudo (ya existia / version distinta)
    -1 no existe · -2 ilegible · -3 tipos inconsistentes
   ------------------------------------------------------------ */

/* Comprobacion de tipos compartida por los dos scripts. */
const LUA_TIPOS = `
local tipoReg = redis.call('TYPE', KEYS[1])['ok']
if tipoReg ~= 'none' and tipoReg ~= 'string' then return -3 end
for i = 2, #KEYS do
  local tipoIdx = redis.call('TYPE', KEYS[i])['ok']
  if tipoIdx ~= 'none' and tipoIdx ~= 'set' then return -3 end
end`;

/* KEYS[1] = registro. KEYS[2..] = indices.
   ARGV[1] = json, ARGV[2] = ttl, ARGV[3] = id. */
const LUA_CREA = `${LUA_TIPOS}
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) == false then return 0 end
for i = 2, #KEYS do
  redis.call('SADD', KEYS[i], ARGV[3])
  redis.call('EXPIRE', KEYS[i], ARGV[2])
end
return 1`;

/* KEYS[1] = registro. KEYS[2..] = indices a los que anadirlo.
   ARGV[1] = version esperada, ARGV[2] = json nuevo, ARGV[3] = ttl, ARGV[4] = id. */
const LUA_CAMBIA = `${LUA_TIPOS}
local actual = redis.call('GET', KEYS[1])
if not actual then return -1 end
local ok, dato = pcall(cjson.decode, actual)
if not ok or type(dato) ~= 'table' or dato.version == nil then return -2 end
if tostring(dato.version) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
for i = 2, #KEYS do
  redis.call('SADD', KEYS[i], ARGV[4])
  redis.call('EXPIRE', KEYS[i], ARGV[3])
end
return 1`;

/* KEYS[1] = contador. ARGV[1] = ventana en segundos. */
const LUA_CONTADOR = `
local tipo = redis.call('TYPE', KEYS[1])['ok']
if tipo ~= 'none' and tipo ~= 'string' then return -3 end
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

class RedisHttp implements Almacen {
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /* ------------------------------------------------------------
     LA UNICA PUERTA AL ALMACEN

     Aqui se valida la respuesta con severidad, que es el cuarto
     hallazgo de la auditoria: antes, un 200 con el cuerpo vacio
     pasaba por escritura correcta. Ahora, si el cuerpo no es un
     objeto con la propiedad "result", es un error y se trata como
     tal. "No se sabe si se guardo" NUNCA puede contarse como
     "guardado".
     ------------------------------------------------------------ */
  private async manda<T>(...orden: (string | number)[]): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(this.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(orden.map(String)),
      });
    } catch (error) {
      throw new RespuestaInvalida(`No se pudo hablar con el almacén: ${(error as Error).name}`);
    }

    if (!respuesta.ok) throw new RespuestaInvalida(`El almacén respondió ${respuesta.status}.`);

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      throw new RespuestaInvalida('El almacén respondió algo que no es JSON.');
    }

    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      throw new RespuestaInvalida('El almacén respondió un cuerpo que no es un objeto.');
    }
    const objeto = cuerpo as Record<string, unknown>;
    if (typeof objeto.error === 'string') {
      throw new RespuestaInvalida(`El almacén rechazó la orden: ${objeto.error}`);
    }
    if (!Object.hasOwn(objeto, 'result')) {
      /* El caso exacto que la auditoria coló: 200 y {}. */
      throw new RespuestaInvalida('El almacén respondió sin «result»: no consta que se guardara.');
    }
    return objeto.result as T;
  }

  /**
   * Un entero, y de los que este script puede devolver.
   *
   * Nada de Number(): la reauditoria comprobo que asi se colaban
   * true, ["1"] y "1" como exito. Number(true) es 1, Number(["1"])
   * es 1, y ese 1 significaba "escrito correctamente". Aqui el tipo
   * tiene que ser number, entero, y estar en la lista de codigos que
   * el script puede devolver; cualquier otra cosa es un almacen que
   * no se comporta, y eso no se convierte en una confirmacion
   * comercial.
   */
  private async evalua(
    script: string,
    claves: string[],
    argumentos: (string | number)[],
    esperado: (n: number) => boolean,
  ): Promise<number> {
    const salida = await this.manda<unknown>('EVAL', script, claves.length, ...claves, ...argumentos);
    if (typeof salida !== 'number' || !Number.isInteger(salida)) {
      throw new RespuestaInvalida(
        `El almacén devolvió ${describe(salida)} donde esperaba un código numérico.`,
      );
    }
    if (!esperado(salida)) {
      throw new RespuestaInvalida(`El almacén devolvió el código ${salida}, que este script no usa.`);
    }
    return salida;
  }

  async crea(ns: string, registro: Registro, indices: string[] = []): Promise<boolean> {
    const n = await this.evalua(
      LUA_CREA,
      [clave(ns, registro.id), ...indices.map((i) => clave('idx', i))],
      [JSON.stringify(registro), RETENCION_SEGUNDOS, registro.id],
      (n) => n === 1 || n === 0 || n === -3,
    );
    if (n === -3) {
      throw new RespuestaInvalida(
        `Los índices de ${ns}/${registro.id} tienen un tipo inesperado: no se escribió nada.`,
      );
    }
    return n === 1;
  }

  async lee<T extends Registro>(ns: string, id: string): Promise<T | null> {
    const crudo = await this.manda<unknown>('GET', clave(ns, id));
    /* GET solo puede contestar una cadena o nulo. true, 1 o una
       lista son un almacen que no se comporta. */
    if (crudo === null || crudo === undefined) return null;
    if (typeof crudo !== 'string') {
      throw new RespuestaInvalida(`El registro ${ns}/${id} vino como ${describe(crudo)}, no como texto.`);
    }
    return analiza<T>(crudo, `${ns}/${id}`);
  }

  async cambia(ns: string, registro: Registro, indices: string[] = []): Promise<ResultadoCambio> {
    const n = await this.evalua(
      LUA_CAMBIA,
      [clave(ns, registro.id), ...indices.map((i) => clave('idx', i))],
      [registro.version - 1, JSON.stringify(registro), RETENCION_SEGUNDOS, registro.id],
      (n) => n <= 1 && n >= -3,
    );
    if (n === 1) return 'OK';
    if (n === 0) return 'CONFLICTO';
    if (n === -1) return 'NO_EXISTE';
    if (n === -2) return 'ILEGIBLE';
    return 'INCONSISTENTE';
  }

  async indice(nombre: string): Promise<string[]> {
    const salida = await this.manda<unknown>('SMEMBERS', clave('idx', nombre));
    if (salida === null || salida === undefined) return [];
    if (!Array.isArray(salida)) {
      throw new RespuestaInvalida(`El índice ${nombre} vino como ${describe(salida)}, no como lista.`);
    }
    if (!salida.every((x) => typeof x === 'string')) {
      throw new RespuestaInvalida(`El índice ${nombre} trae miembros que no son texto.`);
    }
    return salida as string[];
  }

  async leeVarios<T extends Registro>(ns: string, ids: string[]): Promise<{ encontrados: T[]; faltantes: string[] }> {
    if (!ids.length) return { encontrados: [], faltantes: [] };
    const salida = await this.manda<unknown>('MGET', ...ids.map((id) => clave(ns, id)));
    if (!Array.isArray(salida) || salida.length !== ids.length) {
      throw new RespuestaInvalida('El almacén devolvió menos registros de los pedidos.');
    }
    const encontrados: T[] = [];
    const faltantes: string[] = [];
    salida.forEach((crudo, i) => {
      if (typeof crudo === 'string') encontrados.push(analiza<T>(crudo, `${ns}/${ids[i]}`));
      else if (crudo === null || crudo === undefined) faltantes.push(ids[i]);
      else throw new RespuestaInvalida(`El registro ${ns}/${ids[i]} vino como ${describe(crudo)}.`);
    });
    return { encontrados, faltantes };
  }

  async contador(nombre: string, ventanaSegundos: number): Promise<number> {
    const n = await this.evalua(
      LUA_CONTADOR,
      [clave('lim', nombre)],
      [ventanaSegundos],
      /* Un conteo es 1 o mas; -3 es el tipo raro. Cero o negativos
         distintos serian un almacen que no se comporta. */
      (n) => n >= 1 || n === -3,
    );
    if (n === -3) throw new RespuestaInvalida('El contador de abuso tiene un tipo inesperado.');
    return n;
  }

  async cuenta(nombre: string): Promise<number> {
    const salida = await this.manda<unknown>('GET', clave('lim', nombre));
    if (salida === null || salida === undefined) return 0;
    /* Un contador es un entero escrito como texto por INCR. Si llega
       otra cosa, es un almacen que no se comporta: no se convierte. */
    if (typeof salida === 'number' && Number.isInteger(salida)) return salida;
    if (typeof salida === 'string' && /^\d+$/.test(salida)) return Number(salida);
    throw new RespuestaInvalida(`El contador ${nombre} vino como ${describe(salida)}.`);
  }

  async escanea(ns: string, limite = 5000): Promise<{ ids: string[]; truncado: boolean }> {
    const prefijo = `ath:${ns}:`;
    const ids: string[] = [];
    let cursor = '0';
    let vueltas = 0;
    do {
      const salida = await this.manda<unknown>('SCAN', cursor, 'MATCH', `${prefijo}*`, 'COUNT', 500);
      if (!Array.isArray(salida) || salida.length !== 2) {
        throw new RespuestaInvalida(`SCAN devolvió ${describe(salida)}.`);
      }
      const [siguiente, claves] = salida as [unknown, unknown];
      if (typeof siguiente !== 'string' || !Array.isArray(claves)) {
        throw new RespuestaInvalida('SCAN devolvió un cursor o una lista con forma inesperada.');
      }
      for (const k of claves) {
        if (typeof k !== 'string') throw new RespuestaInvalida('SCAN devolvió una clave que no es texto.');
        ids.push(k.slice(prefijo.length));
      }
      cursor = siguiente;
      vueltas++;
      if (ids.length >= limite) return { ids: ids.slice(0, limite), truncado: true };
      /* Un cursor que no avanza nunca seria un bucle infinito contra
         produccion. Mil vueltas de 500 son medio millon de claves. */
      if (vueltas > 1000) return { ids, truncado: true };
    } while (cursor !== '0');
    return { ids, truncado: false };
  }

  async vida(ns: string, id: string): Promise<number> {
    return this.numero('TTL', clave(ns, id));
  }

  async vidaIndice(nombre: string): Promise<number> {
    return this.numero('TTL', clave('idx', nombre));
  }

  /** TTL y similares: numero entero, sin conversiones. */
  private async numero(...orden: (string | number)[]): Promise<number> {
    const salida = await this.manda<unknown>(...orden);
    if (typeof salida !== 'number' || !Number.isInteger(salida)) {
      throw new RespuestaInvalida(`El almacén devolvió ${describe(salida)} donde esperaba un entero.`);
    }
    return salida;
  }
}

/** Como describir lo que llegó sin volcar su contenido en un registro. */
function describe(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return `una lista de ${valor.length}`;
  return `un valor de tipo ${typeof valor}`;
}

/** Un registro ilegible no se ignora en silencio: alguien tiene que mirarlo. */
function analiza<T extends Registro>(crudo: string, donde: string): T {
  let dato: unknown;
  try {
    dato = JSON.parse(crudo);
  } catch {
    throw new RespuestaInvalida(`El registro ${donde} está guardado en un formato ilegible.`);
  }
  if (!dato || typeof dato !== 'object' || typeof (dato as Registro).version !== 'number') {
    throw new RespuestaInvalida(`El registro ${donde} no tiene versión: no se puede cambiar con seguridad.`);
  }
  return dato as T;
}

/* ------------------------------------------------------------
   ALMACEN EN MEMORIA — para las pruebas que no necesitan Redis

   Cumple el MISMO contrato, incluida la comparacion de version. No
   se activa solo: las pruebas se lo pasan a mano.

   Aviso honesto: este almacen es de un solo proceso, asi que su
   "atomicidad" es la del bucle de eventos de Node. Sirve para probar
   la logica, NO para demostrar que el contrato aguanta concurrencia
   de verdad. Eso se demuestra contra Redis real, en
   scripts/prueba-almacen-real.mts, y por eso esa prueba existe.
   ------------------------------------------------------------ */
export class AlmacenMemoria implements Almacen {
  private readonly datos = new Map<string, string>();
  private readonly indices = new Map<string, Set<string>>();
  private readonly contadores = new Map<string, number>();
  /** Retraso artificial entre leer y escribir, para provocar carreras. */
  lentitud = 0;

  private async respira(): Promise<void> {
    if (this.lentitud > 0) await new Promise((r) => setTimeout(r, this.lentitud));
  }

  async crea(ns: string, registro: Registro, indices: string[] = []): Promise<boolean> {
    const k = clave(ns, registro.id);
    if (this.datos.has(k)) return false;
    this.datos.set(k, JSON.stringify(registro));
    for (const i of indices) {
      const conjunto = this.indices.get(i) ?? new Set<string>();
      conjunto.add(registro.id);
      this.indices.set(i, conjunto);
    }
    return true;
  }

  async lee<T extends Registro>(ns: string, id: string): Promise<T | null> {
    const crudo = this.datos.get(clave(ns, id));
    return crudo ? analiza<T>(crudo, `${ns}/${id}`) : null;
  }

  async cambia(ns: string, registro: Registro, indices: string[] = []): Promise<ResultadoCambio> {
    /* El retraso va ANTES de la comprobacion, que es donde estaria
       la ventana si la comparacion no fuera atomica. Asi la prueba
       de carrera es de verdad una carrera. */
    await this.respira();
    const k = clave(ns, registro.id);
    const crudo = this.datos.get(k);
    if (!crudo) return 'NO_EXISTE';
    let actual: Registro;
    try {
      actual = analiza<Registro>(crudo, `${ns}/${id(registro)}`);
    } catch {
      return 'ILEGIBLE';
    }
    if (actual.version !== registro.version - 1) return 'CONFLICTO';
    this.datos.set(k, JSON.stringify(registro));
    for (const i of indices) {
      const conjunto = this.indices.get(i) ?? new Set<string>();
      conjunto.add(registro.id);
      this.indices.set(i, conjunto);
    }
    return 'OK';
  }

  async indice(nombre: string): Promise<string[]> {
    return [...(this.indices.get(nombre) ?? [])];
  }

  async leeVarios<T extends Registro>(ns: string, ids: string[]): Promise<{ encontrados: T[]; faltantes: string[] }> {
    const encontrados: T[] = [];
    const faltantes: string[] = [];
    for (const i of ids) {
      const crudo = this.datos.get(clave(ns, i));
      if (crudo) encontrados.push(analiza<T>(crudo, `${ns}/${i}`));
      else faltantes.push(i);
    }
    return { encontrados, faltantes };
  }

  async contador(nombre: string, _ventanaSegundos: number): Promise<number> {
    if (this.contadorRoto) throw new RespuestaInvalida('Contador averiado a propósito.');
    const n = (this.contadores.get(nombre) ?? 0) + 1;
    this.contadores.set(nombre, n);
    return n;
  }

  async cuenta(nombre: string): Promise<number> {
    if (this.contadorRoto) throw new RespuestaInvalida('Contador averiado a propósito.');
    return this.contadores.get(nombre) ?? 0;
  }

  async escanea(ns: string, limite = 5000): Promise<{ ids: string[]; truncado: boolean }> {
    const prefijo = `ath:${ns}:`;
    const ids = [...this.datos.keys()].filter((k) => k.startsWith(prefijo)).map((k) => k.slice(prefijo.length));
    return { ids: ids.slice(0, limite), truncado: ids.length > limite };
  }

  async vida(ns: string, id: string): Promise<number> {
    return this.datos.has(clave(ns, id)) ? RETENCION_SEGUNDOS : -2;
  }

  async vidaIndice(nombre: string): Promise<number> {
    return this.indices.has(nombre) ? RETENCION_SEGUNDOS : -2;
  }

  /** Para probar qué hace el sistema cuando el contador falla. */
  contadorRoto = false;

  /* --- Ayudas de prueba: provocar exactamente lo que la auditoria vio --- */

  /** Borra un registro dejando su id en el índice: escritura parcial. */
  rompeIndice(ns: string, id: string): void {
    this.datos.delete(clave(ns, id));
  }

  /** Escribe basura en un registro, para probar la lectura ilegible. */
  corrompe(ns: string, id: string): void {
    this.datos.set(clave(ns, id), '{esto no es json');
  }

  todo(): string[] {
    return [...this.datos.keys()];
  }
}

const id = (r: Registro): string => r.id;

export function almacen(): Almacen {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new SinAlmacen();
  return new RedisHttp(url, token);
}
