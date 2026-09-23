/* ============================================================
   LA PRUEBA QUE HABRIA ATRAPADO EL 500 DE VERCEL

   El fallo de la prueba fisica no lo vio ninguna prueba local, y no
   por descuido: todas importaban servidor/*.ts directamente, con el
   repositorio entero disponible. Vercel no ejecuta eso. Vercel
   ejecuta un directorio /var/task con lo que el empaquetado haya
   metido dentro, y ahi no estaba lo que hacia falta.

   Asi que esta prueba hace justo eso: copia SOLO los .mjs de /api a
   un directorio vacio -sin node_modules, sin package.json, sin
   /servidor y sin /src- y los ejecuta desde ahi. Si a una funcion le
   faltara un trozo, aqui revienta exactamente con el mismo
   ERR_MODULE_NOT_FOUND que salio en produccion.

   Cuatro cosas se comprueban, y las cuatro fallan por separado:

     1. Que lo versionado en /api sea lo que sale de /servidor hoy.
        Un artefacto generado que se versiona se queda viejo salvo
        que algo lo vigile. Esto lo vigila.
     2. Que en /api no quede ni un .ts. Si lo hubiera, Vercel lo
        compilaria por su cuenta y volveria el problema original.
     3. Que cada funcion CARGUE en un directorio aislado. Analizar no
        basta: los imports se resuelven al cargar.
     4. Que cada funcion RESPONDA. Cargar tampoco basta: se la llama
        con una peticion de verdad y se mira el codigo de estado.
   ============================================================ */
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { construye, endpoints, SALIDA } from './construye-api.mjs';
import { generaCredencial, hashDe, variableDe } from './credencial-operador.mjs';
import { hayRedis, levanta } from './lib/redis-local.mts';

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

console.log('\n Empaquetado de las funciones de Vercel');

/* ------------------------------------------------------------
   1. LO VERSIONADO ES LO QUE SALE DE LAS FUENTES
   ------------------------------------------------------------ */
const nombres = await endpoints();
ok('hay un endpoint por cada fuente de /servidor', nombres.length === 6, nombres.join(', '));

const antes = new Map<string, string>();
for (const n of nombres) antes.set(n, await readFile(path.join(SALIDA, `${n}.mjs`), 'utf8'));

await construye();

for (const n of nombres) {
  const ahora = await readFile(path.join(SALIDA, `${n}.mjs`), 'utf8');
  ok(
    `api/${n}.mjs está al día con servidor/${n}.ts`,
    antes.get(n) === ahora,
    'El empaquetado versionado no coincide con las fuentes. Ejecuta: npm run api',
  );
}

/* ------------------------------------------------------------
   2. EN /api NO PUEDE HABER FUENTES

   Si volviera a haber un .ts aqui, Vercel lo compilaria por su
   cuenta -sin reescribir los imports- y volveria el fallo original.
   ------------------------------------------------------------ */
{
  const dentro = await readdir(SALIDA);
  const intrusos = dentro.filter((f) => !f.endsWith('.mjs'));
  ok('en /api solo hay funciones empaquetadas', intrusos.length === 0, intrusos.join(', '));

  for (const n of nombres) {
    const texto = await readFile(path.join(SALIDA, `${n}.mjs`), 'utf8');
    /* Ni un import relativo, con o sin extension: si quedara uno,
       habria algo que resolver en ejecucion. */
    const relativos = [...texto.matchAll(/from\s+"(\.[^"]*)"/g)].map((m) => m[1]);
    ok(`${n}.mjs no resuelve nada en ejecución`, relativos.length === 0, relativos.join(', '));
    const noNativos = [...texto.matchAll(/from\s+"([^".][^"]*)"/g)]
      .map((m) => m[1])
      .filter((especificador) => !especificador.startsWith('node:'));
    ok(`${n}.mjs no depende de nada fuera de Node`, noNativos.length === 0, noNativos.join(', '));
  }
}

/* ------------------------------------------------------------
   3. Y 4. SE EJECUTAN EN UN /var/task SIMULADO

   Directorio nuevo, vacio, fuera del repositorio. Lo unico que hay
   dentro son los seis archivos que Vercel subiria.
   ------------------------------------------------------------ */
const task = await mkdtemp(path.join(tmpdir(), 'var-task-'));
for (const n of nombres) await cp(path.join(SALIDA, `${n}.mjs`), path.join(task, `${n}.mjs`), { force: true });

/* Se comprueba que el aislamiento es real: si /src o /servidor
   estuvieran al alcance, esta prueba no demostraria nada. */
{
  const dentro = await readdir(task);
  ok('el directorio simulado solo tiene las funciones', dentro.length === nombres.length, dentro.join(', '));
}

/** Una peticion y una respuesta como las que pasa Vercel. */
function falsa(metodo: string, url: string, cuerpo?: unknown) {
  const peticion = { method: metodo, url, headers: { 'x-forwarded-for': '203.0.113.7' }, body: cuerpo };
  const respuesta = {
    estado: 0,
    cabeceras: {} as Record<string, string>,
    datos: undefined as unknown,
    status(codigo: number) {
      this.estado = codigo;
      return this;
    },
    setHeader(nombre: string, valor: string) {
      this.cabeceras[nombre] = valor;
    },
    json(salida: unknown) {
      this.datos = salida;
    },
  };
  return { peticion, respuesta };
}

/* Sin KV_REST_API_*: el almacen no esta configurado a proposito. Lo
   que se prueba aqui es que la funcion CARGA y CONTESTA, no que
   guarde; que guarda lo prueban las suites con Redis real. */
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const METODO: Record<string, 'GET' | 'POST'> = {
  activar: 'POST',
  redimir: 'POST',
  seguimiento: 'POST',
  transaccion: 'GET',
  reporte: 'GET',
  operador: 'GET',
};

for (const n of nombres) {
  let modulo: { default?: unknown } | null = null;
  let fallo = '';
  try {
    modulo = (await import(pathToFileURL(path.join(task, `${n}.mjs`)).href)) as { default?: unknown };
  } catch (error) {
    fallo = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  ok(`/api/${n} carga en un despliegue sin repositorio`, fallo === '', fallo);
  if (!modulo) continue;

  const handler = modulo.default as ((p: unknown, c: unknown) => Promise<void>) | undefined;
  ok(`  /api/${n} exporta su manejador por defecto`, typeof handler === 'function');
  if (typeof handler !== 'function') continue;

  /* Metodo equivocado: tiene que contestar 405 sin tocar el almacen.
     Es la prueba mas barata de que el envoltorio entero vino dentro. */
  {
    const { peticion, respuesta } = falsa(METODO[n] === 'GET' ? 'POST' : 'GET', `/api/${n}`);
    await handler(peticion, respuesta);
    ok(`  /api/${n} rechaza el método equivocado con 405`, respuesta.estado === 405, String(respuesta.estado));
    ok(`  /api/${n} no deja cachear la respuesta`, respuesta.cabeceras['cache-control'] === 'no-store');
  }

  /* Metodo correcto y sin almacen configurado: 503 con el codigo
     exacto. Si aqui saliera un 500, seria que la funcion se rompio
     por dentro, que es justo lo que pasaba en produccion. */
  {
    const { peticion, respuesta } = falsa(METODO[n], `/api/${n}?c=ATH-TRI-AAAAA&fecha=2026-09-23`, {});
    await handler(peticion, respuesta);
    const cuerpo = respuesta.datos as { motivo?: string };
    ok(
      `  /api/${n} contesta 503 ALMACEN_NO_CONFIGURADO, no 500`,
      respuesta.estado === 503 && cuerpo?.motivo === 'ALMACEN_NO_CONFIGURADO',
      `${respuesta.estado} ${JSON.stringify(cuerpo)}`,
    );
  }
}

/* ------------------------------------------------------------
   LAS DOS PAREJAS DE CREDENCIALES DEL ALMACEN

   El mismo Redis se conecta de dos maneras, y cada una pone sus
   nombres de variable. Si solo se aceptara una, el dia que el almacen
   entre por el otro camino la API dira "no hay almacen" con el
   almacen puesto: un diagnostico que acusa al sitio equivocado, que
   es justo lo que esta ronda vino a quitar.

   Se prueba contra la funcion empaquetada, que es la que corre en
   Vercel, y con una direccion que no existe: lo que se mira es si la
   funcion ACEPTA las credenciales, no si el servidor contesta.
   ------------------------------------------------------------ */
{
  const modulo = (await import(pathToFileURL(path.join(task, 'activar.mjs')).href)) as {
    default: (p: unknown, c: unknown) => Promise<void>;
  };

  const conVariables = async (vars: Record<string, string>): Promise<string> => {
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
    try {
      const { peticion, respuesta } = falsa('POST', '/api/activar', {});
      await modulo.default(peticion, respuesta);
      return (respuesta.datos as { motivo?: string })?.motivo ?? `HTTP_${respuesta.estado}`;
    } finally {
      for (const k of Object.keys(vars)) delete process.env[k];
    }
  };

  /* 127.0.0.1:1 no escucha nadie, asi que la llamada falla al
     conectar. Lo que se mira NO es el codigo de estado -los dos casos
     acaban en 503- sino el motivo: si la pareja se leyo, el fallo es
     ALMACEN_INCIERTO (hay almacen y no contesta); si no se leyo, es
     ALMACEN_NO_CONFIGURADO (no hay almacen). Son dos diagnosticos
     distintos y esa diferencia es justo lo que hay que demostrar. */
  const inalcanzable = 'http://127.0.0.1:1';

  const conKv = await conVariables({ KV_REST_API_URL: inalcanzable, KV_REST_API_TOKEN: 'x' });
  ok('se aceptan las credenciales KV_REST_API_*', conKv === 'ALMACEN_INCIERTO', conKv);

  const conUpstash = await conVariables({
    UPSTASH_REDIS_REST_URL: inalcanzable,
    UPSTASH_REDIS_REST_TOKEN: 'x',
  });
  ok('y también las UPSTASH_REDIS_REST_*', conUpstash === 'ALMACEN_INCIERTO', conUpstash);

  /* Media pareja no vale: una direccion sin su token apuntaria al
     servidor correcto con la llave equivocada. */
  const aMedias = await conVariables({ KV_REST_API_URL: inalcanzable });
  ok('media pareja NO cuenta como almacén configurado', aMedias === 'ALMACEN_NO_CONFIGURADO', aMedias);

  const cruzada = await conVariables({ KV_REST_API_URL: inalcanzable, UPSTASH_REDIS_REST_TOKEN: 'x' });
  ok('ni una pareja cruzada entre las dos formas de conectar', cruzada === 'ALMACEN_NO_CONFIGURADO', cruzada);
}

/* ------------------------------------------------------------
   LA CREDENCIAL DEL OPERADOR, CONTRA LA FUNCION QUE SE DESPLIEGA

   La prueba fisica se paro en "Credencial de La Triada". Lo que hay
   que poder afirmar antes de tocar un panel es que un hash generado
   por scripts/credencial-operador.mjs, puesto en la variable de
   entorno que calcula ese mismo script, lo acepta EL ARTEFACTO QUE
   SE SUBE -no las fuentes-.

   Si esta comprobacion pasa y el Preview sigue rechazando la
   credencial, el problema no es el formato del hash ni el nombre de
   la variable: es que la variable no llego a ese despliegue. Sirve
   para saber donde NO mirar, que a media prueba vale tanto como
   saber donde mirar.

   La credencial se genera aqui, se usa en memoria y muere con el
   proceso: no se imprime ni se guarda.
   ------------------------------------------------------------ */
if (hayRedis()) {
  const local = await levanta(6399, 6398);
  process.env.KV_REST_API_URL = local.url;
  process.env.KV_REST_API_TOKEN = 'prueba';

  const credencial = generaCredencial();
  const variable = variableDe('la-triada');
  ok('el script calcula el nombre de variable del servidor', variable === 'ATHERON_OPERADOR_LA_TRIADA', variable);

  const hash = hashDe(credencial);
  ok('y un hash de 64 caracteres hexadecimales', /^[0-9a-f]{64}$/.test(hash), `${hash.length} caracteres`);

  process.env[variable] = hash;

  const { default: operador } = (await import(
    pathToFileURL(path.join(task, 'operador.mjs')).href
  )) as { default: (p: unknown, c: unknown) => Promise<void> };

  const llama = async (cabecera?: string): Promise<number> => {
    const { peticion, respuesta } = falsa('GET', '/api/operador');
    if (cabecera !== undefined) (peticion.headers as Record<string, string>).authorization = cabecera;
    await operador(peticion, respuesta);
    return respuesta.estado;
  };

  ok('la función desplegada acepta la credencial generada', (await llama(`Bearer ${credencial}`)) === 200);
  ok('  y rechaza otra distinta con 401', (await llama('Bearer NO-ES-ESTA-CREDENCIAL')) === 401);
  ok('  sin credencial, 401', (await llama()) === 401);
  ok('  con una cabecera sin Bearer, 400', (await llama(credencial)) === 400);

  /* Con el hash mal puesto -por ejemplo, pegando la credencial en
     claro en vez de su hash- NO se entra. Es el error tipico al
     rellenar el panel, y tiene que fallar cerrado. */
  process.env[variable] = credencial;
  ok('  la credencial en claro en la variable NO abre nada', (await llama(`Bearer ${credencial}`)) === 401);

  delete process.env[variable];
  ok('  y sin variable configurada tampoco', (await llama(`Bearer ${credencial}`)) === 401);

  local.cierra();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
} else {
  console.log('  (omitida la comprobación de credencial: falta redis-server)');
}

/* ------------------------------------------------------------
   Y LA COMPROBACION DE QUE ESTA PRUEBA SIRVE

   Una prueba que no ha fallado nunca no ha demostrado que detecte
   nada. Se fabrica a proposito el fallo original -un .mjs con el
   import relativo que Vercel no supo resolver- y se exige que
   reviente igual.
   ------------------------------------------------------------ */
{
  const roto = path.join(task, 'roto.mjs');
  await writeFile(roto, "import { maneja } from './_http.ts';\nexport default maneja;\n", 'utf8');
  let mensaje = '';
  try {
    await import(pathToFileURL(roto).href);
  } catch (error) {
    mensaje = error instanceof Error ? `${(error as { code?: string }).code ?? error.name}` : String(error);
  }
  ok(
    'la prueba detecta el fallo original si vuelve',
    mensaje === 'ERR_MODULE_NOT_FOUND',
    `esperaba ERR_MODULE_NOT_FOUND y llegó «${mensaje}»`,
  );
}

await rm(task, { recursive: true, force: true });

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} comprobaciones de empaquetado, todas correctas.\n`);
