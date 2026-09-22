/* ============================================================
   INFORME SEMANAL DEL ALIADO — ATH-LOOP-002

   PARA QUE SIRVE

   Para que La Triada y Atheron cuadren cifras sin discutir. Las dos
   partes miran el mismo recuento, calculado con las mismas reglas
   sobre las mismas transacciones, y debajo tienen la lista fila a
   fila para comprobar cualquier numero que no les encaje.

   TRES DECISIONES QUE EVITAN DISCUSIONES CARAS

   1. La semana es de lunes a domingo, en hora de Colombia. Fijarla
      aqui evita el clasico "para mi la semana empieza el domingo",
      que descuadra el corte y con el la factura.

   2. Una transaccion cuenta en la semana en que SE REDIMIO, no en la
      que se activo. Lo que se factura es consumo, y el consumo
      ocurre al redimir. Una activacion del domingo que se consume el
      lunes es venta de la semana siguiente, y asi se cuenta.

   3. La conversion se calcula sobre las activaciones de la semana,
      no sobre las redenciones. Si se hiciera al reves daria 100%
      siempre, que es el tipo de cifra que queda muy bien y no
      significa nada.

   ESTE MODULO NO SABE DE DONDE SALEN LAS TRANSACCIONES

   Recibe una lista y devuelve numeros. Asi el mismo calculo sirve
   para la API, para la pantalla y para las pruebas, y el informe no
   puede decir una cosa en un sitio y otra en otro.
   ============================================================ */

import { REGLA } from './economia-red.ts';
import {
  CABECERA_CONCILIACION,
  ETIQUETA_FUENTE,
  filaConciliacion,
  type Fuente,
  type Transaccion,
} from './transacciones-red.ts';

/* ------------------------------------------------------------
   LA SEMANA

   Los sellos vienen como "2026-09-23T13:40:05-05:00": ya traen la
   hora de Colombia escrita, asi que la fecha son los diez primeros
   caracteres y no hace falta ninguna conversion. Los calculos de
   dia se hacen a mediodia UTC para que ningun redondeo de zona
   horaria mueva la fecha, que es el error que ya se documento en
   src/data/fechas.ts.
   ------------------------------------------------------------ */
export interface Semana {
  /** AAAA-MM-DD del lunes. Es la clave de la semana. */
  lunes: string;
  /** AAAA-MM-DD del domingo. */
  domingo: string;
}

const aMediodia = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const soloFecha = (sello: string): string => sello.slice(0, 10);

/** La semana (lunes-domingo) a la que pertenece una fecha AAAA-MM-DD. */
export function semanaDe(fecha: string): Semana {
  const d = aMediodia(fecha);
  /* getUTCDay: 0 es domingo. El domingo pertenece a la semana que
     empezo el lunes anterior, es decir, seis dias atras. */
  const dia = d.getUTCDay();
  const atras = dia === 0 ? 6 : dia - 1;
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - atras);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  return { lunes: lunes.toISOString().slice(0, 10), domingo: domingo.toISOString().slice(0, 10) };
}

export const enSemana = (fecha: string, semana: Semana): boolean =>
  fecha >= semana.lunes && fecha <= semana.domingo;

/* ------------------------------------------------------------
   EL INFORME
   ------------------------------------------------------------ */
export interface Informe {
  semana: Semana;
  activaciones: number;
  personasPrevistas: number;
  redenciones: number;
  cerradasSinConsumo: number;
  /** Redenciones / activaciones de la semana, en %. Una cifra, no una fraccion. */
  conversion: number;
  personasAtendidas: number;
  consumoAtribuido: number;
  comision: number;
  creditoGenerado: number;
  margen: number;
  /** Activaciones por fuente, de mas a menos. */
  porFuente: { fuente: Fuente; etiqueta: string; activaciones: number; redenciones: number }[];
  satisfaccionMedia: number | null;
  incidencias: number;
  /** Las transacciones que sostienen las cifras de arriba. */
  filas: string[];
  /** Avisos que hay que leer antes de facturar. */
  avisos: string[];
}

export function informeSemanal(transacciones: Transaccion[], semana: Semana): Informe {
  const activadas = transacciones.filter((t) => enSemana(soloFecha(t.activadoEn), semana));
  const redimidas = transacciones.filter(
    (t) => t.estado === 'REDIMIDO' && t.redimidoEn && enSemana(soloFecha(t.redimidoEn), semana),
  );
  const cerradas = transacciones.filter(
    (t) => t.estado === 'NO_REDIMIDO' && t.redimidoEn && enSemana(soloFecha(t.redimidoEn), semana),
  );

  const suma = (lista: Transaccion[], f: (t: Transaccion) => number): number =>
    lista.reduce((n, t) => n + f(t), 0);

  const fuentes = new Map<Fuente, { activaciones: number; redenciones: number }>();
  for (const t of activadas) {
    const f = fuentes.get(t.fuente) ?? { activaciones: 0, redenciones: 0 };
    f.activaciones++;
    fuentes.set(t.fuente, f);
  }
  for (const t of redimidas) {
    const f = fuentes.get(t.fuente) ?? { activaciones: 0, redenciones: 0 };
    f.redenciones++;
    fuentes.set(t.fuente, f);
  }

  const notas = redimidas
    .map((t) => t.seguimiento?.satisfaccion)
    .filter((n): n is number => typeof n === 'number');

  const avisos: string[] = [];
  if (REGLA.estadoReparto !== 'CONFIRMADA POR CEO') {
    avisos.push(
      `El reparto de la comisión (${REGLA.creditoPct}% crédito / ${REGLA.margenPct}% margen) es ` +
        'una hipótesis del piloto, no una política aprobada. La comisión total sí está confirmada.',
    );
  }
  if (REGLA.originadorPct === null) {
    avisos.push('El originador comercial se registra, pero no se liquida: no hay política aprobada.');
  }
  const sinConsumo = redimidas.filter((t) => !t.economia);
  if (sinConsumo.length) {
    avisos.push(`${sinConsumo.length} redención(es) sin consumo registrado: revisar antes de facturar.`);
  }

  return {
    semana,
    activaciones: activadas.length,
    personasPrevistas: suma(activadas, (t) => t.personasPrevistas ?? 0),
    redenciones: redimidas.length,
    cerradasSinConsumo: cerradas.length,
    conversion: activadas.length ? Math.round((redimidas.length / activadas.length) * 1000) / 10 : 0,
    personasAtendidas: suma(redimidas, (t) => t.personas ?? 0),
    consumoAtribuido: suma(redimidas, (t) => t.economia?.consumo ?? 0),
    comision: suma(redimidas, (t) => t.economia?.comision ?? 0),
    creditoGenerado: suma(redimidas, (t) => t.economia?.credito ?? 0),
    margen: suma(redimidas, (t) => t.economia?.margen ?? 0),
    porFuente: [...fuentes.entries()]
      .map(([fuente, n]) => ({ fuente, etiqueta: ETIQUETA_FUENTE[fuente], ...n }))
      .sort((a, b) => b.activaciones - a.activaciones || a.fuente.localeCompare(b.fuente)),
    satisfaccionMedia: notas.length
      ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10
      : null,
    incidencias: redimidas.filter((t) => t.seguimiento?.incidencia).length,
    filas: [CABECERA_CONCILIACION, ...redimidas.map(filaConciliacion)],
    avisos,
  };
}

/* ------------------------------------------------------------
   LA COMPROBACION QUE SE HACE ANTES DE FACTURAR

   Cuadrar dos veces el mismo numero parece redundante hasta el dia
   en que no cuadra. Esto recalcula los totales desde cero y dice si
   coinciden con los del informe: si alguien toca el calculo y se
   descuadra, se ve aqui y no en la reunion con el aliado.
   ------------------------------------------------------------ */
export function conciliacionCuadra(informe: Informe): { cuadra: boolean; detalle: string } {
  const esperada = Math.round((informe.consumoAtribuido * REGLA.comisionPct) / 100);
  const reparto = informe.creditoGenerado + informe.margen;

  if (reparto !== informe.comision) {
    return {
      cuadra: false,
      detalle: `Crédito (${informe.creditoGenerado}) + margen (${informe.margen}) = ${reparto}, y la comisión suma ${informe.comision}.`,
    };
  }
  /* La comision total puede separarse de la del consumo total por
     unos pocos pesos: cada fila se redondea por su cuenta. Un peso
     por redencion es normal; mas que eso es un error de calculo. */
  const holgura = Math.max(1, informe.redenciones);
  if (Math.abs(esperada - informe.comision) > holgura) {
    return {
      cuadra: false,
      detalle: `La comisión suma ${informe.comision} y sobre el consumo total daría ${esperada}.`,
    };
  }
  return { cuadra: true, detalle: 'Los totales cuadran con el consumo atribuido.' };
}
