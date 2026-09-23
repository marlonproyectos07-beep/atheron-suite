/* ============================================================
   REDIS LOCAL PARA PRUEBAS — el mismo protocolo que Upstash

   Levanta un redis-server de verdad y le pone delante un adaptador
   HTTP que habla el protocolo REST de Upstash / Vercel KV: se manda
   la orden como array JSON y se contesta {"result": ...}.

   Con esto, el codigo de produccion -servidor/_almacen.ts- se ejecuta sin
   cambiar una linea contra un Redis real, incluidos sus scripts Lua.
   Eso es lo que permite demostrar la atomicidad en vez de afirmarla:
   quien ejecuta el compare-and-set es Redis, no una imitacion
   escrita por quien tambien escribio el codigo que se prueba.

   Vive aqui, y no dentro de una prueba, porque lo usan dos: la del
   almacen y la adversarial. Dos copias de este montaje terminarian
   divergiendo justo en el detalle que importa.
   ============================================================ */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';

export const hayRedis = (): boolean => spawnSync('which', ['redis-server']).status === 0;

export type RespuestaResp = string | number | null | RespuestaResp[];

/* ------------------------------------------------------------
   CLIENTE RESP MINIMO

   El protocolo de Redis en cuarenta lineas. Se escribe aqui para no
   anadir una dependencia al repositorio por una prueba.
   ------------------------------------------------------------ */
export class Resp {
  private readonly socket: net.Socket;
  private readonly pendientes: ((r: RespuestaResp | Error) => void)[] = [];
  private buffer = Buffer.alloc(0);

  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on('data', (trozo) => {
      this.buffer = Buffer.concat([this.buffer, trozo]);
      for (;;) {
        const leido = this.lee(0);
        if (!leido) break;
        this.buffer = this.buffer.subarray(leido.fin);
        this.pendientes.shift()?.(leido.valor);
      }
    });
  }

  /** Devuelve el valor y donde termina, o null si todavia faltan bytes. */
  private lee(desde: number): { valor: RespuestaResp | Error; fin: number } | null {
    const salto = this.buffer.indexOf('\r\n', desde);
    if (salto < 0) return null;
    const tipo = String.fromCharCode(this.buffer[desde]);
    const cabeza = this.buffer.toString('utf8', desde + 1, salto);

    if (tipo === '+') return { valor: cabeza, fin: salto + 2 };
    if (tipo === '-') return { valor: new Error(cabeza), fin: salto + 2 };
    if (tipo === ':') return { valor: Number(cabeza), fin: salto + 2 };
    if (tipo === '$') {
      const largo = Number(cabeza);
      if (largo === -1) return { valor: null, fin: salto + 2 };
      const fin = salto + 2 + largo + 2;
      if (this.buffer.length < fin) return null;
      return { valor: this.buffer.toString('utf8', salto + 2, salto + 2 + largo), fin };
    }
    if (tipo === '*') {
      const cuantos = Number(cabeza);
      if (cuantos === -1) return { valor: null, fin: salto + 2 };
      const lista: RespuestaResp[] = [];
      let cursor = salto + 2;
      for (let i = 0; i < cuantos; i++) {
        const hijo = this.lee(cursor);
        if (!hijo) return null;
        if (hijo.valor instanceof Error) return { valor: hijo.valor, fin: hijo.fin };
        lista.push(hijo.valor);
        cursor = hijo.fin;
      }
      return { valor: lista, fin: cursor };
    }
    return { valor: new Error(`Tipo RESP desconocido: ${tipo}`), fin: salto + 2 };
  }

  manda(orden: string[]): Promise<RespuestaResp> {
    const trozos = [`*${orden.length}\r\n`];
    for (const a of orden) trozos.push(`$${Buffer.byteLength(a)}\r\n${a}\r\n`);
    return new Promise((resolver, rechazar) => {
      this.pendientes.push((r) => (r instanceof Error ? rechazar(r) : resolver(r)));
      this.socket.write(trozos.join(''));
    });
  }

  cierra(): void {
    this.socket.destroy();
  }
}

export interface RedisLocal {
  redis: Resp;
  url: string;
  /** Pone el puente en modo averiado: contesta 200 con {} . */
  averia(valor: boolean): void;
  /**
   * Hace que el puente conteste EXACTAMENTE este cuerpo, sea cual
   * sea la orden. null lo devuelve a la normalidad. Sirve para
   * probar que respuestas raras -true, [1], "1"- no se toman por
   * escrituras correctas.
   */
  responde(cuerpoCrudo: string | null): void;
  cierra(): void;
}

export async function levanta(puertoRedis: number, puertoHttp: number): Promise<RedisLocal> {
  const proceso: ChildProcess = spawn(
    'redis-server',
    ['--port', String(puertoRedis), '--save', '', '--appendonly', 'no', '--bind', '127.0.0.1'],
    { stdio: 'ignore' },
  );

  let redis: Resp | null = null;
  for (let i = 0; i < 50 && !redis; i++) {
    try {
      const socket = net.connect({ host: '127.0.0.1', port: puertoRedis });
      await new Promise<void>((r, e) => {
        socket.once('connect', () => r());
        socket.once('error', e);
      });
      const cliente = new Resp(socket);
      await cliente.manda(['PING']);
      redis = cliente;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!redis) throw new Error('redis-server no arrancó');
  await redis.manda(['FLUSHALL']);

  let averiado = false;
  let cuerpoFijo: string | null = null;
  const puente = http.createServer(async (peticion, respuesta) => {
    const trozos: Buffer[] = [];
    for await (const t of peticion) trozos.push(t as Buffer);
    respuesta.setHeader('content-type', 'application/json');

    if (cuerpoFijo !== null) {
      respuesta.writeHead(200).end(cuerpoFijo);
      return;
    }
    if (averiado) {
      respuesta.writeHead(200).end('{}');
      return;
    }
    try {
      const orden = JSON.parse(Buffer.concat(trozos).toString('utf8')) as string[];
      const resultado = await redis!.manda(orden.map(String));
      respuesta.writeHead(200).end(JSON.stringify({ result: resultado }));
    } catch (error) {
      respuesta.writeHead(200).end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  await new Promise<void>((r) => puente.listen(puertoHttp, r));

  return {
    redis,
    url: `http://127.0.0.1:${puertoHttp}`,
    averia: (valor: boolean) => {
      averiado = valor;
    },
    responde: (cuerpoCrudo: string | null) => {
      cuerpoFijo = cuerpoCrudo;
    },
    cierra: () => {
      redis!.cierra();
      puente.close();
      proceso.kill();
    },
  };
}
