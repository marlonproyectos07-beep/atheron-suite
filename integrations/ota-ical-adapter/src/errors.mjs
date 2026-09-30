export class AdapterError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
  }
}
