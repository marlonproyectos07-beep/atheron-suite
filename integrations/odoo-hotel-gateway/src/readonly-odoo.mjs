const READ_METHODS = new Set(['fields_get', 'search', 'read', 'search_read']);

export const DEFAULT_ALLOWED_MODELS = new Set([
  'ir.model',
  'ir.model.fields',
  'planning.slot',
  'resource.resource',
  'res.partner',
  'sale.order',
  'sale.order.line',
  'account.move',
  'account.move.line',
  'account.payment',
  'account.bank.statement.line',
  'account.journal',
]);

export class ReadonlyViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadonlyViolation';
  }
}

export class ReadonlyOdooClient {
  #transport;
  #database;
  #user;
  #secret;
  #uid = null;
  #allowedModels;

  constructor({ transport, database, user, secret, allowedModels = DEFAULT_ALLOWED_MODELS }) {
    if (!transport || typeof transport.call !== 'function') throw new Error('transport.call is required');
    this.#transport = transport;
    this.#database = database;
    this.#user = user;
    this.#secret = secret;
    this.#allowedModels = new Set(allowedModels);
  }

  async login() {
    if (!this.#database || !this.#user || !this.#secret) throw new Error('AUTH_BLOCKED');
    const uid = await this.#transport.call('common', 'login', [this.#database, this.#user, this.#secret]);
    if (!uid) throw new Error('AUTH_BLOCKED');
    this.#uid = uid;
    return uid;
  }

  async execute(model, method, args = [], kwargs = {}) {
    if (!READ_METHODS.has(method)) throw new ReadonlyViolation('METHOD_BLOCKED:' + method);
    if (!this.#allowedModels.has(model)) throw new ReadonlyViolation('MODEL_BLOCKED:' + model);
    if (!this.#uid) await this.login();
    return this.#transport.call('object', 'execute_kw', [
      this.#database,
      this.#uid,
      this.#secret,
      model,
      method,
      args,
      kwargs,
    ]);
  }

  async fields(model) {
    return this.execute(model, 'fields_get', [], {
      attributes: ['string', 'type', 'relation', 'required', 'readonly'],
    });
  }

  async searchRead(model, domain = [], fields = [], { limit = 500, order = 'id asc' } = {}) {
    return this.execute(model, 'search_read', [domain], { fields, limit, order });
  }
}

export function safeFieldList(fieldMap, candidates) {
  const available = new Set(Object.keys(fieldMap || {}));
  return candidates.filter((name) => available.has(name));
}
