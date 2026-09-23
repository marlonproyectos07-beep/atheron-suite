/* ============================================================
   ECONOMIA DE LA RED ATHERON — ATH-LOOP-002

   QUE CAMBIA RESPECTO AL PILOTO TECNICO (ATH-PILOT-001)

   En el piloto no habia condicion confirmada, asi que el porcentaje
   lo tecleaba el local y no se anunciaba nada. Ahora el CEO ha
   confirmado la condicion, y ademas ha cambiado de naturaleza:

     ANTES (supuesto):  10% de descuento al cliente.
     AHORA (confirmado): 10% de COMISION de La Triada a Atheron.

   No es un matiz. Con descuento, el cliente paga 90.000 de una
   cuenta de 100.000. Con comision, el cliente paga 100.000 y La
   Triada le debe 10.000 a Atheron. El dinero sale del mismo sitio
   pero la cuenta del restaurante, la factura y lo que ve el cliente
   son distintos, y confundirlos produce un descuadre que nadie
   detecta hasta la conciliacion.

   ============================================================
   EL REPARTO DE ESA COMISION ES HIPOTESIS, NO POLITICA
   ============================================================

   Direccion quiere PROBAR este reparto:

     5% del consumo -> Credito Atheron para el cliente
     5% del consumo -> margen bruto de Atheron

   La orden dice, literalmente, que no se convierta todavia en
   politica permanente. Por eso vive aqui como un parametro con su
   estado al lado, y no como un numero suelto repartido por el
   codigo: cambiarlo el dia que direccion decida otra cosa es tocar
   una linea, no buscar cinco.

   Mientras el reparto siga en HIPOTESIS:

     - las paginas del piloto siguen siendo internas y sin enlazar;
     - el credito se calcula y se registra, pero no se publica como
       promesa en ninguna pagina del sitio publico.

   La comision en si (el 10%) SI esta confirmada, y por eso el local
   ya no tiene que teclear ningun porcentaje.

   ============================================================
   POR QUE LA SUMA TIENE QUE CUADRAR, Y LO COMPRUEBA UN GUARDIAN
   ============================================================

   Credito + margen tienen que dar exactamente la comision. Si no,
   Atheron estaria regalando mas de lo que cobra -o quedandose mas de
   lo acordado- y el error viviria en silencio dentro de cada
   transaccion. El guardian de abajo rompe la construccion: un aviso
   se ignora, un build roto no.
   ============================================================ */

/** Que respaldo tiene cada cifra. No se mezclan. */
export type EstadoRegla =
  | 'CONFIRMADA POR CEO'
  | 'HIPÓTESIS — NO ES POLÍTICA'
  | 'PENDIENTE POLÍTICA CEO';

export interface ReglaEconomica {
  /* Identificador estable de ESTA version de la regla. Cada
     transaccion guarda el suyo, y el informe reconstruye la historia
     con la regla que se aplico entonces, no con la de hoy. Cambiar
     un porcentaje sin cambiar esto reescribiria el pasado. */
  version: string;
  /** Comision del aliado a Atheron, en % del consumo bruto. */
  comisionPct: number;
  estadoComision: EstadoRegla;
  /** Donde consta la condicion. Sin esto no se aplica nada. */
  evidenciaComision: string;

  /** Parte del consumo que vuelve al cliente como Credito Atheron. */
  creditoPct: number;
  /** Parte del consumo que queda como margen bruto de Atheron. */
  margenPct: number;
  estadoReparto: EstadoRegla;

  /** Comision del originador comercial. Sin politica: no se calcula. */
  originadorPct: number | null;
  estadoOriginador: EstadoRegla;
}

export const REGLA: ReglaEconomica = {
  version: '2026-09-22.v1',
  comisionPct: 10,
  estadoComision: 'CONFIRMADA POR CEO',
  evidenciaComision:
    'Decisión del CEO comunicada en la orden ATH-LOOP-002 (22 de septiembre de 2026): ' +
    'La Triada reconoce a Atheron una comisión del 10% sobre el consumo atribuido y validado.',

  creditoPct: 5,
  margenPct: 5,
  estadoReparto: 'HIPÓTESIS — NO ES POLÍTICA',

  originadorPct: null,
  estadoOriginador: 'PENDIENTE POLÍTICA CEO',
};

/** El reparto solo se publica cuando deja de ser hipotesis. */
export const REPARTO_CONFIRMADO = REGLA.estadoReparto === 'CONFIRMADA POR CEO';

/* ------------------------------------------------------------
   EL GUARDIAN
   ------------------------------------------------------------ */
function comprueba(r: ReglaEconomica): void {
  if (!r.version.trim()) throw new Error('ECONOMIA: la regla necesita versión para poder auditarla.');
  const rango = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 100;

  if (!rango(r.comisionPct) || r.comisionPct === 0) {
    throw new Error(`ECONOMIA: comisionPct fuera de rango (${r.comisionPct}).`);
  }
  if (r.estadoComision === 'CONFIRMADA POR CEO' && !r.evidenciaComision.trim()) {
    throw new Error('ECONOMIA: una comisión confirmada sin evidencia escrita no se aplica.');
  }
  if (!rango(r.creditoPct) || !rango(r.margenPct)) {
    throw new Error('ECONOMIA: el reparto tiene porcentajes fuera de rango.');
  }
  /* Comparacion en centesimas para no pelearse con los decimales
     binarios: 2.5 + 7.5 tiene que dar 10 sin discusion. */
  const suma = Math.round((r.creditoPct + r.margenPct) * 100);
  if (suma !== Math.round(r.comisionPct * 100)) {
    throw new Error(
      `ECONOMIA: el reparto no cuadra. Crédito ${r.creditoPct}% + margen ${r.margenPct}% = ` +
        `${r.creditoPct + r.margenPct}%, y la comisión es ${r.comisionPct}%. ` +
        'Crédito y margen SON la comisión repartida: no pueden sumar otra cosa.',
    );
  }
  if (r.originadorPct !== null && r.estadoOriginador !== 'CONFIRMADA POR CEO') {
    throw new Error(
      `ECONOMIA: hay comisión de originador escrita (${r.originadorPct}%) con estado ` +
        `"${r.estadoOriginador}". Modelar al originador no es pagarle.`,
    );
  }
}
comprueba(REGLA);

/* ------------------------------------------------------------
   EL CALCULO

   Pesos colombianos, sin decimales. Dos reglas que evitan los dos
   descuadres tipicos:

   1. El margen NO se calcula: es la comision menos el credito. Si
      se calculara aparte, dos redondeos independientes dejarian un
      peso suelto que no cuadra con nada.
   2. El cliente paga el consumo entero. La comision no es un
      descuento y no se le resta a nadie en la mesa.
   ------------------------------------------------------------ */
export interface Economia {
  /** Lo que el cliente paga en el local. Sin descuento. */
  consumo: number;
  /** Lo que La Triada le debe a Atheron. */
  comision: number;
  /** Lo que el cliente recibe como Credito Atheron. */
  credito: number;
  /** Lo que le queda a Atheron. comision - credito, exacto. */
  margen: number;
  /* Copia de la regla con la que se calculo ESTA fila. No es
     redundancia: es lo unico que permite reconstruir una liquidacion
     de hace tres semanas cuando el reparto ya ha cambiado. */
  comisionPct: number;
  creditoPct: number;
  margenPct: number;
  reglaVersion: string;
}

/* ------------------------------------------------------------
   LA REGLA QUE SE APLICA A UNA VENTA

   No es la regla entera: es lo justo para calcular y para poder
   auditarlo despues. Cada transaccion guarda una copia de esto EN LA
   ACTIVACION, y la redencion usa esa copia aunque la configuracion
   haya cambiado entremedias.

   POR QUE EN LA ACTIVACION Y NO EN LA REDENCION

   Porque es cuando se le ensena la oferta al cliente. Si activa
   viendo un 5% y consume dos horas despues, cobrarle segun un
   reparto nuevo seria cambiarle el trato despues de aceptarlo. El
   momento contractual de este piloto es la activacion, y esta
   escrito aqui para que no dependa de quien lea el codigo.
   ------------------------------------------------------------ */
export type ReglaAplicable = Pick<
  ReglaEconomica,
  'version' | 'comisionPct' | 'creditoPct' | 'margenPct'
>;

export const instantanea = (regla: ReglaEconomica = REGLA): ReglaAplicable => ({
  version: regla.version,
  comisionPct: regla.comisionPct,
  creditoPct: regla.creditoPct,
  margenPct: regla.margenPct,
});

export function calculaEconomia(consumo: number, regla: ReglaAplicable = REGLA): Economia {
  if (!Number.isFinite(consumo) || consumo < 0) throw new Error('Consumo no válido.');
  /* Una instantanea guardada hace semanas tambien tiene que cuadrar:
     si no, alguien la edito a mano en el almacen. */
  if (Math.round((regla.creditoPct + regla.margenPct) * 100) !== Math.round(regla.comisionPct * 100)) {
    throw new Error(`ECONOMIA: la regla ${regla.version} no cuadra: crédito + margen ≠ comisión.`);
  }
  const base = Math.round(consumo);
  const comision = Math.round((base * regla.comisionPct) / 100);
  const credito = Math.round((base * regla.creditoPct) / 100);
  return {
    consumo: base,
    comision,
    /* El credito nunca puede pasarse de la comision: con un reparto
       raro y un redondeo desfavorable, Atheron pagaria de su bolsillo
       sin enterarse. */
    credito: Math.min(credito, comision),
    margen: comision - Math.min(credito, comision),
    comisionPct: regla.comisionPct,
    creditoPct: regla.creditoPct,
    margenPct: regla.margenPct,
    reglaVersion: regla.version,
  };
}

/* ------------------------------------------------------------
   EL CREDITO ATHERON NO ES CREDITO DE HOTEL

   Nace del consumo en un aliado, asi que amarrarlo a hospedaje lo
   haria inservible para quien ya vive en Zipaquira o viene solo a
   comer. Se modela como credito del ECOSISTEMA desde el primer dia:
   ampliar el ambito despues obligaria a reescribir los creditos ya
   emitidos, y eso son promesas hechas que hay que cambiar.

   Los ambitos de abajo son el MODELO, no una oferta publicada.
   Cuales estan realmente abiertos y con que condiciones es decision
   de direccion (ver estadoReparto).
   ------------------------------------------------------------ */
export type AmbitoCredito = 'HOSPEDAJE' | 'SECURITY' | 'EXPERIENCIAS' | 'ALIADOS';

export const AMBITOS: Record<AmbitoCredito, { etiqueta: string; nota: string }> = {
  HOSPEDAJE: {
    etiqueta: 'Hospedajes Atheron',
    nota: 'Los siete hospedajes de Zipaquirá y Cogua.',
  },
  SECURITY: {
    etiqueta: 'Atheron Security',
    nota: 'Productos y servicios elegibles. Cuáles, lo define dirección.',
  },
  EXPERIENCIAS: {
    etiqueta: 'Experiencias Atheron',
    nota: 'Las que se publiquen en la guía.',
  },
  ALIADOS: {
    etiqueta: 'Aliados de la Red',
    nota: 'Incluida La Triada. Requiere acuerdo con cada aliado.',
  },
};

/** Donde se podra redimir. Modelo abierto; la apertura real la decide direccion. */
export const AMBITOS_PREVISTOS: AmbitoCredito[] = ['HOSPEDAJE', 'SECURITY', 'EXPERIENCIAS', 'ALIADOS'];

/* Cuanto dura un credito. Un credito sin caducidad es un pasivo
   abierto para siempre en la contabilidad de Atheron; uno de una
   semana no le da tiempo a nadie a volver. Noventa dias es el
   parametro de partida del piloto, no una politica. */
export const VIGENCIA_CREDITO_DIAS = 90;

export type EstadoCredito = 'GENERADO' | 'DISPONIBLE' | 'USADO' | 'CADUCADO' | 'ANULADO';

export const ETIQUETA_CREDITO: Record<EstadoCredito, string> = {
  GENERADO: 'Generado',
  DISPONIBLE: 'Disponible',
  USADO: 'Usado',
  CADUCADO: 'Caducado',
  ANULADO: 'Anulado',
};

/* ------------------------------------------------------------
   TEXTOS DEL CLIENTE

   Una sola frase, en un sitio, para que ninguna pantalla se invente
   otra. No lleva letra pequena ni explica de donde sale el dinero:
   el cliente no tiene por que entender la comision del aliado.
   ------------------------------------------------------------ */
export const COPY_CREDITO = {
  titulo: 'Crédito Atheron',
  queEs: `El ${REGLA.creditoPct}% de lo que consumas se te acredita como Crédito Atheron.`,
  /* EN FUTURO, NO EN PRESENTE, Y SIN PROMETER AUTOMATISMO.
     La tercera auditoria senalo que estos dos textos se leian como
     una promesa: "se usa" y "vale" dan por hecho que el credito ya
     se puede gastar y que se aplicara solo. Hoy el credito se
     REGISTRA -existe, con su importe y su vencimiento- pero no hay
     mecanismo de vinculacion ni de aplicacion automatica, y decir lo
     contrario es prometer algo que no se puede cumplir. */
  donde: 'Está previsto para hospedajes Atheron y el resto de la red.',
  vigencia: `Se registra con ${VIGENCIA_CREDITO_DIAS} días de vigencia desde tu visita.`,
  /* Mientras no exista una cuenta de cliente a la que atarlo, el
     credito se genera y queda esperando. Decirle "te lo aplicamos
     cuando reserves" seria prometer algo que hoy no se puede
     cumplir: no hay forma de saber que quien reserva es quien
     consumio. Ver src/data/credito-ledger.ts. */
  pendiente: 'Queda registrado a nombre de este código. No se aplica solo: habrá que vincularlo.',
  comoReclamar: 'Guarda tu código: es el que identifica tu crédito.',
  /* Lo unico que se dice del estado del acuerdo, y solo dentro del
     piloto interno: es una prueba, y prometer permanencia seria
     exactamente lo que direccion pidio no hacer. */
  provisional: 'Condiciones del piloto: pueden cambiar mientras dure la prueba.',
} as const;
