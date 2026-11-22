/* ============================================================
   FakeOdooTransport — fixture de pruebas, ATH-ODOO-HOTEL-008A/008

   Simula, solo en memoria, el inventario compartido entre "Casa
   Completa" y sus 5 habitaciones (201, 202, 203, 301, 302) para
   probar los gates anti-overbooking descritos en
   AI/ATH-ODOO-HOTEL-008A.md y la matriz E2E de
   AI/ATH-ODOO-HOTEL-008_MATRIZ_E2E.md.

   No hay Odoo real detras: nada de red, nada de credenciales, nada
   persistente. Cada instancia nace vacia y su estado vive y muere
   con el proceso de prueba (harness reversible). No sustituye a
   ningun gateway productivo porque, a la fecha de este commit, no
   existe ninguno en el repositorio (ver checkpoint 008 para el
   detalle de esa busqueda).

   Contrato simulado: fechas + personas -> availability -> quote
   determinista -> HOLD -> status. Aqui solo se modela la parte de
   availability/HOLD/status; "quote" (precio) no existe en este
   repositorio y no se inventa aqui (ver PRICING en el checkpoint).

   `canal` es solo una etiqueta informativa sobre quien pidio el HOLD
   (web, whatsapp, booking, airbnb, admin...): sirve para probar que
   el inventario se comparte de verdad entre canales (un HOLD de
   "booking" bloquea tambien a "web"), no para simular esos canales
   reales, que no existen en este repositorio.
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
    /** @type {Map<string, { holdId: string, expiraEn: number, origen: 'habitacion'|'casa-completa', canal: string, idempotencyKey: string|null }>} */
    this.holds = new Map();
    /** @type {Map<string, { holdId: string, unidadId: string, expiraEn: number }>} */
    this._holdsPorIdempotencyKey = new Map();
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
   * `idempotencyKey`: si se repite la misma peticion (mismo canal,
   * mismo cliente, mismo intento reenviado por timeout de red) con la
   * misma clave sobre la misma unidad, devuelve el HOLD ya existente
   * en vez de lanzar "no disponible". Una clave distinta, o la misma
   * clave sobre una unidad distinta, sigue las reglas normales.
   *
   * @param {string} unidadId
   * @param {{ duracionMs?: number, canal?: string, idempotencyKey?: string|null }} [opciones]
   */
  hold(unidadId, { duracionMs = 15 * 60 * 1000, canal = 'web', idempotencyKey = null } = {}) {
    if (!this._unidadValida(unidadId)) {
      throw new Error(`unidad desconocida: ${unidadId}`);
    }
    if (idempotencyKey) {
      const previo = this._holdsPorIdempotencyKey.get(idempotencyKey);
      if (previo && previo.unidadId === unidadId && previo.expiraEn > this.reloj()) {
        return { holdId: previo.holdId, unidadId, expiraEn: previo.expiraEn };
      }
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
      this.holds.set(habitacionId, { holdId, expiraEn, origen, canal, idempotencyKey });
    }
    if (idempotencyKey) {
      this._holdsPorIdempotencyKey.set(idempotencyKey, { holdId, unidadId, expiraEn });
    }
    return { holdId, unidadId, expiraEn };
  }

  /**
   * Libera explicitamente el HOLD de una habitacion o, si se pasa
   * CASA_COMPLETA, el de las 5 habitaciones piloto a la vez.
   */
  liberar(unidadId) {
    const habitaciones = unidadId === CASA_COMPLETA ? HABITACIONES_PILOTO : [unidadId];
    for (const habitacionId of habitaciones) {
      this.holds.delete(habitacionId);
    }
  }

  /** Solo para pruebas: estado crudo de una habitacion (o null si esta libre). */
  estadoHabitacion(habitacionId) {
    const hold = this._holdVigente(habitacionId);
    return hold ? { ...hold } : null;
  }
}
