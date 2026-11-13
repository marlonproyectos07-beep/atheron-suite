export function toCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('MONEY_INVALID');
    value = value.toFixed(2);
  }
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new Error('MONEY_INVALID');
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function fromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('MONEY_INVALID');
  return (cents / 100).toFixed(2);
}
