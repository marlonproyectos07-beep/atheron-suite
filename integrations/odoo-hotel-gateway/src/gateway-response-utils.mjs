/**
 * Helpers compartidos para leer respuestas reales del gateway (HTTP), que
 * vienen DOBLEMENTE anidadas: el sobre HTTP ({ok, correlation_id, data:
 * <envelope propio del adapter>}) envuelve el envelope del adapter ({ok,
 * op, ..., data: {opciones}}). Confirmado probando el Gateway directo con
 * la clave real (ATH-ODOO-HOTEL-008) -- no es una suposicion.
 */

/** Busca `opciones`/`units` sin asumir un numero fijo de niveles. */
export function findOpciones(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 5) return [];
  if (Array.isArray(node.opciones)) return node.opciones;
  if (Array.isArray(node.units)) return node.units;
  if (node.data) return findOpciones(node.data, depth + 1);
  return [];
}

/** true/false/null (null = la unidad no vino en la respuesta). */
export function unitAvailability(opciones, unitId) {
  const found = opciones.find((u) => String(u.unit_id) === String(unitId));
  if (!found) return null;
  if (typeof found.available === 'boolean') return found.available;
  return found.estado === 'disponible';
}
