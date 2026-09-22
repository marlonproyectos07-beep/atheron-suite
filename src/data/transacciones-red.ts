/* ============================================================
   TRANSACCIONES DE LA RED — el modelo de datos de ATH-LOOP-002

   QUE ES

   Lo que se registra de una visita, de punta a punta: activacion,
   redencion, seguimiento y, si la hay, la recompra que salio de ahi.
   Es el mismo objeto en el navegador, en la API y en el informe, y
   por eso vive en un solo archivo: tres definiciones parecidas de la
   misma cosa terminan divergiendo en el campo que importa.

   ============================================================
   MINIMIZACION DE DATOS: LO QUE NO SE GUARDA
   ============================================================

   No hay nombre, ni correo, ni documento, ni mesa, ni nada que
   identifique a una persona, SALVO un contacto de WhatsApp y solo
   si esa persona lo dio a proposito para que le escriban. Sin ese
   consentimiento el campo no existe: no se guarda "por si acaso".

   El motivo no es solo legal. Un piloto que empieza guardando
   telefonos "para luego" acaba con una lista que nadie sabe de donde
   salio ni para que sirve, y que hay que borrar entera el dia que
   alguien pregunte.

   El numero de personas SI se guarda: es la cifra que le importa al
   aliado para preparar mesa, y no identifica a nadie.

   ============================================================
   EL ORIGINADOR COMERCIAL
   ============================================================

   La relacion con La Triada la origino Josue. Eso se REGISTRA, con
   su nombre, desde la primera transaccion: si se empieza a registrar
   despues, las primeras ventas -justo las que demuestran que la
   relacion valia- se quedan sin atribuir para siempre.

   Lo que NO se hace es asignarle porcentaje ni calcular pago alguno.
   La politica de originadores no existe todavia (ver
   src/data/economia-red.ts). Registrar no es pagar, y el guardian de
   economia-red rompe el build si alguien escribe un porcentaje sin
   politica detras.
   ============================================================ */

import { calculaEconomia, REGLA, type Economia } from './economia-red.ts';
import { PILOTO, selloColombiano, type EstadoReferido } from './piloto-la-triada.ts';

/* ------------------------------------------------------------
   DE DONDE VINO

   La fuente no es analitica: es lo que permite decirle a La Triada
   "de las 40 activaciones, 12 salieron del articulo del blog". Sin
   esto, el informe del aliado solo puede contar totales.
   ------------------------------------------------------------ */
export type Fuente =
  | 'ficha-la-triada'
  | 'guia-restaurantes'
  | 'blog'
  | 'hospedaje'
  | 'qr-local'
  | 'directo';

export const ETIQUETA_FUENTE: Record<Fuente, string> = {
  'ficha-la-triada': 'Ficha de La Triada',
  'guia-restaurantes': 'Guía de restaurantes',
  blog: 'Blog',
  hospedaje: 'Huésped de Atheron',
  'qr-local': 'QR físico en La Triada',
  directo: 'Entrada directa',
};

export const esFuente = (v: unknown): v is Fuente =>
  typeof v === 'string' && v in ETIQUETA_FUENTE;

/* ------------------------------------------------------------
   LA TRANSACCION
   ------------------------------------------------------------ */
export interface Consentimiento {
  /** true solo si la persona lo marco. Nunca por defecto. */
  seguimiento: boolean;
  /** WhatsApp en formato internacional. Solo con seguimiento: true. */
  contacto?: string;
  /** Cuando lo dio. Un consentimiento sin fecha no se puede auditar. */
  sello?: string;
}

export interface Seguimiento {
  /** 1 a 5. Sin escala rara: cinco caras es lo que entiende cualquiera. */
  satisfaccion?: number;
  /** Texto libre de quien visito. Se guarda tal cual, sin analizar. */
  comentario?: string;
  /** true si hubo un problema que Atheron tiene que atender. */
  incidencia?: boolean;
  sello: string;
}

export interface Transaccion {
  /** ATH-TRI-XXXXX. Es la clave: una transaccion por codigo. */
  codigo: string;
  piloto: string;
  aliado: string;
  fuente: Fuente;
  /** Quien origino la relacion comercial con el aliado. Sin importe. */
  originador?: string;

  estado: EstadoReferido;
  activadoEn: string;
  redimidoEn?: string;

  /** Personas previstas al activar; las reales las pone el local. */
  personasPrevistas?: number;
  personas?: number;

  /** Solo en REDIMIDO. */
  economia?: Economia;

  consentimiento: Consentimiento;
  seguimiento?: Seguimiento;

  /** Nota interna del local. No es del cliente. */
  nota?: string;
}

/* ------------------------------------------------------------
   CREACION Y VALIDACION

   Las dos funciones de abajo las usan el navegador Y la API. Que
   sean las mismas no es elegancia: es que una validacion que solo
   corre en el cliente no valida nada, y una que solo corre en el
   servidor obliga a mandar el dato para enterarse de que estaba mal.
   ------------------------------------------------------------ */
export const ORIGINADOR_LA_TRIADA = 'Josué';

/** Tope de personas por activacion. Mas que esto es un evento, no una mesa. */
export const MAX_PERSONAS = 60;

export interface DatosActivacion {
  codigo: string;
  fuente?: Fuente;
  personasPrevistas?: number;
  consentimiento?: Consentimiento;
  ahora?: Date;
}

export function creaActivacion(datos: DatosActivacion): Transaccion {
  const ahora = datos.ahora ?? new Date();
  const consiente = datos.consentimiento?.seguimiento === true;
  const contacto = consiente ? normalizaContacto(datos.consentimiento?.contacto) : undefined;

  return {
    codigo: datos.codigo,
    piloto: PILOTO.id,
    aliado: PILOTO.slugAliado,
    fuente: datos.fuente && esFuente(datos.fuente) ? datos.fuente : 'directo',
    originador: ORIGINADOR_LA_TRIADA,
    estado: 'ACTIVADO',
    activadoEn: selloColombiano(ahora),
    personasPrevistas: personasValidas(datos.personasPrevistas),
    /* Sin consentimiento no se guarda contacto. Y con consentimiento
       pero sin numero, tampoco se marca que lo haya: seria un
       consentimiento que no sirve para nada y ensucia el recuento. */
    consentimiento: contacto
      ? { seguimiento: true, contacto, sello: selloColombiano(ahora) }
      : { seguimiento: false },
  };
}

const personasValidas = (n: unknown): number | undefined => {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= MAX_PERSONAS ? v : undefined;
};

/** Deja el WhatsApp en digitos con indicativo. Sin indicativo, se asume Colombia. */
export function normalizaContacto(bruto?: string): string | undefined {
  if (!bruto) return undefined;
  const digitos = bruto.replace(/\D+/g, '');
  if (digitos.length < 7 || digitos.length > 15) return undefined;
  return digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
}

export type MotivoRechazo =
  | 'CODIGO_INVALIDO'
  | 'NO_EXISTE'
  | 'YA_REDIMIDA'
  | 'CERRADA'
  | 'CADUCADA'
  | 'CONSUMO_INVALIDO'
  | 'PERSONAS_INVALIDAS';

export const EXPLICACION_RECHAZO: Record<MotivoRechazo, string> = {
  CODIGO_INVALIDO: 'Ese código no está bien copiado. Vuelve a leerlo del móvil.',
  NO_EXISTE: 'Ese código no está activado. Pide al cliente que lo active y vuelve a escanear.',
  YA_REDIMIDA: 'Este código ya se usó. Solo vale una vez.',
  CERRADA: 'Este código se cerró sin consumo.',
  CADUCADA: 'Este código caducó: vale hasta el final del día en que se activa.',
  CONSUMO_INVALIDO: 'Escribe el valor de la cuenta, sin puntos ni comas.',
  PERSONAS_INVALIDAS: `El número de personas tiene que estar entre 1 y ${MAX_PERSONAS}.`,
};

export interface Resultado {
  ok: boolean;
  motivo?: MotivoRechazo;
  transaccion?: Transaccion;
}

/** Tope de consumo. Por encima, casi seguro son centavos o un dedo de mas. */
export const MAX_CONSUMO = 50_000_000;

/**
 * Cierra una transaccion con consumo. Devuelve una copia: la original
 * no se toca, para que quien la llame no pueda dejar a medias un
 * registro que luego se guarda.
 */
export function redime(
  transaccion: Transaccion,
  consumo: number,
  opciones: { personas?: number; nota?: string; ahora?: Date } = {},
): Resultado {
  /* El orden importa: primero lo que ya no tiene arreglo (ya usada,
     cerrada), y solo despues lo que quien atiende puede corregir. */
  if (transaccion.estado === 'REDIMIDO') return { ok: false, motivo: 'YA_REDIMIDA', transaccion };
  if (transaccion.estado === 'NO_REDIMIDO') return { ok: false, motivo: 'CERRADA', transaccion };

  const valor = Number(consumo);
  if (!Number.isFinite(valor) || valor <= 0 || valor > MAX_CONSUMO) {
    return { ok: false, motivo: 'CONSUMO_INVALIDO' };
  }
  if (opciones.personas !== undefined && personasValidas(opciones.personas) === undefined) {
    return { ok: false, motivo: 'PERSONAS_INVALIDAS' };
  }

  const ahora = opciones.ahora ?? new Date();
  return {
    ok: true,
    transaccion: {
      ...transaccion,
      estado: 'REDIMIDO',
      redimidoEn: selloColombiano(ahora),
      personas: personasValidas(opciones.personas) ?? transaccion.personasPrevistas,
      economia: calculaEconomia(valor, REGLA),
      nota: opciones.nota?.trim() || undefined,
    },
  };
}

/** Cierra sin consumo. Es un desenlace valido, no un error. */
export function cierraSinConsumo(transaccion: Transaccion, ahora = new Date()): Resultado {
  if (transaccion.estado === 'REDIMIDO') return { ok: false, motivo: 'YA_REDIMIDA', transaccion };
  return {
    ok: true,
    transaccion: { ...transaccion, estado: 'NO_REDIMIDO', redimidoEn: selloColombiano(ahora) },
  };
}

export function anotaSeguimiento(
  transaccion: Transaccion,
  seguimiento: Omit<Seguimiento, 'sello'>,
  ahora = new Date(),
): Transaccion {
  const satisfaccion =
    Number.isInteger(seguimiento.satisfaccion) &&
    (seguimiento.satisfaccion as number) >= 1 &&
    (seguimiento.satisfaccion as number) <= 5
      ? seguimiento.satisfaccion
      : undefined;
  return {
    ...transaccion,
    seguimiento: {
      satisfaccion,
      comentario: seguimiento.comentario?.trim().slice(0, 500) || undefined,
      incidencia: seguimiento.incidencia === true,
      sello: selloColombiano(ahora),
    },
  };
}

/* ------------------------------------------------------------
   LA FILA DE CONCILIACION

   Sigue siendo una linea por transaccion, separada por "|", porque
   sigue teniendo que poder pegarse en una hoja. Lo que cambia es que
   ahora la escribe el servidor a partir de su propio registro, no
   una persona copiando de un chat.

   NO LLEVA EL CONTACTO. La conciliacion es de dinero: el telefono de
   nadie pinta nada ahi, y una hoja que circula entre dos empresas es
   el ultimo sitio donde debe acabar un dato personal.
   ------------------------------------------------------------ */
export const CABECERA_CONCILIACION =
  'piloto|codigo|aliado|fuente|originador|activado|redimido|estado|personas|consumo_cop|comision_pct|comision_cop|credito_cop|margen_cop|satisfaccion|incidencia';

const limpio = (t: string): string => t.replace(/[|\r\n]+/g, ' ').trim();

export function filaConciliacion(t: Transaccion): string {
  const e = t.economia;
  return [
    t.piloto,
    t.codigo,
    t.aliado,
    t.fuente,
    limpio(t.originador ?? ''),
    t.activadoEn,
    t.redimidoEn ?? '',
    t.estado,
    t.personas ?? t.personasPrevistas ?? '',
    e?.consumo ?? '',
    e?.comisionPct ?? '',
    e?.comision ?? '',
    e?.credito ?? '',
    e?.margen ?? '',
    t.seguimiento?.satisfaccion ?? '',
    t.seguimiento?.incidencia ? 'SI' : '',
  ].join('|');
}
