/* ============================================================
   PRUEBAS ATH-ODOO-HOTEL-008A — gates anti-overbooking

     npm run prueba-odoo-hotel-008a

   Ejercitan FakeOdooTransport (scripts/fake-odoo-transport.mjs), un
   fixture en memoria que simula el inventario compartido entre
   "Casa Completa" y sus 5 habitaciones piloto (201, 202, 203, 301,
   302), tal como se describe en AI/ATH-ODOO-HOTEL-008A.md.

   Esto es un harness de prueba, no un gateway productivo: no hay
   ningun gateway Odoo real en este repositorio a la fecha de este
   commit, asi que aqui no se esta alterando comportamiento
   productivo alguno, solo verificando el contrato que debera cumplir
   cuando exista.

   Sin dependencias: node y ya, siguiendo la misma convencion que
   scripts/prueba-minimo-publicable.mjs.
   ============================================================ */
import { FakeOdooTransport, HABITACIONES_PILOTO, CASA_COMPLETA } from './fake-odoo-transport.mjs';

let hechas = 0;
const fallos = [];

function compara(nombre, real, esperado) {
  hechas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) return console.log(`  ok   ${nombre}`);
  fallos.push(nombre);
  console.log(`  FALLA ${nombre}\n         esperaba: ${b}\n         obtuvo:   ${a}`);
}

console.log('\nPRUEBAS ATH-ODOO-HOTEL-008A (FakeOdooTransport)\n');

/* ------------------------------------------------------------
   GATE 008A-1: HOLD habitacion -> Casa Completa no disponible.
   ------------------------------------------------------------ */
console.log(' GATE 008A-1: HOLD habitacion bloquea Casa Completa');
{
  const odoo = new FakeOdooTransport();
  compara('Casa Completa disponible antes de cualquier HOLD', odoo.disponible(CASA_COMPLETA), true);
  odoo.hold('201');
  compara('la habitacion 201 queda ocupada', odoo.disponible('201'), false);
  compara('Casa Completa deja de estar disponible', odoo.disponible(CASA_COMPLETA), false);
}

/* ------------------------------------------------------------
   GATE 008A-2: HOLD Casa Completa -> 201/202/203/301/302 no
   disponibles.
   ------------------------------------------------------------ */
console.log('\n GATE 008A-2: HOLD Casa Completa bloquea las 5 habitaciones');
{
  const odoo = new FakeOdooTransport();
  odoo.hold(CASA_COMPLETA);
  compara(
    'las 5 habitaciones quedan ocupadas',
    HABITACIONES_PILOTO.map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.map(() => false),
  );
  compara('Casa Completa tambien queda ocupada', odoo.disponible(CASA_COMPLETA), false);
}

/* ------------------------------------------------------------
   GATE 008A-3: expiracion HOLD Casa Completa -> libera las 5
   habitaciones.
   ------------------------------------------------------------ */
console.log('\n GATE 008A-3: expiracion del HOLD de Casa Completa libera las 5 habitaciones');
{
  let ahora = 1_000_000;
  const odoo = new FakeOdooTransport({ reloj: () => ahora });
  odoo.hold(CASA_COMPLETA, { duracionMs: 15 * 60 * 1000 });
  compara(
    'siguen ocupadas justo antes de expirar',
    HABITACIONES_PILOTO.map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.map(() => false),
  );
  ahora += 15 * 60 * 1000 + 1;
  compara(
    'las 5 habitaciones quedan libres tras expirar',
    HABITACIONES_PILOTO.map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.map(() => true),
  );
  compara('Casa Completa vuelve a estar disponible', odoo.disponible(CASA_COMPLETA), true);
}

/* ------------------------------------------------------------
   GATE 008A-4: HOLD de una habitacion no bloquea/libera
   incorrectamente las otras habitaciones.
   ------------------------------------------------------------ */
console.log('\n GATE 008A-4: HOLD de una habitacion no afecta a las demas');
{
  let ahora = 2_000_000;
  const odoo = new FakeOdooTransport({ reloj: () => ahora });
  odoo.hold('201', { duracionMs: 10 * 60 * 1000 });
  compara(
    'las otras 4 habitaciones siguen disponibles',
    HABITACIONES_PILOTO.filter((h) => h !== '201').map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.filter((h) => h !== '201').map(() => true),
  );

  odoo.hold('202', { duracionMs: 20 * 60 * 1000 });
  ahora += 10 * 60 * 1000 + 1;
  compara('la 201 se libera al expirar su propio HOLD', odoo.disponible('201'), true);
  compara('la 202 sigue ocupada: no se libero por la expiracion de la 201', odoo.disponible('202'), false);
  compara(
    'las habitaciones nunca tocadas siguen disponibles',
    ['203', '301', '302'].map((h) => odoo.disponible(h)),
    [true, true, true],
  );

  odoo.liberar('202');
  compara('liberar 202 explicitamente no afecta a 203/301/302', ['203', '301', '302'].map((h) => odoo.disponible(h)), [
    true,
    true,
    true,
  ]);
}

/* ------------------------------------------------------------
   Guardas de contrato: unidades desconocidas y HOLD duplicado.
   ------------------------------------------------------------ */
console.log('\n Guardas de contrato');
{
  const odoo = new FakeOdooTransport();
  let lanzo = false;
  try {
    odoo.disponible('999');
  } catch {
    lanzo = true;
  }
  compara('consultar una unidad desconocida lanza error (no inventa disponibilidad)', lanzo, true);

  odoo.hold('301');
  let lanzoDuplicado = false;
  try {
    odoo.hold('301');
  } catch {
    lanzoDuplicado = true;
  }
  compara('no se puede duplicar un HOLD sobre una habitacion ya ocupada', lanzoDuplicado, true);
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
