/* ============================================================
   ¿HACE FALTA VOLVER A PUBLICAR EL SITIO?

   QUE PROBLEMA RESUELVE

   /guia-zipaquira/gallina-al-vapor se defiende sola de una jornada
   vencida con el reloj del visitante (src/components/SelectorJornada.astro).
   Pero ese arreglo necesita JavaScript. A quien lo tenga desactivado,
   y a un rastreador que no ejecute scripts, le llega el HTML tal como
   quedo el dia del ultimo despliegue: si la jornada ya paso, la ve
   anunciada.

   El unico modo de cerrar ese caso en un sitio estatico es volver a
   construir. Este script decide SI hace falta, para no crear
   despliegues todos los dias sin motivo.

   COMO LO DECIDE

   Compara dos cosas:

     1. Que jornada deberia anunciarse hoy, segun el calendario del
        repositorio (src/data/gallina-al-vapor.ts).
     2. Que jornada esta anunciada AHORA MISMO en el HTML publicado:
        el unico bloque con data-jornada-id que no lleva "hidden".

   Si coinciden, no se toca nada. Si no, hay que reconstruir.

   POR QUE NO SE LEE EL MODULO TypeScript DIRECTAMENTE

   Este script es .mjs sin compilador, igual que comprueba-jornadas.mjs.
   Del calendario solo hacen falta las fechas, y se sacan del archivo
   con una expresion regular. Si el formato cambiara y no se encontrara
   ninguna, el script lo dice y NO despliega: un comprobador que no
   encuentra nada y sigue adelante es peor que no tenerlo.

   EN CASO DE DUDA, NO SE DESPLIEGA

   Si la pagina no responde, devuelve otra cosa, o no trae ningun
   marcador reconocible, la respuesta es "no hace falta" y queda un
   aviso en el registro. Un fallo de lectura no puede convertirse en un
   despliegue diario en bucle contra produccion.

   USO

     node scripts/necesita-redespliegue.mjs

   Variables de entorno, todas opcionales:

     URL_PUBLICADA   Origen a comprobar. Por defecto el dominio real.
     AHORA           Fecha ISO con la que razonar, para pruebas.
     GITHUB_OUTPUT   Si existe, escribe "necesita=true|false" para que
                     el paso siguiente del flujo de trabajo lo lea.

   Siempre termina con codigo 0: esto informa, no rompe nada.
   ============================================================ */

import { readFileSync, appendFileSync } from 'node:fs';

const ARCHIVO_CALENDARIO = 'src/data/gallina-al-vapor.ts';
const RUTA_GALLINA = '/guia-zipaquira/gallina-al-vapor';
const SIN_JORNADA = 'por-anunciar';
const ESPERA_MS = 15_000;

const origen = (process.env.URL_PUBLICADA || 'https://hotelesatheron.com').replace(/\/$/, '');
const ahora = process.env.AHORA ? new Date(process.env.AHORA) : new Date();

/** Deja la decision donde el flujo de trabajo pueda leerla. */
function responder(necesita, motivo) {
  console.log(`${necesita ? 'HACE FALTA REDESPLEGAR' : 'No hace falta redesplegar'}: ${motivo}`);
  if (process.env.GITHUB_OUTPUT) {
    /* Una sola linea por clave. Un salto de linea dentro del valor
       romperia el formato de GITHUB_OUTPUT y el paso siguiente leeria
       basura, asi que se aplana antes de escribir. */
    const plano = motivo.replace(/\s+/g, ' ').trim();
    appendFileSync(process.env.GITHUB_OUTPUT, `necesita=${necesita}\nmotivo=${plano}\n`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------
   1. QUE DEBERIA ANUNCIARSE HOY
   ------------------------------------------------------------ */
const fuente = readFileSync(ARCHIVO_CALENDARIO, 'utf8');
const fechas = [...fuente.matchAll(/fechaMaquina:\s*'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]).sort();

if (fechas.length === 0) {
  responder(false, `no se encontro ninguna fechaMaquina en ${ARCHIVO_CALENDARIO}; revisa el formato del archivo`);
}

/* Colombia no tiene horario de verano: -05:00 es constante. */
const finDelDia = (f) => new Date(`${f}T23:59:59-05:00`).getTime();
const debeVerse = fechas.find((f) => finDelDia(f) >= ahora.getTime()) ?? SIN_JORNADA;

/* ------------------------------------------------------------
   2. QUE SE ESTA ANUNCIANDO EN EL SITIO PUBLICADO
   ------------------------------------------------------------ */
const direccion = `${origen}${RUTA_GALLINA}`;
let html;
try {
  const respuesta = await fetch(direccion, {
    redirect: 'follow',
    headers: { 'User-Agent': 'atheron-redespliegue/1.0' },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!respuesta.ok) {
    responder(false, `${direccion} respondio ${respuesta.status}`);
  }
  html = await respuesta.text();
} catch (e) {
  responder(false, `no se pudo leer ${direccion} (${e.message})`);
}

/* Cada etiqueta con data-jornada-id, con sus atributos, para saber
   cual NO lleva hidden. El atributo puede ir antes o despues. */
const visibles = new Set();
const todos = new Set();
for (const m of html.matchAll(/<[a-zA-Z][^>]*\sdata-jornada-id="([^"]+)"[^>]*>/g)) {
  todos.add(m[1]);
  if (!/\shidden(?=[\s/>=])/.test(m[0])) visibles.add(m[1]);
}

if (todos.size === 0) {
  responder(
    false,
    `${direccion} no trae ningun data-jornada-id. O todavia sirve el sitio antiguo, o la pagina cambio de forma`,
  );
}

if (visibles.size !== 1) {
  responder(false, `${direccion} muestra ${visibles.size} bloques de jornada a la vez; eso es un fallo de la pagina, no del calendario`);
}

/* ------------------------------------------------------------
   3. LA DECISION
   ------------------------------------------------------------ */
const publicado = [...visibles][0];

if (publicado === debeVerse) {
  responder(false, `el sitio ya anuncia «${publicado}», que es lo que corresponde hoy`);
}

responder(true, `el sitio anuncia «${publicado}» y hoy corresponde «${debeVerse}»`);
