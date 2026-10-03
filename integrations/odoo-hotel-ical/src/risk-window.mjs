/** Cota de planificación condicional. No es un SLA de Booking/Airbnb. */
export function estimateMaxOverbookingWindow({
  sourcePublicationSeconds, sourcePollingSeconds, gatewayApplySeconds,
  outboundPublicationSeconds, destinationImportSeconds, retrySeconds = 0,
} = {}) {
  const parts = { sourcePublicationSeconds, sourcePollingSeconds, gatewayApplySeconds,
    outboundPublicationSeconds, destinationImportSeconds, retrySeconds };
  if (Object.values(parts).some((value) => !Number.isFinite(value) || value < 0)) {
    return Object.freeze({ status: 'UNKNOWN_OR_UNBOUNDED', seconds: null });
  }
  return Object.freeze({ status: 'BOUNDED_ASSUMPTION_ONLY',
    seconds: Object.values(parts).reduce((sum, value) => sum + value, 0) });
}
