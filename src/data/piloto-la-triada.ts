/* ============================================================
   PILOTO ATHERON x LA TRIADA — ATH-PILOT-001

   QUE ES

   El primer LOOP real de la Red Atheron: un huesped sale de Atheron,
   activa un beneficio, se identifica en La Triada con un codigo,
   consume, se le aplica el descuento y queda constancia de que ese
   consumo vino de Atheron.

     Atheron -> ficha -> activar -> ATH-TRI-XXXXX -> validacion
     -> consumo -> descuento -> REDIMIDO -> trazabilidad

   Esta pensado para que el CEO lo recorra con su propio movil el
   miercoles 23 de septiembre de 2026, en el local, como un cliente
   mas.

   ============================================================
   LO PRIMERO: ESTO NO ESTA PUBLICADO, Y NO SE PUBLICA SOLO
   ============================================================

   Las tres paginas del piloto salen con noindex,nofollow, fuera del
   sitemap y SIN un solo enlace desde el sitio publico. Se llega por
   la direccion directa o por el QR impreso, y nada mas. La ficha
   publica de La Triada no cambia ni una palabra.

   El interruptor es ENLAZADO_EN_FICHA, aqui abajo, y esta en false.
   No se pone en true sin que se cumplan las dos condiciones que
   estan escritas junto a el.

   ============================================================
   EL 10% NO ESTA CONFIRMADO. NO SE PUBLICA NINGUNA CIFRA
   ============================================================

   La orden del CEO fija el 10% como OBJETIVO del piloto. Objetivo no
   es acuerdo. Mientras no conste evidencia verificable -quien lo
   acordo, cuando, sobre que base, con que exclusiones y hasta
   cuando-, en este repositorio NO aparece ningun porcentaje, y las
   paginas no anuncian ninguna condicion.

   Lo que si esta construido es el mecanismo entero: el dia que el
   acuerdo conste, se rellena BENEFICIO con su porcentaje, su
   vigencia y su evidencia, se cambia estado a 'VERIFICADO', y el
   bloque publico aparece solo. Ni maqueta ni CSS cambian.

   Mientras tanto el porcentaje lo teclea a mano quien valida, en el
   momento, y queda escrito en el registro como lo que es: lo que se
   aplico de verdad en esa mesa, no una condicion anunciada por
   Atheron. La diferencia no es de matiz: anunciar un 10% que el
   local no ha aceptado es una promesa que paga el aliado.

   El guardian de abajo hace que esto no dependa de la memoria de
   nadie: si alguien escribe un porcentaje sin poner la evidencia, la
   construccion FALLA. Un aviso se ignora; un build roto, no.

   ============================================================
   QUE SOSTIENE UN SITIO ESTATICO, Y QUE NO
   ============================================================

   No hay servidor, ni base de datos, ni Odoo conectado. Por tanto:

   SI se sostiene
     - Generar un identificador con caracter de control.
     - Comprobar en el local que el codigo esta bien copiado.
     - Calcular el descuento sobre el consumo real.
     - Dejar el registro por WhatsApp, que es el canal que si
       responde, en un formato que luego se importa a Odoo.
     - Guardar el estado en el navegador para que el huesped vea su
       codigo y el local vea lo que acaba de registrar.

   NO se sostiene, y por eso no se promete
     - Unicidad garantizada del codigo (no hay registro central).
     - Que el estado de un movil se vea en otro: el localStorage es
       de cada dispositivo. El huesped tiene ACTIVADO en el suyo; el
       local registra la redencion en el suyo. NO se sincronizan.
     - Autenticidad: el calculo del caracter de control es publico.
     - Que borrar los datos del navegador no borre el registro. Por
       eso el registro que cuenta es el mensaje de WhatsApp.

   La fuente de verdad del piloto es la conversacion de WhatsApp de
   Atheron mas la hoja de control. El navegador es comodidad, no
   contabilidad.
   ============================================================ */

import { NUMERO } from './whatsapp.ts';

/* ------------------------------------------------------------
   IDENTIDAD DEL PILOTO
   ------------------------------------------------------------ */
export const PILOTO = {
  /** El mismo identificador de la orden y del Issue #48. */
  id: 'ATH-PILOT-001',
  aliado: 'La Triada',
  slugAliado: 'la-triada',
  /** Las tres letras que van dentro del codigo: ATH-TRI-XXXXX. */
  codigoAliado: 'TRI',
  /** Dia de la prueba fisica del CEO. */
  fechaPrueba: '2026-09-23',
  rutas: {
    activar: '/piloto/la-triada',
    validar: '/piloto/la-triada/validar',
    registro: '/piloto/la-triada/registro',
  },
} as const;

/* ------------------------------------------------------------
   EL INTERRUPTOR DE PUBLICACION

   En false, la ficha publica de La Triada no menciona el piloto ni
   enlaza a el. Para ponerlo en true hacen falta LAS DOS cosas:

     1. BENEFICIO.estado === 'VERIFICADO' con su evidencia escrita.
     2. Autorizacion expresa de Marlon para publicarlo.

   La primera la comprueba el guardian de abajo. La segunda no la
   puede comprobar ningun programa: es una firma, no un campo.
   ------------------------------------------------------------ */
export const ENLAZADO_EN_FICHA = false;

/* ------------------------------------------------------------
   LA CONDICION COMERCIAL
   ------------------------------------------------------------ */
export type EstadoCondicion = 'PENDIENTE DE VERIFICACIÓN CEO' | 'VERIFICADO';

export interface Beneficio {
  estado: EstadoCondicion;
  /** Porcentaje acordado. null mientras no conste. Nunca se supone. */
  porcentaje: number | null;
  /** Que se acordo exactamente, en una frase publicable. */
  descripcion: string | null;
  /** Sobre que se calcula: "consumo en alimentos", "cuenta total"... */
  base: string | null;
  /** Lo que queda fuera. Un acuerdo sin exclusiones escritas no lo esta. */
  exclusiones: string[] | null;
  vigencia: { desde: string; hasta?: string } | null;
  /** Donde consta. Sin esto, no hay acuerdo que publicar. */
  evidencia: string | null;
}

export const BENEFICIO: Beneficio = {
  estado: 'PENDIENTE DE VERIFICACIÓN CEO',
  porcentaje: null,
  descripcion: null,
  base: null,
  exclusiones: null,
  vigencia: null,
  evidencia: null,
};

/* ------------------------------------------------------------
   EL GUARDIAN

   Corre al importar el modulo, y las tres paginas del piloto lo
   importan: si algo de esto se incumple, "npm run build" falla y no
   se publica nada. Es deliberado que sea un error y no un aviso.
   ------------------------------------------------------------ */
function comprueba(): void {
  const b = BENEFICIO;
  const verificado = b.estado === 'VERIFICADO';

  if (!verificado) {
    const rellenos = (
      [
        ['porcentaje', b.porcentaje],
        ['descripcion', b.descripcion],
        ['base', b.base],
        ['vigencia', b.vigencia],
      ] as const
    ).filter(([, v]) => v !== null && v !== undefined);
    if (rellenos.length) {
      throw new Error(
        `PILOTO ${PILOTO.id}: hay condicion comercial escrita (${rellenos
          .map(([k]) => k)
          .join(', ')}) con estado "${b.estado}". ` +
          'Una condicion no verificada no se publica: o se verifica y se cambia el estado, o se deja en null.',
      );
    }
  }

  if (verificado) {
    const faltan = (
      [
        ['porcentaje', b.porcentaje],
        ['descripcion', b.descripcion],
        ['base', b.base],
        ['exclusiones', b.exclusiones],
        ['vigencia', b.vigencia],
        ['evidencia', b.evidencia],
      ] as const
    ).filter(([, v]) => v === null || v === undefined);
    if (faltan.length) {
      throw new Error(
        `PILOTO ${PILOTO.id}: estado VERIFICADO sin ${faltan.map(([k]) => k).join(', ')}. ` +
          'Verificado significa que consta entero: porcentaje, base, exclusiones, vigencia y donde consta.',
      );
    }
    if (typeof b.porcentaje === 'number' && (b.porcentaje <= 0 || b.porcentaje > 100)) {
      throw new Error(`PILOTO ${PILOTO.id}: porcentaje fuera de rango (${b.porcentaje}).`);
    }
  }

  if (ENLAZADO_EN_FICHA && !verificado) {
    throw new Error(
      `PILOTO ${PILOTO.id}: ENLAZADO_EN_FICHA esta en true con la condicion sin verificar. ` +
        'La ficha publica no enlaza un beneficio que no consta.',
    );
  }
}
comprueba();

/** Lo que las paginas pintan cuando la condicion no consta. */
export const AVISO_CONDICION =
  BENEFICIO.estado === 'VERIFICADO'
    ? null
    : 'Condición comercial: PENDIENTE DE VERIFICACIÓN CEO. Atheron no anuncia aquí ningún ' +
      'porcentaje: el descuento que se aplique lo acuerda y lo teclea el local en el momento, ' +
      'y queda registrado tal cual.';

/* ------------------------------------------------------------
   ESTADOS DEL REFERIDO

   Cuatro, y ni uno mas. Cada uno responde a una pregunta que alguien
   se hace de verdad:

     ACTIVADO     el huesped lo pidio. No prueba que fuera al local.
     VALIDADO     el local comprobo el codigo. Esta en la mesa.
     REDIMIDO     hubo consumo y se aplico el descuento. Es el unico
                  estado que vale como venta atribuida.
     NO_REDIMIDO  se cerro sin consumo, o el codigo caduco.

   NO_REDIMIDO no es un fracaso que esconder: sin el, el piloto solo
   sabria contar exitos y la tasa de conversion seria mentira.
   ------------------------------------------------------------ */
export type EstadoReferido = 'ACTIVADO' | 'VALIDADO' | 'REDIMIDO' | 'NO_REDIMIDO';

export const ETIQUETA_ESTADO: Record<EstadoReferido, string> = {
  ACTIVADO: 'Activado',
  VALIDADO: 'Validado en el local',
  REDIMIDO: 'Redimido',
  NO_REDIMIDO: 'No redimido',
};

/** Que estados pueden venir despues de cada uno. Los finales, ninguno. */
const TRANSICIONES: Record<EstadoReferido, EstadoReferido[]> = {
  ACTIVADO: ['VALIDADO', 'NO_REDIMIDO'],
  VALIDADO: ['REDIMIDO', 'NO_REDIMIDO'],
  REDIMIDO: [],
  NO_REDIMIDO: [],
};

export const puedePasarA = (desde: EstadoReferido, hasta: EstadoReferido): boolean =>
  TRANSICIONES[desde].includes(hasta);

/* ------------------------------------------------------------
   VIGENCIA

   Un codigo vale hasta el final del dia colombiano en que se activo.
   Colombia esta en UTC-5 todo el ano: no hay horario de verano, asi
   que el desfase es una constante y no hace falta ninguna libreria.

   Por que un dia y no una semana: el piloto mide una visita, y un
   codigo que vive indefinidamente convierte "activado" en una cifra
   que no significa nada.
   ------------------------------------------------------------ */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

/** AAAA-MM-DD del instante dado, en hora de Colombia. */
export function diaColombiano(instante: Date): string {
  return new Date(instante.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}

/** El instante en que caduca un codigo activado en ese momento. */
export function caducaEl(activadoEn: Date): Date {
  const [a, m, d] = diaColombiano(activadoEn).split('-').map(Number);
  /* 23:59:59.999 en Colombia = 04:59:59.999 UTC del dia siguiente. */
  return new Date(Date.UTC(a, m - 1, d + 1, 4, 59, 59, 999));
}

export const estaVigente = (activadoEn: Date, ahora: Date): boolean =>
  ahora.getTime() <= caducaEl(activadoEn).getTime();

/** "2026-09-23T13:40:05-05:00". Con el desfase escrito, no supuesto. */
export function selloColombiano(instante: Date): string {
  const local = new Date(instante.getTime() - DESFASE_COLOMBIA_MS);
  return `${local.toISOString().slice(0, 19)}-05:00`;
}

/* ------------------------------------------------------------
   DINERO

   Pesos colombianos, sin decimales: el peso no los usa en la
   practica y arrastrar centavos solo produce descuadres de uno.
   El descuento se redondea al peso mas cercano y el total se calcula
   restando, nunca aplicando el porcentaje dos veces.
   ------------------------------------------------------------ */
export interface Cuenta {
  consumo: number;
  porcentaje: number;
  descuento: number;
  total: number;
}

export function calculaCuenta(consumo: number, porcentaje: number): Cuenta {
  if (!Number.isFinite(consumo) || consumo < 0) throw new Error('Consumo no valido.');
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    throw new Error('Porcentaje no valido.');
  }
  const base = Math.round(consumo);
  const descuento = Math.round((base * porcentaje) / 100);
  return { consumo: base, porcentaje, descuento, total: base - descuento };
}

/** "120000" -> "$ 120.000". Formato colombiano, sin depender del navegador. */
export function pesos(valor: number): string {
  const entero = Math.round(Math.abs(valor)).toString();
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}$ ${conPuntos}`;
}

/* ------------------------------------------------------------
   EL REGISTRO

   Una linea por movimiento. Es lo que se copia a la hoja de control
   y lo que despues se importa a Odoo (ver docs/piloto-la-triada.md,
   donde esta el mapeo campo a campo).

   Separador "|" y no ",": las observaciones llevan comas y un CSV
   con comas obliga a entrecomillar, que es justo lo que se rompe al
   pegar a mano en una hoja.
   ------------------------------------------------------------ */
export interface Movimiento {
  piloto: string;
  codigo: string;
  aliado: string;
  /** Sello con hora de Colombia. */
  sello: string;
  estado: EstadoReferido;
  /** Solo en REDIMIDO. En el resto, vacios. */
  consumo?: number;
  porcentaje?: number;
  descuento?: number;
  total?: number;
  nota?: string;
}

export const CABECERA_REGISTRO =
  'piloto|codigo|aliado|sello|estado|consumo_cop|descuento_pct|descuento_cop|total_cop|nota';

/** Ni saltos de linea ni "|" dentro de un campo: romperian la fila. */
const limpio = (texto: string): string => texto.replace(/[|\r\n]+/g, ' ').trim();

export function lineaRegistro(m: Movimiento): string {
  return [
    m.piloto,
    m.codigo,
    m.aliado,
    m.sello,
    m.estado,
    m.consumo ?? '',
    m.porcentaje ?? '',
    m.descuento ?? '',
    m.total ?? '',
    limpio(m.nota ?? ''),
  ].join('|');
}

/* ------------------------------------------------------------
   MENSAJES DE WHATSAPP — el registro que si perdura

   Van en lineas sueltas y con las etiquetas siempre iguales, para
   que se puedan leer de un vistazo en el movil Y analizar despues
   sin reescribirlos. La ultima linea es la fila del registro, tal
   cual: se copia del chat a la hoja sin tocar nada.
   ------------------------------------------------------------ */
export function mensajeValidacion(m: Movimiento): string {
  return (
    `Piloto ${m.piloto} — validación en ${m.aliado}\n\n` +
    `Código: ${m.codigo}\n` +
    `Estado: ${ETIQUETA_ESTADO.VALIDADO}\n` +
    `Momento: ${m.sello}\n` +
    (m.nota ? `Nota: ${limpio(m.nota)}\n` : '') +
    `\n${lineaRegistro(m)}`
  );
}

export function mensajeRedencion(m: Movimiento): string {
  const cuenta =
    m.consumo === undefined
      ? ''
      : `Consumo: ${pesos(m.consumo)}\n` +
        `Descuento aplicado: ${m.porcentaje ?? 0}% (${pesos(m.descuento ?? 0)})\n` +
        `Total cobrado: ${pesos(m.total ?? 0)}\n`;
  return (
    `Piloto ${m.piloto} — redención en ${m.aliado}\n\n` +
    `Código: ${m.codigo}\n` +
    `Estado: ${ETIQUETA_ESTADO[m.estado]}\n` +
    `Momento: ${m.sello}\n` +
    cuenta +
    (m.nota ? `Nota: ${limpio(m.nota)}\n` : '') +
    '\nEl porcentaje es el que aplicó el local en la mesa.\n' +
    `\n${lineaRegistro(m)}`
  );
}

export const enlaceWhatsAppPiloto = (mensaje: string): string =>
  `https://wa.me/${NUMERO}?text=${encodeURIComponent(mensaje)}`;

/* ------------------------------------------------------------
   ALMACEN LOCAL

   Una sola clave, con version en el nombre: el dia que cambie la
   forma del registro, el nombre cambia y ningun navegador se queda
   leyendo algo que ya no entiende.
   ------------------------------------------------------------ */
export const CLAVE_ALMACEN = 'atheron.piloto.ath-pilot-001.v1';

/** Lo que registra el local: una lista de movimientos, en ese aparato. */
export const CLAVE_REGISTRO = 'atheron.piloto.ath-pilot-001.registro.v1';
