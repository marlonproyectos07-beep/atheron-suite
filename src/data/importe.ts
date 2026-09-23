/* ============================================================
   IMPORTE EN PESOS QUE ESCRIBE EL LOCAL

   El empleado teclea numeros como en una calculadora: 100000. La
   pantalla le devuelve $ 100.000 mientras escribe, para que vea de
   un vistazo si puso un cero de mas o de menos.

   EL FORMATO ES SOLO PARA LOS OJOS. Lo que viaja al servidor es el
   entero que sale de quitar todo lo que no sea digito. Nunca se
   parsea el texto formateado con Number(): "100.000" en JavaScript es
   cien, no cien mil, y ese error solo se ve cuando ya se cobro.

   Sin decimales: el peso colombiano no los usa en una cuenta de
   restaurante, y admitir una coma seria admitir "100,5".
   ============================================================ */

/** Maximo de digitos que se aceptan al teclear (50.000.000 son 8). */
const MAX_DIGITOS = 9;

/** Solo los digitos, sin ceros a la izquierda. "" si no hay ninguno. */
export function digitos(texto: string): string {
  return texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITOS);
}

/**
 * El entero de pesos que representa lo tecleado, o undefined si no
 * hay nada que se pueda enviar. "$ 100.000" -> 100000.
 */
export function valorEntero(texto: string): number | undefined {
  const d = digitos(texto);
  if (!d) return undefined;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Formato COP es-CO sin decimales: 1000000 -> "$ 1.000.000". */
export function formatoCop(valor: number): string {
  const entero = Math.trunc(Math.abs(valor));
  const conPuntos = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}$ ${conPuntos}`;
}

/** Lo que se pinta en el campo mientras se escribe. "" si esta vacio. */
export function formateaMientrasEscribe(texto: string): string {
  const v = valorEntero(texto);
  return v === undefined ? '' : formatoCop(v);
}
