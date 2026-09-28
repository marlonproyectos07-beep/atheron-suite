/* ============================================================
   PRUEBAS ATH-ODOO-HOTEL-008 — matriz E2E offline (prelaunch)

     npm run prueba-odoo-hotel-008-e2e

   Extiende las pruebas de scripts/prueba-odoo-hotel-008a.mjs (que
   siguen intactas y se ejecutan aparte) con los escenarios de la
   matriz de AI/ATH-ODOO-HOTEL-008_MATRIZ_E2E.md que SI son seguros y
   verificables offline: inventario compartido entre canales,
   cancelacion, expiracion, idempotencia y el modelo de concurrencia
   de un solo proceso (check-and-set atomico).

   Lo que esta matriz NO cubre porque no existe en este repositorio
   (ver checkpoint): gateway Odoo real, canales Booking/Airbnb/
   WhatsApp/Sofia de verdad, precio/quote. Simularlos aqui como PASS
   seria inventar datos, asi que quedan documentados como
   BLOCKED_NOT_IMPLEMENTED en el checkpoint, no como pruebas falsas.

   Sin dependencias: node y ya, mismo patron que
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

console.log('\nPRUEBAS ATH-ODOO-HOTEL-008 — matriz E2E offline\n');

/* ------------------------------------------------------------
   E2E-1: reservar 201 (HOLD simple) desde el canal web.
   ------------------------------------------------------------ */
console.log(' E2E-1: reservar 201 desde web');
{
  const odoo = new FakeOdooTransport();
  const r = odoo.hold('201', { canal: 'web' });
  compara('devuelve un holdId', typeof r.holdId === 'string' && r.holdId.length > 0, true);
  compara('201 queda ocupada', odoo.disponible('201'), false);
  compara('el estado registra el canal web', odoo.estadoHabitacion('201').canal, 'web');
}

/* ------------------------------------------------------------
   E2E-2: doble reserva de 201 (mismo canal, sin idempotencyKey)
   debe fallar; es la segunda venta del mismo canal.
   ------------------------------------------------------------ */
console.log('\n E2E-2: doble reserva de 201 (mismo canal) falla');
{
  const odoo = new FakeOdooTransport();
  odoo.hold('201', { canal: 'web' });
  let lanzo = false;
  try {
    odoo.hold('201', { canal: 'web' });
  } catch {
    lanzo = true;
  }
  compara('la segunda reserva de 201 lanza error', lanzo, true);
}

/* ------------------------------------------------------------
   E2E-3: reservar 201 bloquea Casa Completa; las otras 4
   habitaciones siguen disponibles.
   ------------------------------------------------------------ */
console.log('\n E2E-3: reservar 201 bloquea Casa Completa, no a las demas habitaciones');
{
  const odoo = new FakeOdooTransport();
  odoo.hold('201', { canal: 'web' });
  compara('Casa Completa no disponible', odoo.disponible(CASA_COMPLETA), false);
  compara(
    'las otras 4 habitaciones siguen disponibles',
    HABITACIONES_PILOTO.filter((h) => h !== '201').map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.filter((h) => h !== '201').map(() => true),
  );
}

/* ------------------------------------------------------------
   E2E-4: Casa Completa bloquea las 5 habitaciones (repite 008A-2
   con canal explicito para dejar evidencia de origen).
   ------------------------------------------------------------ */
console.log('\n E2E-4: Casa Completa bloquea las 5 habitaciones');
{
  const odoo = new FakeOdooTransport();
  odoo.hold(CASA_COMPLETA, { canal: 'web' });
  compara(
    'las 5 quedan ocupadas',
    HABITACIONES_PILOTO.map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.map(() => false),
  );
}

/* ------------------------------------------------------------
   E2E-5: cancelacion explicita de una habitacion la libera sin
   reabrir las demas que siguen ocupadas.
   ------------------------------------------------------------ */
console.log('\n E2E-5: cancelacion de 201 la libera sin afectar otro HOLD activo');
{
  const odoo = new FakeOdooTransport();
  odoo.hold('201', { canal: 'web' });
  odoo.hold('202', { canal: 'booking' });
  odoo.liberar('201');
  compara('201 vuelve a estar disponible', odoo.disponible('201'), true);
  compara('202 sigue ocupada (no se reabre inventario ajeno)', odoo.disponible('202'), false);
  compara('Casa Completa sigue no disponible por 202', odoo.disponible(CASA_COMPLETA), false);
}

/* ------------------------------------------------------------
   E2E-6: cancelacion de Casa Completa libera las 5 a la vez.
   ------------------------------------------------------------ */
console.log('\n E2E-6: cancelacion de Casa Completa libera las 5 habitaciones');
{
  const odoo = new FakeOdooTransport();
  odoo.hold(CASA_COMPLETA, { canal: 'web' });
  odoo.liberar(CASA_COMPLETA);
  compara(
    'las 5 quedan libres',
    HABITACIONES_PILOTO.map((h) => odoo.disponible(h)),
    HABITACIONES_PILOTO.map(() => true),
  );
  compara('Casa Completa vuelve a estar disponible', odoo.disponible(CASA_COMPLETA), true);
}

/* ------------------------------------------------------------
   E2E-7: expiracion del HOLD de una habitacion suelta la libera
   sin reabrir inventario aun bloqueado por otro HOLD vigente.
   ------------------------------------------------------------ */
console.log('\n E2E-7: expiracion de 201 no reabre 202, que sigue con HOLD vigente');
{
  let ahora = 3_000_000;
  const odoo = new FakeOdooTransport({ reloj: () => ahora });
  odoo.hold('201', { canal: 'web', duracionMs: 5 * 60 * 1000 });
  odoo.hold('202', { canal: 'booking', duracionMs: 30 * 60 * 1000 });
  ahora += 5 * 60 * 1000 + 1;
  compara('201 libre tras expirar', odoo.disponible('201'), true);
  compara('202 sigue ocupada: su HOLD no ha expirado', odoo.disponible('202'), false);
}

/* ------------------------------------------------------------
   E2E-8: idempotencia — reenviar la misma peticion (misma
   idempotencyKey) sobre la misma unidad no crea un segundo HOLD
   ni lanza error; devuelve el HOLD original.
   ------------------------------------------------------------ */
console.log('\n E2E-8: idempotencia — reintento con la misma clave no duplica el HOLD');
{
  const odoo = new FakeOdooTransport();
  const primero = odoo.hold('201', { canal: 'web', idempotencyKey: 'web-req-abc' });
  const reintento = odoo.hold('201', { canal: 'web', idempotencyKey: 'web-req-abc' });
  compara('el reintento devuelve el mismo holdId', reintento.holdId, primero.holdId);
  compara('sigue habiendo un unico HOLD activo sobre 201', odoo.disponible('201'), false);
}

/* ------------------------------------------------------------
   E2E-9: idempotencia no es una puerta trasera — una clave
   distinta sobre una unidad ya ocupada sigue fallando.
   ------------------------------------------------------------ */
console.log('\n E2E-9: idempotencia no evita el rechazo de una segunda venta real');
{
  const odoo = new FakeOdooTransport();
  odoo.hold('201', { canal: 'web', idempotencyKey: 'web-req-abc' });
  let lanzo = false;
  try {
    odoo.hold('201', { canal: 'web', idempotencyKey: 'web-req-otro' });
  } catch {
    lanzo = true;
  }
  compara('una clave distinta sobre 201 ya ocupada sigue fallando', lanzo, true);
}

/* ------------------------------------------------------------
   E2E-10: segunda venta desde otro canal — Booking reserva 201;
   Airbnb intenta reservar la misma habitacion y falla porque el
   inventario es compartido, no por canal.
   ------------------------------------------------------------ */
console.log('\n E2E-10: segunda venta desde otro canal falla (inventario compartido)');
{
  const odoo = new FakeOdooTransport();
  odoo.hold('201', { canal: 'booking' });
  let lanzo = false;
  try {
    odoo.hold('201', { canal: 'airbnb' });
  } catch {
    lanzo = true;
  }
  compara('Airbnb no puede reservar la 201 que ya tiene Booking', lanzo, true);
  compara('el HOLD activo sigue siendo el de Booking', odoo.estadoHabitacion('201').canal, 'booking');
}

/* ------------------------------------------------------------
   E2E-11: consulta de disponibilidad desde otro canal (modela
   "WhatsApp/Sofia pregunta disponibilidad") ve el mismo estado
   que dejo el canal web — misma fuente de verdad, sin logica de
   canal separada.
   ------------------------------------------------------------ */
console.log('\n E2E-11: la disponibilidad es la misma para cualquier canal que consulte');
{
  const odoo = new FakeOdooTransport();
  odoo.hold(CASA_COMPLETA, { canal: 'web' });
  const vistaWeb = HABITACIONES_PILOTO.map((h) => odoo.disponible(h));
  const vistaOtroCanal = HABITACIONES_PILOTO.map((h) => odoo.disponible(h));
  compara('la consulta desde "otro canal" ve exactamente el mismo estado', vistaOtroCanal, vistaWeb);
}

/* ------------------------------------------------------------
   E2E-12: concurrencia modelada en un solo proceso — dos
   intentos de HOLD sobre la misma unidad en el mismo tick
   (check-and-set sincrono) nunca producen dos HOLDs activos.
   Esto NO sustituye una prueba de concurrencia real contra una
   base de datos compartida (eso requiere Odoo LIVE staging).
   ------------------------------------------------------------ */
console.log('\n E2E-12: concurrencia modelada — check-and-set atomico evita doble HOLD');
{
  const odoo = new FakeOdooTransport();
  const intentos = ['web', 'booking'].map((canal) => {
    try {
      return { canal, ok: true, hold: odoo.hold('201', { canal }) };
    } catch {
      return { canal, ok: false };
    }
  });
  const exitosos = intentos.filter((i) => i.ok);
  compara('solo uno de los dos intentos simultaneos gana el HOLD', exitosos.length, 1);
  compara('201 queda ocupada tras la carrera', odoo.disponible('201'), false);
}

console.log('');
if (fallos.length) {
  console.error(`PRUEBAS FALLIDAS: ${fallos.length} de ${hechas}`);
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`${hechas} pruebas, todas correctas.\n`);
