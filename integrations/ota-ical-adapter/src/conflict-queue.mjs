/**
 * Cola de conflictos en memoria (Fase 7: "mandar conflicto a cola"). En
 * producción esto debería persistir en Odoo o en almacenamiento propio del
 * gateway; aquí queda como puerto simple para que el adapter no dependa de
 * un backend concreto.
 */
export class ConflictQueue {
  constructor() {
    this._items = [];
  }

  push(conflict) {
    const item = { ...conflict, queuedAt: new Date().toISOString() };
    this._items.push(item);
    return item;
  }

  list() {
    return [...this._items];
  }

  clear() {
    this._items = [];
  }
}
