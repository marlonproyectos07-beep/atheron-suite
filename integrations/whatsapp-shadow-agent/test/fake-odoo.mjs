/**
 * Odoo SIMULADO para pruebas. Los precios de aqui son FICTICIOS (solo
 * sirven para comprobar que el agente repite lo que Odoo devuelve y nunca
 * calcula tarifas): NO son tarifas reales de Atheron.
 */
import { AS_ROOMS } from '../src/policy.mjs';

export const FAKE_PRICE_PER_NIGHT = Object.freeze({ 201: 105000, 202: 105000, 203: 120000, 301: 150000, 302: 120000, CASA_COMPLETA: 800000 });
const nightsOf = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

export function makeFakeOdoo({ available = ['201', '202', '203', '301', '302', 'CASA_COMPLETA'], depositPercent = null, fail = false } = {}) {
  const calls = [];
  const api = {
    calls,
    async availability(req) {
      calls.push({ op: 'availability', req });
      if (fail) throw new Error('boom');
      const nights = nightsOf(req.checkIn, req.checkOut);
      const cap = (u) => (u === 'CASA_COMPLETA' ? 22 : AS_ROOMS[u].capacity);
      const bathOf = (u) => (u === 'CASA_COMPLETA' ? null : AS_ROOMS[u].bath);
      let pool = available.filter((u) => !req.bath || bathOf(u) === req.bath);
      let options = [];
      if ((req.rooms ?? 1) >= 2) {
        const rooms = pool.filter((u) => u !== 'CASA_COMPLETA').sort((a, b) => FAKE_PRICE_PER_NIGHT[a] - FAKE_PRICE_PER_NIGHT[b]);
        if (rooms.length >= 2 && cap(rooms[0]) + cap(rooms[1]) >= req.guests) {
          const [a, b] = rooms;
          const total = (FAKE_PRICE_PER_NIGHT[a] + FAKE_PRICE_PER_NIGHT[b]) * nights;
          options = [{ unit: `${a}+${b}`, label: `${a}+${b}`, capacity: cap(a) + cap(b), bath: null, total, nights, price_basis: 'room' }];
        }
      } else {
        options = pool
          .filter((u) => cap(u) >= req.guests && !(u === 'CASA_COMPLETA' && req.guests <= 7))
          .map((u) => ({ unit: u, label: u, capacity: cap(u), bath: bathOf(u), total: FAKE_PRICE_PER_NIGHT[u] * nights, nights, price_basis: 'room', ...(depositPercent ? { deposit_required: Math.round(FAKE_PRICE_PER_NIGHT[u] * nights * depositPercent) / 100 } : {}) }));
      }
      return { status: options.length ? 'OK' : 'NO_AVAILABILITY', options };
    },
    async quote(req) {
      return api.availability(req);
    },
  };
  return api;
}
