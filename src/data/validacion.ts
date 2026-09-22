/* ============================================================
   VALIDACION DE ENTRADAS — todo lo que llega de fuera pasa por aqui

   POR QUE EXISTE ESTE ARCHIVO

   La auditoria independiente de ATH-LOOP-002 reprodujo el problema:
   el codigo usaba Number(x) para leer el consumo, y Number() es
   generoso de una forma que aqui cuesta dinero.

     Number(true)       -> 1
     Number([100000])   -> 100000
     Number('  12 ')    -> 12
     Number('')         -> 0
     Number(null)       -> 0
     Number('1e3')      -> 1000

   Un array con un numero dentro se convertia en una venta. Un
   booleano se convertia en un peso. Eso no es un caso raro de
   laboratorio: es lo que llega cuando alguien manda JSON a mano, o
   cuando un formulario se rompe a medias.

   LA REGLA DE ESTE ARCHIVO

   Nada se "interpreta". Se acepta lo que es exactamente del tipo
   esperado, y todo lo demas se rechaza diciendo por que. Devolver
   undefined en vez de lanzar es a proposito: quien llama decide si
   eso es un 400 o un campo opcional que no vino.

   ============================================================
   LA UNIDAD DEL DINERO: PESOS ENTEROS
   ============================================================

   Todos los importes de la Red Atheron son PESOS COLOMBIANOS
   ENTEROS. Ni centavos, ni decimales, ni notacion cientifica.

   El peso no usa centavos en la practica -no circula ninguna moneda
   por debajo de 50 pesos-, asi que arrastrar decimales solo produce
   descuadres de uno al conciliar. Y un consumo de "0.1" no es una
   cuenta de restaurante: es un error de tecleo o una prueba de
   alguien buscando por donde se cuela.

   Por eso 0.1 se RECHAZA en vez de redondearse a 0. Redondear una
   entrada invalida es inventarse el dato de otro.
   ============================================================ */

export type Fallo = 'AUSENTE' | 'TIPO' | 'NO_ENTERO' | 'RANGO';

export interface Lectura<T> {
  valor?: T;
  fallo?: Fallo;
}

const AUSENTE: Lectura<never> = { fallo: 'AUSENTE' };

/* ------------------------------------------------------------
   ENTEROS — SOLO NUMEROS, NI SIQUIERA CADENAS DE DIGITOS

   La primera version admitia "100000" porque un formulario HTML
   manda texto. La reauditoria lo senalo, y tenia razon: el cuerpo de
   estas peticiones es JSON, no un formulario, y quien lo construye
   -nuestra propia pantalla- manda numeros. Admitir la cadena solo
   servia para que un cliente descuidado o malicioso metiera algo que
   PARECE un numero.

   Convertir en la frontera es la costumbre que produjo el problema
   original: quien convierte acaba aceptando true, [100000] y "1e3".
   Aqui no se convierte nada. Si no es un number, es TIPO.

   Si algun dia hace falta leer un formulario de verdad, se usa
   enteroDeTexto, que esta abajo y se llama distinto a proposito.
   ------------------------------------------------------------ */
export function entero(bruto: unknown, min: number, max: number): Lectura<number> {
  if (bruto === undefined || bruto === null) return AUSENTE;
  /* true, "100000", [100000], {}: todo esto es TIPO, no RANGO. */
  if (typeof bruto !== 'number') return { fallo: 'TIPO' };
  if (!Number.isFinite(bruto)) return { fallo: 'TIPO' };
  if (!Number.isInteger(bruto)) return { fallo: 'NO_ENTERO' };
  if (bruto < min || bruto > max) return { fallo: 'RANGO' };
  return { valor: bruto };
}

/**
 * Para entradas que de verdad vienen como texto (un formulario
 * clasico, un parametro de la direccion). Hoy no la usa la API: esta
 * aqui para que, cuando haga falta, se elija a proposito y no por
 * descuido.
 */
export function enteroDeTexto(bruto: unknown, min: number, max: number): Lectura<number> {
  if (bruto === undefined || bruto === null || bruto === '') return AUSENTE;
  if (typeof bruto !== 'string') return { fallo: 'TIPO' };
  if (!/^-?\d+$/.test(bruto.trim())) return { fallo: 'TIPO' };
  return entero(Number(bruto.trim()), min, max);
}

/** Un importe en pesos colombianos enteros. Cero no es un importe. */
export const pesosEnteros = (bruto: unknown, max: number): Lectura<number> => entero(bruto, 1, max);

/* ------------------------------------------------------------
   TEXTO

   Se recorta y se limita. Lo que no es cadena no se convierte a
   cadena: String({}) da "[object Object]", y eso acabaria guardado
   como comentario de un cliente.
   ------------------------------------------------------------ */
export function texto(bruto: unknown, max: number): Lectura<string> {
  if (bruto === undefined || bruto === null) return AUSENTE;
  if (typeof bruto !== 'string') return { fallo: 'TIPO' };
  const limpio = bruto.trim().slice(0, max);
  return limpio ? { valor: limpio } : AUSENTE;
}

/** Booleano estricto: "true", 1 y "si" NO son true. */
export function booleano(bruto: unknown): boolean {
  return bruto === true;
}

/* ------------------------------------------------------------
   FECHAS

   Que encaje con AAAA-MM-DD no basta: "2026-02-31" encaja y no
   existe. Se comprueba reconstruyendola, que es la unica forma de
   saber si el dia existe de verdad en ese mes.
   ------------------------------------------------------------ */
export function fechaIso(bruto: unknown): Lectura<string> {
  if (bruto === undefined || bruto === null || bruto === '') return AUSENTE;
  if (typeof bruto !== 'string') return { fallo: 'TIPO' };

  /* La cadena ENTERA, sin recortar a diez caracteres: recortar
     convertia "2026-09-22-malformed" en una fecha valida, que es
     aceptar basura con buena cara. */
  const crudo = bruto.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(crudo)) return { fallo: 'TIPO' };
  const leida = { valor: crudo };

  const [a, m, d] = leida.valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const existe =
    fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
  if (!existe) return { fallo: 'RANGO' };

  /* Un informe de 1970 o de 2400 es un dedo, no una consulta. */
  if (a < 2020 || a > 2100) return { fallo: 'RANGO' };
  return { valor: leida.valor };
}

/* ------------------------------------------------------------
   PERTENENCIA A UN CATALOGO

   "x in objeto" recorre la cadena de prototipos, asi que
   "constructor", "toString" o "__proto__" darian true y se colarian
   como valores validos. Object.hasOwn mira solo lo que el objeto
   tiene de verdad.
   ------------------------------------------------------------ */
export const esClaveDe = (catalogo: object, bruto: unknown): boolean =>
  typeof bruto === 'string' && Object.hasOwn(catalogo, bruto);

/* ------------------------------------------------------------
   CUERPOS JSON

   Un array, un numero o null tambien son JSON valido, y ninguno es
   un cuerpo de peticion. Tampoco se acepta __proto__ dentro: es la
   via clasica para ensuciar el prototipo del objeto.
   ------------------------------------------------------------ */
export function objetoPlano(bruto: unknown): Record<string, unknown> {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const limpio: Record<string, unknown> = Object.create(null);
  for (const [clave, valor] of Object.entries(bruto)) {
    if (clave === '__proto__' || clave === 'constructor' || clave === 'prototype') continue;
    limpio[clave] = valor;
  }
  return limpio;
}
