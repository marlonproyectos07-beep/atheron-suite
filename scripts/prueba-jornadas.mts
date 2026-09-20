/* ============================================================
   PRUEBAS DEL CALENDARIO DE JORNADAS

     npm run prueba-jornadas

   Comprueban lo unico que de verdad importa de Gallina al Vapor: que
   la pagina NUNCA anuncie una jornada que ya paso, se haya desplegado
   cuando se haya desplegado.

   Se prueban los tres momentos por separado -antes, durante y
   despues- y las dos mitades del mecanismo:

     1. La decision al construir (jornadaVigente, jornadasPendientes).
     2. La decision en el navegador, que es la misma logica que lleva
        src/components/SelectorJornada.astro. Se copia aqui a
        proposito: si alguien cambia el componente y se olvida de esto,
        las pruebas siguen describiendo el comportamiento acordado y la
        diferencia se ve. Es una prueba, no una abstraccion.

   Ademas se prueba el encadenado: con dos fechas cargadas, el paso de
   una a la siguiente ocurre SIN volver a desplegar. Para eso hace
   falta una fecha inventada, y por eso se usa un calendario de
   mentira, local a la prueba. En JORNADAS no se inventa ninguna.

   POR QUE .mts Y NO .mjs

   Importa el modulo de datos, que es TypeScript. Node lo ejecuta con
   --experimental-strip-types (ver package.json). No hay compilador ni
   dependencias nuevas.
   ============================================================ */

import {
  JORNADAS,
  SIN_JORNADA,
  finDeJornada,
  jornadaVigente,
  jornadasPendientes,
  calendarioCliente,
  mensajePedido,
  type Jornada,
} from '../src/data/gallina-al-vapor.ts';

let fallos = 0;
let pruebas = 0;

function comprueba(nombre: string, obtenido: unknown, esperado: unknown) {
  pruebas++;
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(
    `  ${ok ? 'ok  ' : 'FALLO'} ${nombre}${ok ? '' : `\n         obtenido: ${JSON.stringify(obtenido)}\n         esperado: ${JSON.stringify(esperado)}`}`,
  );
}

/** La misma decision que toma el navegador en SelectorJornada.astro. */
function eligeElNavegador(calendario: { id: string; hasta: string }[], ahora: string): string {
  const t = Date.parse(ahora);
  for (const c of calendario) {
    const fin = Date.parse(c.hasta);
    if (!isNaN(fin) && fin >= t) return c.id;
  }
  return SIN_JORNADA;
}

const vigenteEn = (iso: string) => jornadaVigente(new Date(iso))?.fechaMaquina ?? SIN_JORNADA;

/* ------------------------------------------------------------
   EL CALENDARIO REAL
   ------------------------------------------------------------ */
console.log('\nCalendario real (src/data/gallina-al-vapor.ts)');

comprueba('hay al menos una jornada cargada', JORNADAS.length > 0, true);
comprueba(
  'las fechas son AAAA-MM-DD',
  JORNADAS.every((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.fechaMaquina)),
  true,
);
comprueba(
  'ninguna fecha esta repetida',
  new Set(JORNADAS.map((j) => j.fechaMaquina)).size,
  JORNADAS.length,
);
comprueba(
  'cada jornada dice cuando se comprobo',
  JORNADAS.every((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.verificadoEl)),
  true,
);
comprueba(
  'el fin de jornada lleva la hora de Colombia',
  JORNADAS.map(finDeJornada).every((f) => f.endsWith('T23:59:59-05:00')),
  true,
);
comprueba(
  'el mensaje de WhatsApp nombra su propia fecha',
  JORNADAS.every((j) => mensajePedido(j).includes(j.fechaLarga)),
  true,
);

/* ------------------------------------------------------------
   ANTES, DURANTE Y DESPUES — la jornada del 20 de septiembre
   ------------------------------------------------------------ */
console.log('\nAntes, durante y despues del 20 de septiembre de 2026');

comprueba('un dia antes (19), se anuncia',            vigenteEn('2026-09-19T10:00:00-05:00'), '2026-09-20');
comprueba('la vispera a medianoche menos un segundo', vigenteEn('2026-09-19T23:59:59-05:00'), '2026-09-20');
comprueba('el mismo dia por la manana',               vigenteEn('2026-09-20T08:00:00-05:00'), '2026-09-20');
comprueba('el mismo dia, ultimo segundo',             vigenteEn('2026-09-20T23:59:59-05:00'), '2026-09-20');
comprueba('el dia siguiente, primer segundo',         vigenteEn('2026-09-21T00:00:00-05:00'), SIN_JORNADA);
comprueba('cinco dias despues',                       vigenteEn('2026-09-25T10:00:00-05:00'), SIN_JORNADA);
comprueba('meses despues',                            vigenteEn('2027-03-01T10:00:00-05:00'), SIN_JORNADA);

/* La hora es de Colombia, no la del servidor que construye. Las dos
   marcas de abajo son el MISMO instante escrito en dos husos: si la
   zona se colara en el calculo, darian resultados distintos. */
comprueba('medianoche de Colombia, escrita en UTC',   vigenteEn('2026-09-21T05:00:00Z'), SIN_JORNADA);
comprueba('un segundo antes, escrito en UTC',         vigenteEn('2026-09-21T04:59:59Z'), '2026-09-20');

/* ------------------------------------------------------------
   LO QUE VE EL VISITANTE CON UNA CONSTRUCCION VIEJA
   ------------------------------------------------------------ */
console.log('\nConstruccion del 19 de septiembre, visitada mas tarde');

const calViejo = calendarioCliente(new Date('2026-09-19T10:00:00-05:00'));

comprueba('visita el 19',    eligeElNavegador(calViejo, '2026-09-19T12:00:00-05:00'), '2026-09-20');
comprueba('visita el 20',    eligeElNavegador(calViejo, '2026-09-20T12:00:00-05:00'), '2026-09-20');
comprueba('visita el 21',    eligeElNavegador(calViejo, '2026-09-21T09:00:00-05:00'), SIN_JORNADA);
comprueba('visita en 2027',  eligeElNavegador(calViejo, '2027-03-01T09:00:00-05:00'), SIN_JORNADA);
comprueba(
  'el calendario que viaja al navegador solo lleva fechas',
  calViejo.every((c) => Object.keys(c).sort().join(',') === 'hasta,id'),
  true,
);

/* ------------------------------------------------------------
   ENCADENAR DOS JORNADAS SIN DESPLEGAR

   Con un calendario de mentira: en JORNADAS no se inventa una fecha
   que direccion no haya confirmado.
   ------------------------------------------------------------ */
console.log('\nDos jornadas cargadas: se encadenan sin desplegar');

const deMentira: Jornada[] = [
  { ...JORNADAS[0], fechaMaquina: '2026-09-20', fechaLarga: 'primera', fechaTexto: 'primera' },
  { ...JORNADAS[0], fechaMaquina: '2026-10-04', fechaLarga: 'segunda', fechaTexto: 'segunda' },
];
const calDeMentira = deMentira
  .map((j) => ({ id: j.fechaMaquina, hasta: finDeJornada(j) }))
  .sort((a, b) => a.id.localeCompare(b.id));

comprueba('visita el 19 -> la primera',  eligeElNavegador(calDeMentira, '2026-09-19T10:00:00-05:00'), '2026-09-20');
comprueba('visita el 25 -> la segunda',  eligeElNavegador(calDeMentira, '2026-09-25T10:00:00-05:00'), '2026-10-04');
comprueba('visita el 5 de octubre -> ninguna', eligeElNavegador(calDeMentira, '2026-10-05T10:00:00-05:00'), SIN_JORNADA);

/* El orden del calendario no puede depender de como se escriba la
   lista: si alguien anade una fecha al principio, debe seguir bien. */
console.log('\nEl orden de la lista no altera el resultado');
const alReves = [...deMentira].reverse();
comprueba(
  'pendientes van de la mas proxima a la mas lejana',
  jornadasPendientes(new Date('2026-09-19T10:00:00-05:00')).map((j) => j.fechaMaquina),
  JORNADAS.filter((j) => new Date(finDeJornada(j)) >= new Date('2026-09-19T10:00:00-05:00'))
    .map((j) => j.fechaMaquina)
    .sort(),
);
comprueba(
  'un calendario escrito al reves se ordena igual',
  alReves.map((j) => j.fechaMaquina).sort(),
  ['2026-09-20', '2026-10-04'],
);

/* ------------------------------------------------------------ */
console.log(
  fallos === 0
    ? `\n${pruebas} pruebas de jornada, todas correctas.\n`
    : `\n${pruebas} pruebas de jornada, ${fallos} FALLIDAS.\n`,
);
process.exit(fallos ? 1 : 0);
