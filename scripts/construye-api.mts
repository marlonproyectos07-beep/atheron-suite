/* ============================================================
   EMPAQUETADO DE LAS FUNCIONES DE VERCEL

   ============================================================
   EL FALLO QUE ESTO ARREGLA, Y POR QUE NO SE ARREGLA CON UN PARCHE
   ============================================================

   En la prueba fisica, POST /api/activar devolvio 500 en Vercel:

     ERR_MODULE_NOT_FOUND
     Cannot find module '/var/task/api/_http.ts'
     imported from /var/task/api/activar.js

   La causa no es de activar.ts. Es de como estaba montado TODO el
   directorio /api:

     - Vercel compila cada api/*.ts a api/*.js, pero NO reescribe los
       especificadores de import. './_http.ts' sobrevive tal cual
       dentro del .js, y en ejecucion apunta a un archivo que ya no
       existe con ese nombre.
     - Ademas, media logica vive en ../src/data/*.ts, que esta FUERA
       de /api y que el empaquetado de funciones no tiene por que
       incluir.

   Eso afectaba a las seis funciones por igual, no solo a activar.
   Cambiar una extension o mover un import habria hecho desaparecer
   el primer mensaje de error y aparecer el segundo.

   ============================================================
   LA CORRECCION: QUE NO HAYA NADA QUE RESOLVER EN EJECUCION
   ============================================================

   Las fuentes viven ahora en /servidor. Este script las empaqueta
   con esbuild en UN SOLO archivo por endpoint, ESM, sin un solo
   import relativo: lo que queda en /api son seis .mjs autocontenidos.

   Con eso, el problema no se "arregla": deja de poder existir. No
   hay resolucion de modulos en ejecucion porque no hay modulos que
   resolver. Y lo que se prueba en local es byte a byte lo mismo que
   se sube.

   POR QUE SE VERSIONAN LOS .mjs

   Porque Vercel decide QUE es una funcion mirando el repositorio, no
   el resultado del build. Un api/*.mjs generado durante el build
   podria no llegar a existir como funcion. Versionados, estan ahi
   desde el primer momento.

   El riesgo de versionar algo generado es que se quede viejo, asi
   que no se deja al cuidado de nadie: scripts/prueba-vercel.mts
   vuelve a empaquetar y compara. Si difiere, falla.

   POR QUE .mjs Y NO .js

   Para que la interpretacion no dependa de que el package.json de la
   raiz llegue o no dentro del paquete de la funcion. Con .mjs es ESM
   siempre, diga lo que diga cualquier otra cosa.
   ============================================================ */
import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const FUENTES = path.join(RAIZ, 'servidor');
export const SALIDA = path.join(RAIZ, 'api');

/** Los endpoints publicos: todo lo que no empieza por guion bajo. */
export async function endpoints(): Promise<string[]> {
  const todo = await readdir(FUENTES);
  return todo
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort();
}

const CABECERA = [
  '/* ARCHIVO GENERADO — no se edita a mano.',
  '   Fuente: servidor/<nombre>.ts · Se regenera con: npm run api',
  '   Lo comprueba: npm run prueba-vercel (falla si esto se queda viejo). */',
].join('\n');

export async function construye(): Promise<string[]> {
  const nombres = await endpoints();
  await build({
    entryPoints: nombres.map((n) => path.join(FUENTES, `${n}.ts`)),
    outdir: SALIDA,
    outExtension: { '.js': '.mjs' },
    /* Todo dentro: ni un import relativo sobrevive al empaquetado. */
    bundle: true,
    platform: 'node',
    format: 'esm',
    /* El runtime de Node de Vercel va por delante de esto; apuntar
       bajo no cuesta nada y quita sorpresas de sintaxis. */
    target: 'node20',
    /* Sin minificar: esto se versiona, y un diff ilegible es un diff
       que nadie revisa. */
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    banner: { js: CABECERA },
    logLevel: 'silent',
  });
  return nombres;
}

/* Ejecutado directamente: construye y cuenta lo que hizo. */
if (process.argv[1] && path.resolve(process.argv[1]).startsWith(path.join(RAIZ, 'scripts', 'construye-api'))) {
  const nombres = await construye();
  console.log(`Funciones empaquetadas en /api: ${nombres.map((n) => `${n}.mjs`).join(', ')}`);
}
