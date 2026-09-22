/* ============================================================
   TRANSACCIONES DE LA RED — el modelo de datos de ATH-LOOP-002

   QUE ES

   Lo que se registra de una visita, de punta a punta: activacion,
   redencion, seguimiento y el credito que sale de ahi. Es el mismo
   objeto en el navegador, en la API y en el informe, y por eso vive
   en un solo archivo: tres definiciones parecidas de la misma cosa
   terminan divergiendo en el campo que importa.

   ============================================================
   QUE CAMBIO TRAS LA AUDITORIA
   ============================================================

   1. VERSION. Cada transaccion la lleva, y cada cambio la sube. Es
      lo que permite escribir con compare-and-set en vez de con un
      cerrojo, y lo que impide que una redencion y un cierre
      simultaneos se pisen.

   2. EVENTOS APPEND-ONLY. Antes, redimir sobrescribia el estado y
      la historia se perdia. Ahora cada paso deja su linea, con su
      sello. Una liquidacion que alguien discute tres semanas
      despues se contesta leyendo, no deduciendo.

   3. LA REGLA APLICADA VIAJA DENTRO. El informe reconstruye cada
      fila con los porcentajes que se usaron ENTONCES, no con los de
      hoy. Sin esto, cambiar el reparto reescribiria el pasado.

   4. VALIDACION ESTRICTA. Number() aceptaba true, [100000] y "1e3"
      como importes. Ahora todo pasa por src/data/validacion.ts.

   5. EL SEGUIMIENTO NO BORRA. Una segunda respuesta vacia ya no
      deja en blanco lo que el cliente habia escrito.

   ============================================================
   MINIMIZACION DE DATOS: LO QUE NO SE GUARDA
   ============================================================

   No hay nombre, ni correo, ni documento, ni mesa, ni nada que
   identifique a una persona, SALVO un contacto de WhatsApp y solo
   si esa persona lo dio a proposito para que le escriban. Sin ese
   consentimiento el campo no existe: no se guarda "por si acaso".

   Un piloto que empieza guardando telefonos "para luego" acaba con
   una lista que nadie sabe de donde salio ni para que sirve.

   El numero de personas SI se guarda: le importa al aliado para
   preparar mesa, y no identifica a nadie.

   ============================================================
   EL ORIGINADOR COMERCIAL
   ============================================================

   La relacion con La Triada la origino Josue. Eso se REGISTRA desde
   la primera transaccion: si se empieza a registrar despues, las
   primeras ventas -las que demuestran que la relacion valia- se
   quedan sin atribuir para siempre.

   Lo que NO se hace es asignarle porcentaje ni calcular pago. No hay
   politica de originadores, y el guardian de economia-red.ts rompe
   el build si alguien escribe uno. Registrar no es pagar.
   ============================================================ */

import { calculaEconomia, instantanea, type Economia, type ReglaAplicable } from './economia-red.ts';
import { PILOTO, selloColombiano, type EstadoReferido } from './piloto-la-triada.ts';
import { entero, esClaveDe, pesosEnteros, texto, type Fallo } from './validacion.ts';

/* ------------------------------------------------------------
   DE DONDE VINO
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

/* Object.hasOwn y no "in": con "in", cadenas como "constructor" o
   "toString" darian true y se colarian como fuentes validas. */
export const esFuente = (v: unknown): v is Fuente => esClaveDe(ETIQUETA_FUENTE, v);

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
  /** 1 a 5. Cinco caras es lo que entiende cualquiera. */
  satisfaccion?: number;
  comentario?: string;
  incidencia?: boolean;
  sello: string;
}

export type TipoEvento = 'ACTIVADA' | 'REDIMIDA' | 'CERRADA' | 'SEGUIMIENTO' | 'CREDITO';

export interface Evento {
  tipo: TipoEvento;
  sello: string;
  /** Lo justo para reconstruir: nunca datos personales. */
  detalle?: string;
}

export interface Transaccion {
  /** Igual al codigo. Lo exige el almacen, que indexa por id. */
  id: string;
  /** Sube en cada cambio. Es la base del compare-and-set. */
  version: number;

  codigo: string;
  piloto: string;
  aliado: string;
  fuente: Fuente;
  /** Quien origino la relacion comercial con el aliado. Sin importe. */
  originador?: string;

  estado: EstadoReferido;
  activadoEn: string;
  redimidoEn?: string;

  personasPrevistas?: number;
  personas?: number;

  /* La regla que se le mostro al cliente AL ACTIVAR. La redencion
     usa esta, no la configuracion del momento: el trato se cierra
     cuando el cliente acepta, no cuando el local cobra. */
  regla: ReglaAplicable;

  /** Solo en REDIMIDO. Lleva dentro la regla con la que se calculo. */
  economia?: Economia;
  /** El credito que genero esta venta, si lo genero. */
  creditoId?: string;

  consentimiento: Consentimiento;
  seguimiento?: Seguimiento;

  /** Nota interna del local. Nunca sale hacia el cliente. */
  nota?: string;

  /** Historia. Solo crece. */
  eventos: Evento[];
}

export const ORIGINADOR_LA_TRIADA = 'Josué';
export const MAX_PERSONAS = 60;
/** Tope de consumo en pesos. Por encima es un dedo de más. */
export const MAX_CONSUMO = 50_000_000;

/* ------------------------------------------------------------
   CREAR
   ------------------------------------------------------------ */
export interface DatosActivacion {
  codigo: string;
  fuente?: unknown;
  personasPrevistas?: unknown;
  consentimiento?: { seguimiento?: boolean; contacto?: string };
  ahora?: Date;
}

export function creaActivacion(datos: DatosActivacion): Transaccion {
  const ahora = datos.ahora ?? new Date();
  const sello = selloColombiano(ahora);
  const consiente = datos.consentimiento?.seguimiento === true;
  const contacto = consiente ? normalizaContacto(datos.consentimiento?.contacto) : undefined;
  const personas = entero(datos.personasPrevistas, 1, MAX_PERSONAS).valor;

  return {
    id: datos.codigo,
    version: 1,
    codigo: datos.codigo,
    piloto: PILOTO.id,
    aliado: PILOTO.slugAliado,
    fuente: esFuente(datos.fuente) ? datos.fuente : 'directo',
    originador: ORIGINADOR_LA_TRIADA,
    estado: 'ACTIVADO',
    activadoEn: sello,
    regla: instantanea(),
    personasPrevistas: personas,
    /* Sin consentimiento no se guarda contacto. Y con consentimiento
       pero sin numero tampoco se marca que lo haya: seria un
       consentimiento que no sirve para nada y ensucia el recuento. */
    consentimiento: contacto ? { seguimiento: true, contacto, sello } : { seguimiento: false },
    eventos: [{ tipo: 'ACTIVADA', sello, detalle: esFuente(datos.fuente) ? datos.fuente : 'directo' }],
  };
}

/** Deja el WhatsApp en digitos con indicativo. Sin indicativo, se asume Colombia. */
export function normalizaContacto(bruto?: unknown): string | undefined {
  const leido = texto(bruto, 25);
  if (!leido.valor) return undefined;
  const digitos = leido.valor.replace(/\D+/g, '');
  if (digitos.length < 7 || digitos.length > 15) return undefined;
  return digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
}

/* ------------------------------------------------------------
   TRANSICIONES

   Todas devuelven una COPIA con la version subida y su evento
   anadido. Quien llame la escribe con compare-and-set: si otro llego
   antes, el almacen responde CONFLICTO y aqui no se ha tocado nada.
   ------------------------------------------------------------ */
export type MotivoRechazo =
  | 'CODIGO_INVALIDO'
  | 'NO_EXISTE'
  | 'YA_REDIMIDA'
  | 'CERRADA'
  | 'CADUCADA'
  | 'CONSUMO_INVALIDO'
  | 'PERSONAS_INVALIDAS'
  | 'CONFLICTO';

export const EXPLICACION_RECHAZO: Record<MotivoRechazo, string> = {
  CODIGO_INVALIDO: 'Ese código no está bien copiado. Vuelve a leerlo del móvil.',
  NO_EXISTE: 'Ese código no está activado. Pide al cliente que lo active y vuelve a escanear.',
  YA_REDIMIDA: 'Este código ya se usó. Solo vale una vez.',
  CERRADA: 'Este código se cerró sin consumo.',
  CADUCADA: 'Este código caducó: vale hasta el final del día en que se activa.',
  CONSUMO_INVALIDO: 'Escribe el valor de la cuenta en pesos enteros, sin puntos ni centavos.',
  PERSONAS_INVALIDAS: `El número de personas tiene que estar entre 1 y ${MAX_PERSONAS}.`,
  CONFLICTO: 'Otro dispositivo estaba registrando esta misma cuenta. Vuelve a consultarla.',
};

export interface Resultado {
  ok: boolean;
  motivo?: MotivoRechazo;
  transaccion?: Transaccion;
}

/** Traduce un fallo de validacion al motivo que entiende quien atiende. */
const porFallo = (fallo: Fallo | undefined, invalido: MotivoRechazo): MotivoRechazo =>
  fallo ? invalido : invalido;

export interface OpcionesRedencion {
  personas?: unknown;
  nota?: unknown;
  ahora?: Date;
  /** Credito generado por esta venta, si lo hay. */
  creditoId?: string;
}

export function redime(transaccion: Transaccion, consumoBruto: unknown, opciones: OpcionesRedencion = {}): Resultado {
  /* Primero lo que ya no tiene arreglo, despues lo que quien atiende
     puede corregir: el mensaje util es el segundo. */
  if (transaccion.estado === 'REDIMIDO') return { ok: false, motivo: 'YA_REDIMIDA', transaccion };
  if (transaccion.estado === 'NO_REDIMIDO') return { ok: false, motivo: 'CERRADA', transaccion };

  const consumo = pesosEnteros(consumoBruto, MAX_CONSUMO);
  if (consumo.valor === undefined) {
    return { ok: false, motivo: porFallo(consumo.fallo, 'CONSUMO_INVALIDO') };
  }

  let personas = transaccion.personasPrevistas;
  if (opciones.personas !== undefined && opciones.personas !== null && opciones.personas !== '') {
    const leidas = entero(opciones.personas, 1, MAX_PERSONAS);
    if (leidas.valor === undefined) return { ok: false, motivo: 'PERSONAS_INVALIDAS' };
    personas = leidas.valor;
  }

  const ahora = opciones.ahora ?? new Date();
  const sello = selloColombiano(ahora);
  /* La regla de la activacion, no la de ahora. Si falta -una
     transaccion escrita antes de que esto existiera-, se cae a la
     vigente y el informe lo vera como regla distinta, que es
     exactamente lo que hay que ver. */
  const economia = calculaEconomia(consumo.valor, transaccion.regla ?? instantanea());

  const eventos: Evento[] = [
    ...transaccion.eventos,
    { tipo: 'REDIMIDA', sello, detalle: `consumo=${economia.consumo} regla=${economia.reglaVersion}` },
  ];
  if (opciones.creditoId) {
    eventos.push({ tipo: 'CREDITO', sello, detalle: `${opciones.creditoId}=${economia.credito}` });
  }

  return {
    ok: true,
    transaccion: {
      ...transaccion,
      version: transaccion.version + 1,
      estado: 'REDIMIDO',
      redimidoEn: sello,
      personas,
      economia,
      creditoId: opciones.creditoId,
      nota: texto(opciones.nota, 200).valor,
      eventos,
    },
  };
}

/**
 * Cierra sin consumo. Es un desenlace valido, no un error.
 * Una venta ya confirmada NUNCA se cierra: la auditoria reprodujo
 * exactamente eso, y aqui se corta antes de tocar nada.
 */
export function cierraSinConsumo(transaccion: Transaccion, ahora = new Date()): Resultado {
  if (transaccion.estado === 'REDIMIDO') return { ok: false, motivo: 'YA_REDIMIDA', transaccion };
  if (transaccion.estado === 'NO_REDIMIDO') return { ok: false, motivo: 'CERRADA', transaccion };
  const sello = selloColombiano(ahora);
  return {
    ok: true,
    transaccion: {
      ...transaccion,
      version: transaccion.version + 1,
      estado: 'NO_REDIMIDO',
      redimidoEn: sello,
      eventos: [...transaccion.eventos, { tipo: 'CERRADA', sello }],
    },
  };
}

/**
 * Anota la opinion del cliente. FUSIONA: una segunda respuesta vacia
 * no borra lo que ya habia. La auditoria encontro justo eso, y el
 * dano no es tecnico: es que el cliente escribio una queja y una
 * peticion posterior la dejaba en blanco sin que nadie lo supiera.
 */
export function anotaSeguimiento(
  transaccion: Transaccion,
  entrada: { satisfaccion?: unknown; comentario?: unknown; incidencia?: unknown },
  ahora = new Date(),
): Transaccion {
  const previo = transaccion.seguimiento;
  const nota = entero(entrada.satisfaccion, 1, 5).valor ?? previo?.satisfaccion;
  const comentario = texto(entrada.comentario, 500).valor ?? previo?.comentario;
  /* La incidencia solo se enciende, nunca se apaga desde fuera:
     quien dijo que tuvo un problema no deja de haberlo tenido
     porque llegue otra peticion. Apagarla es trabajo de Atheron. */
  const incidencia = entrada.incidencia === true || previo?.incidencia === true;
  const sello = selloColombiano(ahora);

  return {
    ...transaccion,
    version: transaccion.version + 1,
    seguimiento: { satisfaccion: nota, comentario, incidencia, sello },
    eventos: [
      ...transaccion.eventos,
      { tipo: 'SEGUIMIENTO', sello, detalle: `satisfaccion=${nota ?? '-'} incidencia=${incidencia ? 'si' : 'no'}` },
    ],
  };
}

/* ------------------------------------------------------------
   LA FILA DE CONCILIACION

   Una linea por transaccion, separada por "|" -las observaciones
   llevan comas, y un CSV con comas obliga a entrecomillar, que es
   justo lo que se rompe al pegar en una hoja-.

   NO LLEVA EL CONTACTO. La conciliacion es de dinero: el telefono de
   nadie pinta nada ahi, y una hoja que circula entre dos empresas es
   el ultimo sitio donde debe acabar un dato personal.

   SI LLEVA la version de la regla: sin ella, una fila de hace un mes
   no se puede recalcular.
   ------------------------------------------------------------ */
export const CABECERA_CONCILIACION =
  'piloto|codigo|aliado|fuente|originador|activado|redimido|estado|personas|consumo_cop|comision_pct|comision_cop|credito_cop|margen_cop|regla|credito_id|satisfaccion|incidencia';

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
    e?.reglaVersion ?? '',
    t.creditoId ?? '',
    t.seguimiento?.satisfaccion ?? '',
    t.seguimiento?.incidencia ? 'SI' : '',
  ].join('|');
}
