/** Contratos sin transporte ni credenciales. Cada capacidad se inyecta tras su gate. */
export class UnsupportedOperationError extends Error {
  constructor(adapter, operation) {
    super(`${adapter}.${operation}: UNSUPPORTED_OPERATION`);
    this.code = 'UNSUPPORTED_OPERATION';
    this.adapter = adapter;
    this.operation = operation;
  }
}

export class BaseAdapter {
  constructor(name, operations = {}) {
    this.name = name;
    this.operations = Object.freeze({ ...operations });
  }

  async #call(operation, input) {
    const method = this.operations[operation];
    if (typeof method !== 'function') throw new UnsupportedOperationError(this.name, operation);
    return method(input);
  }

  fetchAvailability(input) { return this.#call('fetchAvailability', input); }
  fetchReservations(input) { return this.#call('fetchReservations', input); }
  block(input) { return this.#call('block', input); }
  release(input) { return this.#call('release', input); }
  health(input) { return this.#call('health', input); }
  reconcile(input) { return this.#call('reconcile', input); }
}

export class BookingAdapter extends BaseAdapter {
  constructor(operations) { super('BOOKING', operations); }
}
export class AirbnbAdapter extends BaseAdapter {
  constructor(operations) { super('AIRBNB', operations); }
}
export class OdooAdapter extends BaseAdapter {
  constructor(operations) { super('ODOO', operations); }
}
export class IcalAdapter extends BaseAdapter {
  constructor(operations) { super('ICAL', operations); }
}
