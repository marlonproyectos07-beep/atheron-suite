/* ============================================================
   EL ALMACEN, CONTRA REDIS DE VERDAD

     npm run prueba-almacen

   POR QUE ESTA PRUEBA EXISTE

   La auditoria independiente dijo, con razon, que no vale demostrar
   atomicidad contra una imitacion escrita por uno mismo: una
   imitacion hace exactamente lo que su autor cree que hace el
   sistema real, incluido el error.

   Asi que aqui no hay imitacion. Se levanta un redis-server de
   verdad, se pone delante un adaptador HTTP que habla el mismo
   protocolo REST que Upstash y Vercel KV -un array JSON con la orden,
   una respuesta {"result": ...}- y se ejecuta EL MISMO codigo de
   produccion contra el. Los scripts Lua los ejecuta Redis, no este
   archivo.

   QUE DEMUESTRA

   - Que el compare-and-set es atomico de verdad: cincuenta
     escrituras simultaneas sobre la misma version dejan una sola.
   - Que el registro y sus indices se crean juntos o no se crean.
   - Que un conflicto NO ensucia los indices.
   - Que una respuesta sin "result" se trata como fallo y no como
     escritura correcta.
   - Que una redencion y un cierre a la vez no se pisan, y que una
     venta confirmada no se puede borrar con un cierre.

   SI NO HAY REDIS, SE OMITE

   No se instala nada. Si redis-server no esta, la prueba lo dice y
   termina sin fallar: exigir un servicio que no esta declarado seria
   romper el build de quien no lo tenga.
   ============================================================ */

import { hayRedis, levanta } from './lib/redis-local.mts';
import { AlmacenMemoria, RespuestaInvalida, almacen, type Almacen } from '../api/_almacen.ts';
import { activar, redimir, cerrar } from '../api/_servicio.ts';
import type { Transaccion } from '../src/data/transacciones-red.ts';

if (!hayRedis()) {
  console.log('\n  (omitida: no hay redis-server en esta máquina)\n');
  process.exit(0);
}

let hechas = 0;
const fallos: string[] = [];
const ok = (nombre: string, condicion: boolean, detalle = ''): void => {
  hechas++;
  if (condicion) {
    console.log(`  ok   ${nombre}`);
    return;
  }
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}${detalle ? `\n         ${detalle}` : ''}`);
};

const local = await levanta(6399, 6398);
const redis = local.redis;

process.env.KV_REST_API_URL = local.url;
process.env.KV_REST_API_TOKEN = 'prueba';
const deposito: Almacen = almacen();

console.log('\n Contra Redis real (compare-and-set ejecutado por el servidor)');

/* ------------------------------------------------------------
   1. CREAR Y LEER
   ------------------------------------------------------------ */
{
  const registro = { id: 'R1', version: 1, dato: 'uno' };
  ok('crea un registro nuevo', await deposito.crea('pr', registro, ['dia:1']));
  ok('y no lo crea dos veces', !(await deposito.crea('pr', registro, ['dia:1'])));
  const leido = await deposito.lee<typeof registro>('pr', 'R1');
  ok('lo lee igual que lo guardó', leido?.dato === 'uno' && leido.version === 1);
  ok('y el índice lo tiene', (await deposito.indice('dia:1')).includes('R1'));

  const ttlRegistro = Number(await redis.manda(['TTL', 'ath:pr:R1']));
  const ttlIndice = Number(await redis.manda(['TTL', 'ath:idx:dia:1']));
  ok('registro e índice caducan a la vez', ttlRegistro > 0 && Math.abs(ttlRegistro - ttlIndice) <= 2, `${ttlRegistro} vs ${ttlIndice}`);
}

/* ------------------------------------------------------------
   2. COMPARE-AND-SET
   ------------------------------------------------------------ */
{
  ok(
    'cambia con la versión correcta',
    (await deposito.cambia('pr', { id: 'R1', version: 2, dato: 'dos' }, ['dia:2'])) === 'OK',
  );
  ok(
    'rechaza una versión vieja',
    (await deposito.cambia('pr', { id: 'R1', version: 2, dato: 'tres' })) === 'CONFLICTO',
  );
  ok('no cambia un registro que no existe', (await deposito.cambia('pr', { id: 'NADA', version: 2 })) === 'NO_EXISTE');

  await redis.manda(['SET', 'ath:pr:ROTO', 'esto no es json']);
  ok('detecta un registro ilegible', (await deposito.cambia('pr', { id: 'ROTO', version: 2 })) === 'ILEGIBLE');

  let lanzo = false;
  try {
    await deposito.lee('pr', 'ROTO');
  } catch (error) {
    lanzo = error instanceof RespuestaInvalida;
  }
  ok('y leerlo es un error, no un null silencioso', lanzo);
}

/* ------------------------------------------------------------
   3. CONCURRENCIA DE VERDAD
   ------------------------------------------------------------ */
{
  await deposito.crea('pr', { id: 'CARRERA', version: 1 }, []);
  const intentos = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      deposito.cambia('pr', { id: 'CARRERA', version: 2, quien: i } as never, ['ganadores']),
    ),
  );
  const ganan = intentos.filter((r) => r === 'OK').length;
  ok('50 escrituras simultáneas sobre la misma versión: gana una', ganan === 1, `ganaron ${ganan}`);
  ok(
    'y los conflictos no ensucian el índice',
    (await deposito.indice('ganadores')).length === 1,
    `${(await deposito.indice('ganadores')).length} en el índice`,
  );
}

/* ------------------------------------------------------------
   4. LECTURA PARCIAL: FALTANTES
   ------------------------------------------------------------ */
{
  await deposito.crea('pr', { id: 'A', version: 1 }, ['lote']);
  await deposito.crea('pr', { id: 'B', version: 1 }, ['lote']);
  /* Se borra el registro dejando su id en el indice: exactamente la
     escritura parcial que describio la auditoria. */
  await redis.manda(['DEL', 'ath:pr:B']);

  const { encontrados, faltantes } = await deposito.leeVarios('pr', await deposito.indice('lote'));
  ok('lee los que están', encontrados.length === 1);
  ok('y NO calla los que faltan', faltantes.includes('B'), JSON.stringify(faltantes));
}

/* ------------------------------------------------------------
   5. RESPUESTA INVALIDA DEL ALMACEN
   ------------------------------------------------------------ */
{
  local.averia(true);
  let lanzo = false;
  try {
    await deposito.crea('pr', { id: 'FANTASMA', version: 1 }, []);
  } catch (error) {
    lanzo = error instanceof RespuestaInvalida;
  }
  local.averia(false);
  ok('un 200 con {} NO cuenta como escritura correcta', lanzo);
  ok('y en efecto no se escribió nada', (await deposito.lee('pr', 'FANTASMA')) === null);
}

/* ------------------------------------------------------------
   6. EL SERVICIO ENTERO, CONTRA REDIS REAL
   ------------------------------------------------------------ */
console.log('\n El servicio completo, contra Redis real');

{
  const activada = await activar({ fuente: 'ficha-la-triada' }, deposito);
  const codigo = activada.datos!.codigo;

  const intentos = await Promise.all(
    Array.from({ length: 20 }, (_, i) => redimir({ codigo, consumo: 100000 + i }, deposito)),
  );
  const primeras = intentos.filter((r) => r.ok && !r.yaRedimida);
  const repetidas = intentos.filter((r) => r.yaRedimida);
  ok('20 redenciones simultáneas registran UNA', primeras.length === 1, `${primeras.length} registradas`);
  ok('y las otras 19 se contestan como repetidas, no como error', repetidas.length === 19, `${repetidas.length}`);

  const guardada = await deposito.lee<Transaccion>('tx', codigo);
  ok('el consumo guardado es el de la que ganó', guardada!.economia!.consumo === primeras[0].datos!.consumo);
  ok('y la comisión es el 10% de ese consumo', guardada!.economia!.comision === Math.round(guardada!.economia!.consumo / 10));
  ok('la historia quedó escrita', guardada!.eventos.some((e) => e.tipo === 'REDIMIDA'));
  ok('y se emitió su crédito', Boolean(await deposito.lee('cr', guardada!.creditoId!)));
}

{
  /* Redencion y cierre a la vez, veinte veces. Nunca puede quedar
     NO_REDIMIDO si la redencion llego a registrarse. */
  let borradas = 0;
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const activada = await activar({}, deposito);
    const codigo = activada.datos!.codigo;
    const [red, cier] = await Promise.all([
      redimir({ codigo, consumo: 50000 }, deposito),
      cerrar(codigo, deposito),
    ]);
    const final = await deposito.lee<Transaccion>('tx', codigo);
    const redencionOk = red.ok && !red.yaRedimida;
    if (redencionOk && final!.estado !== 'REDIMIDO') borradas++;
    if (!redencionOk && cier.ok && final!.estado !== 'NO_REDIMIDO') borradas++;
  }
  ok('un cierre simultáneo nunca borra una venta confirmada (20 vueltas)', borradas === 0, `${borradas} borradas`);
}

{
  /* El mismo contrato, con el almacen en memoria y un retraso
     metido a proposito entre leer y escribir: si la proteccion
     dependiera del tiempo, aqui se rompería. */
  const memoria = new AlmacenMemoria();
  memoria.lentitud = 5;
  const activada = await activar({}, memoria);
  const codigo = activada.datos!.codigo;
  const intentos = await Promise.all([
    redimir({ codigo, consumo: 10000 }, memoria),
    redimir({ codigo, consumo: 20000 }, memoria),
    cerrar(codigo, memoria),
  ]);
  const registradas = intentos.filter((r) => r.ok && !r.yaRedimida).length;
  ok('con escritura lenta, sigue ganando una sola transición', registradas === 1, `${registradas}`);
}

/* ------------------------------------------------------------ */
console.log('');
local.cierra();

if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
