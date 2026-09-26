/* ============================================================
   FakeOdooTransport — fixture de pruebas, ATH-ODOO-HOTEL-008A

   Simula, solo en memoria, el inventario compartido entre "Casa
   Completa" y sus 5 habitaciones (201, 202, 203, 301, 302) para
   probar los gates anti-overbooking descritos en
   AI/ATH-ODOO-HOTEL-008A.md.

   No hay Odoo real detras: nada de red, nada de credenciales, nada
   persistente. Cada instancia nace vacia y su estado vive y muere
   con el proceso de prueba (harness reversible). No sustituye a
   ningun gateway productivo porque, a la fecha de este commit, no
   existe ninguno en el repositorio.

   Contrato simulado: fechas + personas -> availability -> quote
   determinista -> HOLD -> status. Aqui solo se modela la parte de
   availability/HOLD/status; "quote" no aplica a los gates 008A-1..4.
   ============================================================ */

export const HABITACIONES_PILOTO = Object.freeze(['201', '202', '203', '301', '302']);
export const CASA_COMPLETA = 'casa-completa';

let contadorHold = 0;

export class FakeOdooTransport {
  /**
   * @param {{ reloj?: () => number }} [opciones]
   *   `reloj` permite a las pruebas simular el paso del tiempo sin
   *   tocar Date.now global.
   */
  constructor({ reloj = () => Date.now() } = {}) {
    this.reloj = reloj;
    /** @type {Map<string, { holdId: string, expiraEn: number, origen: 'habitacion'|'casa-completa' }>} */
    this.holds = new Map();
  }

  _unidadValida(unidadId) {
    return unidadId === CASA_COMPLETA || HABITACIONES_PILOTO.includes(unidadId);
  }

  _holdVigente(habitacionId) {
    const hold = this.holds.get(habitacionId);
    if (!hold) return null;
    if (hold.expiraEn <= this.reloj()) {
      this.holds.delete(habitacionId);
      return null;
    }
    return hold;
  }

  /** @param {string} unidadId */
  disponible(unidadId) {
    if (!this._unidadValida(unidadId)) {
      throw new Error(`unidad desconocida: ${unidadId}`);
    }
    if (unidadId === CASA_COMPLETA) {
      return HABITACIONES_PILOTO.every((h) => !this._holdVigente(h));
    }
    return !this._holdVigente(unidadId);
  }

  /**
   * Crea un HOLD sobre una habitacion o sobre la Casa Completa.
   * Un HOLD de Casa Completa se modela como un HOLD simultaneo sobre
   * las 5 habitaciones, todas con el mismo holdId y la misma
   * expiracion, para poder liberarlas juntas (gate 008A-3) sin
   * afectar holds de habitaciones sueltas (gate 008A-4).
   *
   * @param {string} unidadId
   * @param {{ duracionMs?: number }} [opciones]
   */
  hold(unidadId, { duracionMs = 15 * 60 * 1000 } = {}) {
    if (!this._unidadValida(unidadId)) {
      throw new Error(`unidad desconocida: ${unidadId}`);
    }
    if (!this.disponible(unidadId)) {
      throw new Error(`no disponible: ${unidadId}`);
    }
    contadorHold += 1;
    const holdId = `hold-${contadorHold}`;
    const expiraEn = this.reloj() + duracionMs;
    const origen = unidadId === CASA_COMPLETA ? 'casa-completa' : 'habitacion';
    const habitaciones = unidadId === CASA_COMPLETA ? HABITACIONES_PILOTO : [unidadId];
    for (const habitacionId of habitaciones) {
      this.holds.set(habitacionId, { holdId, expiraEn, origen });
    }
    return { holdId, unidadId, expiraEn };
  }

  /** Libera explicitamente el HOLD que ocupa una habitacion, si lo hay. */
  liberar(habitacionId) {
    this.holds.delete(habitacionId);
  }

  /** Solo para pruebas: estado crudo de una habitacion (o null si esta libre). */
  estadoHabitacion(habitacionId) {
    const hold = this._holdVigente(habitacionId);
    return hold ? { ...hold } : null;
  }
}
