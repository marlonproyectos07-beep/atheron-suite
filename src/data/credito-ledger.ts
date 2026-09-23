/* ============================================================
   CREDITO ATHERON — LIBRO MAYOR (append-only)

   LO QUE LA AUDITORIA DIJO, Y TENIA RAZON

   Hasta ahora "Credito Atheron" era una cifra dentro de la
   transaccion de La Triada: creditoGenerado = 5.000. Un numero, no
   un credito. No habia titular, ni saldo, ni movimientos, ni forma
   de gastarlo, ni nada que impidiera gastarlo dos veces, ni
   vencimiento operativo, ni manera de revertirlo si la venta se caia.

   Mientras eso fuera asi, la pantalla del cliente decia una cosa que
   el sistema no podia cumplir.

   ============================================================
   QUE ES ESTO
   ============================================================

   Un libro mayor minimo y correcto. Cada credito es un registro
   propio -separado de la transaccion del aliado, porque el credito
   sobrevive a la visita y se gasta en otro sitio- con:

     - identificador estable (ATH-CR-...);
     - importe y saldo;
     - una lista de movimientos que SOLO CRECE;
     - vencimiento;
     - referencia a la transaccion que lo origino.

   APPEND-ONLY NO ES UNA MODA

   El saldo no se edita: se anota un movimiento y el saldo se deriva
   de la suma. Asi, si dentro de tres meses alguien pregunta por que
   un credito vale 2.000 y no 5.000, la respuesta esta escrita, con
   su fecha y su referencia. Un saldo editado no tiene respuesta.

   ============================================================
   EL TITULAR: LO QUE NO SE PUEDE INVENTAR
   ============================================================

   Un credito es de alguien. Hoy Atheron NO tiene cuentas de cliente:
   nadie inicia sesion, y el unico identificador que existe es el
   codigo de la visita. Decidir que "el que tenga el codigo es el
   dueno" es una decision de identidad con consecuencias -quien vea
   ese codigo se lleva el dinero- y no es de las que se toman dentro
   de un archivo de codigo.

   Asi que NO se inventa identidad. El credito nace GENERADO y sin
   titular, y la pantalla dice exactamente eso: generado, pendiente
   de vinculacion. Cuando direccion decida el mecanismo -cuenta,
   enlace firmado, verificacion por WhatsApp-, vincular() le pone
   titular y pasa a DISPONIBLE. La estructura ya esta; lo que falta
   es la decision, y esta documentada como gate.

   Lo que NO se hace, y es lo importante: no se le promete al cliente
   que se le aplicara al reservar. Hoy no hay forma de saber que
   quien reserva es quien consumio.

   ============================================================
   LOS 90 DIAS SIGUEN SIENDO HIPOTESIS
   ============================================================

   VIGENCIA_CREDITO_DIAS vive en economia-red.ts, junto al reparto
   5/5 y con el mismo estado: parametro del piloto, no politica. Aqui
   solo se aplica.
   ============================================================ */

import { REGLA, VIGENCIA_CREDITO_DIAS, type AmbitoCredito } from './economia-red.ts';
import { selloColombiano } from './piloto-la-triada.ts';

/* ------------------------------------------------------------
   ESTADOS

   Cinco, y cuatro de ellos se DEDUCEN del saldo y de las fechas. Solo
   REVERSADO es una marca, porque un credito anulado con saldo entero
   es indistinguible de uno disponible si no se dice.
   ------------------------------------------------------------ */
export type EstadoCredito =
  | 'GENERADO' // existe, sin titular: no se puede gastar todavia
  | 'DISPONIBLE' // con titular y saldo entero
  | 'PARCIAL' // con titular y algo gastado
  | 'AGOTADO' // saldo cero
  | 'REVERSADO' // anulado: la venta que lo originó se cayó
  | 'VENCIDO'; // pasó su fecha

export const ETIQUETA_CREDITO: Record<EstadoCredito, string> = {
  GENERADO: 'Generado, pendiente de vinculación',
  DISPONIBLE: 'Disponible',
  PARCIAL: 'Usado en parte',
  AGOTADO: 'Usado',
  REVERSADO: 'Anulado',
  VENCIDO: 'Vencido',
};

export type TipoMovimiento = 'GENERACION' | 'VINCULACION' | 'GASTO' | 'REVERSION' | 'VENCIMIENTO';

export interface Movimiento {
  tipo: TipoMovimiento;
  /** Positivo suma saldo, negativo lo resta. La vinculacion es 0. */
  importe: number;
  sello: string;
  /** Contra que se hizo: una reserva, una transaccion, un motivo. */
  referencia?: string;
}

export interface Credito {
  /** ATH-CR-<algo>. Estable: es lo que se cita en cualquier reclamacion. */
  id: string;
  version: number;

  /** De donde salio. Siempre, y sin excepcion. */
  origen: { piloto: string; aliado: string; codigo: string };

  /** Importe generado, en pesos enteros. No cambia nunca. */
  valor: number;
  /** Lo que queda. Se deriva de los movimientos; se guarda por comodidad. */
  saldo: number;

  /** Donde se podria usar. Modelo, no oferta abierta. */
  ambitos: AmbitoCredito[];

  generadoEn: string;
  expiraEn: string;
  /** Regla economica con la que se genero. Para reconstruir historia. */
  reglaVersion: string;

  /* Sin identidad inventada: null hasta que direccion decida el
     mecanismo de vinculacion. Cuando exista, aqui va el identificador
     de la cuenta, NUNCA un telefono ni un nombre. */
  titular: { referencia: string; vinculadoEn: string } | null;

  reversado: boolean;
  movimientos: Movimiento[];
}

/* ------------------------------------------------------------
   CREAR
   ------------------------------------------------------------ */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** ATH-CR-XXXXXXXX. Ocho caracteres: no se dicta, se copia. */
export function nuevoIdCredito(): string {
  const n = new Uint32Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(n);
  else for (let i = 0; i < 8; i++) n[i] = Math.floor(Math.random() * 4294967296);
  return `ATH-CR-${Array.from(n, (v) => ALFABETO[v % ALFABETO.length]).join('')}`;
}

export function generaCredito(entrada: {
  id?: string;
  valor: number;
  origen: { piloto: string; aliado: string; codigo: string };
  ambitos: AmbitoCredito[];
  reglaVersion?: string;
  /* EL MOMENTO COMERCIAL: cuando se consumio, no cuando se escribio
     este registro. La reauditoria encontro que una emision reparada
     tarde movia el vencimiento hacia adelante, regalando dias que el
     cliente no habia ganado -y, al reves, un reintento podria
     acortarlos-. El credito nace de una visita, y su reloj empieza
     con la visita. */
  momentoComercial: Date;
}): Credito {
  if (!Number.isInteger(entrada.valor) || entrada.valor <= 0) {
    throw new Error('Un crédito de cero o con decimales no se emite.');
  }
  const ahora = entrada.momentoComercial;
  if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) {
    throw new Error('Un crédito sin momento comercial no se emite: su vigencia sería inventada.');
  }
  const expira = new Date(ahora.getTime() + VIGENCIA_CREDITO_DIAS * 24 * 60 * 60 * 1000);

  return {
    id: entrada.id ?? nuevoIdCredito(),
    version: 1,
    origen: entrada.origen,
    valor: entrada.valor,
    saldo: entrada.valor,
    ambitos: entrada.ambitos,
    generadoEn: selloColombiano(ahora),
    expiraEn: selloColombiano(expira),
    reglaVersion: entrada.reglaVersion ?? REGLA.version,
    titular: null,
    reversado: false,
    movimientos: [
      { tipo: 'GENERACION', importe: entrada.valor, sello: selloColombiano(ahora), referencia: entrada.origen.codigo },
    ],
  };
}

/* ------------------------------------------------------------
   ESTADO

   Se calcula, no se guarda. Un estado guardado y un saldo guardado
   son dos verdades que acaban contradiciendose.
   ------------------------------------------------------------ */
export function estadoDe(credito: Credito, ahora = new Date()): EstadoCredito {
  if (credito.reversado) return 'REVERSADO';

  /* VENCIDO y AGOTADO no son lo mismo, y confundirlos le dice al
     cliente que "usó" un crédito que en realidad se le caducó. La
     diferencia se lee en el libro: si el ultimo movimiento que dejo
     el saldo a cero fue un VENCIMIENTO, esta vencido; si fue un
     GASTO, lo uso. */
  const caducado = new Date(credito.expiraEn).getTime() <= ahora.getTime();
  const asentadoVencido = credito.movimientos.some((m) => m.tipo === 'VENCIMIENTO');
  if (asentadoVencido) return 'VENCIDO';
  if (credito.saldo <= 0) return 'AGOTADO';
  /* Se mira por fecha, sin depender de que ningun proceso haya
     pasado a marcarlo: un credito vencido no puede parecer
     disponible porque nadie ejecuto la limpieza. */
  if (caducado) return 'VENCIDO';
  if (!credito.titular) return 'GENERADO';
  return credito.saldo === credito.valor ? 'DISPONIBLE' : 'PARCIAL';
}

export const esGastable = (credito: Credito, ahora = new Date()): boolean => {
  const estado = estadoDe(credito, ahora);
  return estado === 'DISPONIBLE' || estado === 'PARCIAL';
};

/* ------------------------------------------------------------
   MOVIMIENTOS

   Todas devuelven una COPIA con la version subida. El llamante la
   escribe con compare-and-set, y si otro llego antes el almacen
   responde CONFLICTO y no hay doble gasto. Es la misma proteccion
   que usa la redencion: una sola, entendida, en vez de dos a medias.
   ------------------------------------------------------------ */
export type FalloCredito =
  | 'NO_GASTABLE'
  | 'REFERENCIA_AUSENTE'
  | 'SALDO_INSUFICIENTE'
  | 'IMPORTE_INVALIDO'
  | 'YA_VINCULADO'
  | 'YA_REVERSADO'
  | 'REVERSION_PARCIAL_REQUIERE_POLITICA';

export interface ResultadoCredito {
  ok: boolean;
  fallo?: FalloCredito;
  credito?: Credito;
  /** true si esa referencia ya se había gastado: no se gasta otra vez. */
  repetido?: boolean;
}

const siguiente = (c: Credito, m: Movimiento, cambios: Partial<Credito>): Credito => ({
  ...c,
  ...cambios,
  version: c.version + 1,
  movimientos: [...c.movimientos, m],
});

/** Le pone titular. La referencia es de una cuenta, nunca un teléfono. */
export function vincula(credito: Credito, referencia: string, ahora = new Date()): ResultadoCredito {
  if (credito.titular) return { ok: false, fallo: 'YA_VINCULADO', credito };
  if (credito.reversado) return { ok: false, fallo: 'YA_REVERSADO', credito };
  const sello = selloColombiano(ahora);
  return {
    ok: true,
    credito: siguiente(
      credito,
      { tipo: 'VINCULACION', importe: 0, sello, referencia },
      { titular: { referencia, vinculadoEn: sello } },
    ),
  };
}

/**
 * Gasta parte o todo.
 *
 * LA REFERENCIA ES OBLIGATORIA, Y ES LO QUE IMPIDE EL DOBLE GASTO
 *
 * El compare-and-set protege de dos escrituras a la vez, pero no de
 * esto: leer la version nueva y volver a aplicar el MISMO gasto. La
 * reauditoria lo reprodujo. Con la referencia -el numero de reserva,
 * el pedido, lo que sea- el libro sabe que ese gasto ya esta dentro
 * y devuelve el credito sin tocar, marcado como repetido.
 *
 * Es la misma idea que hace segura la redencion: reintentar tiene
 * que ser inofensivo, porque las conexiones se caen a mitad.
 */
export function gasta(
  credito: Credito,
  importe: number,
  referencia: string,
  ahora = new Date(),
): ResultadoCredito {
  if (!Number.isInteger(importe) || importe <= 0) return { ok: false, fallo: 'IMPORTE_INVALIDO', credito };
  if (!referencia?.trim()) return { ok: false, fallo: 'REFERENCIA_AUSENTE', credito };

  const yaGastada = credito.movimientos.some(
    (m) => m.tipo === 'GASTO' && m.referencia === referencia.trim(),
  );
  if (yaGastada) return { ok: true, repetido: true, credito };

  if (!esGastable(credito, ahora)) return { ok: false, fallo: 'NO_GASTABLE', credito };
  if (importe > credito.saldo) return { ok: false, fallo: 'SALDO_INSUFICIENTE', credito };

  return {
    ok: true,
    credito: siguiente(
      credito,
      { tipo: 'GASTO', importe: -importe, sello: selloColombiano(ahora), referencia: referencia.trim() },
      { saldo: credito.saldo - importe },
    ),
  };
}

/**
 * Anula el credito porque la venta que lo origino se cayo.
 * Si ya se habia gastado algo, NO se decide aqui: quien asume esa
 * perdida es una decision comercial, no un caso de codigo.
 */
export function reversa(credito: Credito, motivo: string, ahora = new Date()): ResultadoCredito {
  if (credito.reversado) return { ok: false, fallo: 'YA_REVERSADO', credito };
  if (credito.saldo !== credito.valor) {
    return { ok: false, fallo: 'REVERSION_PARCIAL_REQUIERE_POLITICA', credito };
  }
  return {
    ok: true,
    credito: siguiente(
      credito,
      { tipo: 'REVERSION', importe: -credito.saldo, sello: selloColombiano(ahora), referencia: motivo },
      { saldo: 0, reversado: true },
    ),
  };
}

/** Deja escrito el vencimiento. El estado ya vencía solo; esto lo asienta. */
export function asientaVencimiento(credito: Credito, ahora = new Date()): ResultadoCredito {
  if (estadoDe(credito, ahora) !== 'VENCIDO') return { ok: false, fallo: 'NO_GASTABLE', credito };
  return {
    ok: true,
    credito: siguiente(
      credito,
      { tipo: 'VENCIMIENTO', importe: -credito.saldo, sello: selloColombiano(ahora) },
      { saldo: 0 },
    ),
  };
}

/* ------------------------------------------------------------
   COMPROBACION DE INTEGRIDAD

   El saldo guardado tiene que ser la suma de los movimientos. Si
   algun dia no lo es, es que alguien edito el saldo a mano o un
   cambio se escribio a medias, y eso hay que verlo enseguida.
   ------------------------------------------------------------ */
export function cuadraCredito(credito: Credito): boolean {
  const suma = credito.movimientos.reduce((n, m) => n + m.importe, 0);
  return suma === credito.saldo;
}

/** Vista para el cliente: sin referencias internas ni titular. */
export interface CreditoVista {
  id: string;
  valor: number;
  saldo: number;
  estado: EstadoCredito;
  etiqueta: string;
  expiraEn: string;
  ambitos: AmbitoCredito[];
}

export const vistaCredito = (credito: Credito, ahora = new Date()): CreditoVista => {
  const estado = estadoDe(credito, ahora);
  return {
    id: credito.id,
    valor: credito.valor,
    saldo: credito.saldo,
    estado,
    etiqueta: ETIQUETA_CREDITO[estado],
    expiraEn: credito.expiraEn,
    ambitos: credito.ambitos,
  };
};
