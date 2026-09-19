/* ============================================================
   COMPROBACION DEL CALENDARIO DE JORNADAS

   Se ejecuta antes de cada "npm run build" (linea "prebuild" de
   package.json), junto a la comprobacion de contenido.

   QUE VIGILA

   /guia-zipaquira/gallina-al-vapor es una direccion PERMANENTE que
   anuncia jornadas con fecha. La pagina ya se defiende sola de una
   fecha vencida: pinta todas las jornadas pendientes y el navegador
   elige con el reloj del visitante (src/components/SelectorJornada.astro),
   y si no queda ninguna dice "fecha por anunciar" en lugar de mentir.

   Lo que el codigo NO puede resolver solo es que se acabe el
   calendario: eso es contenido, y lo trae direccion. Este aviso
   existe para que nadie se entere tarde.

   POR QUE AVISA Y NO DETIENE

   Quedarse sin jornadas no es un error: la pagina sigue siendo
   correcta y util, con el WhatsApp a la vista. Detener por eso
   bloquearia despliegues que no tienen nada que ver con Gallina, y un
   bloqueo que estorba acaba desactivado. Se avisa, ruidosamente, y se
   sigue.

   POR QUE SE LEE CON UNA EXPRESION REGULAR

   El calendario vive en un modulo TypeScript y este script es .mjs
   sencillo, sin compilador ni dependencias. Solo hace falta la lista
   de fechas. Si el formato del archivo cambiara y no se encontrara
   ninguna, el script lo dice en vez de callarse: un comprobador que
   no encuentra nada y aprueba es peor que no tenerlo.
   ============================================================ */

import { readFileSync } from 'node:fs';

const ARCHIVO = 'src/data/gallina-al-vapor.ts';
/** Con menos de estos dias de margen, conviene cargar la siguiente. */
const MARGEN_DIAS = 7;

const fuente = readFileSync(ARCHIVO, 'utf8');

/* Solo las fechas del calendario. fechaMaquina es AAAA-MM-DD. */
const fechas = [...fuente.matchAll(/fechaMaquina:\s*'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);

if (fechas.length === 0) {
  console.warn('');
  console.warn(`AVISO  ${ARCHIVO}: no se encontro ninguna fechaMaquina.`);
  console.warn('       O el calendario esta vacio, o cambio el formato del archivo y');
  console.warn('       este comprobador dejo de servir. Revisalo.');
  console.warn('');
  process.exit(0);
}

/* Colombia no tiene horario de verano: -05:00 es constante. */
const finDelDia = (f) => new Date(`${f}T23:59:59-05:00`).getTime();
const ahora = Date.now();

const pendientes = fechas.filter((f) => finDelDia(f) >= ahora).sort();
const dias = (f) => Math.ceil((finDelDia(f) - ahora) / 86_400_000);

if (pendientes.length === 0) {
  console.warn('');
  console.warn('AVISO  Gallina al Vapor se publica SIN fecha: no queda ninguna jornada por delante.');
  console.warn('       La pagina dira "fecha por anunciar" y ofrecera el WhatsApp, que es correcto,');
  console.warn(`       pero deja de atraer. Anade la proxima a JORNADAS en ${ARCHIVO}.`);
  console.warn('');
} else if (pendientes.length === 1 && dias(pendientes[0]) <= MARGEN_DIAS) {
  console.warn('');
  console.warn(`AVISO  Solo queda una jornada de Gallina al Vapor (${pendientes[0]}), dentro de ${dias(pendientes[0])} dia(s).`);
  console.warn(`       Cuando pase, la pagina dira "fecha por anunciar" sola: no se publica nada vencido.`);
  console.warn(`       Para encadenarlas sin despliegue, deja ya cargada la siguiente en ${ARCHIVO}.`);
  console.warn('');
} else {
  console.log(
    `Jornadas de Gallina al Vapor: ${pendientes.length} por delante (proxima ${pendientes[0]}).`,
  );
}

process.exit(0);
