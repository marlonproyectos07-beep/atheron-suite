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

   ============================================================
   LO QUE CAMBIO TRAS LA AUDITORIA
   ============================================================

   1. NO SE RECALCULA LA HISTORIA CON LA REGLA DE HOY. Cada
      transaccion guarda los porcentajes con los que se calculo y su
      version de regla. El informe suma lo guardado y comprueba cada
      version por separado. Si manana el reparto pasa de 5/5 a 6/4,
      las liquidaciones de esta semana siguen diciendo lo mismo.

   2. UNA LISTA VACIA YA NO "CUADRA". Antes, cero transacciones
      daban cero descuadre y por tanto un visto bueno. Ahora una
      semana sin datos se declara SIN_DATOS, que es distinto de
      cuadrada, y se ve en la pantalla.

   3. LOS REGISTROS QUE FALTAN SE CUENTAN. El almacen dice que ids
      nombraba el indice y no aparecieron. Con uno solo que falte, el
      informe NO cuadra: una liquidacion sobre datos incompletos es
      peor que no tener liquidacion.

   4. SE CUENTAN LOS CIERRES. Una visita que se cierra sin consumo
      es informacion comercial -es la que dice cuanta gente activa y
      no consume-, y antes desaparecia del informe.
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

/** Resumen por version de regla economica: lo que permite auditar. */
export interface BloqueRegla {
  reglaVersion: string;
  comisionPct: number;
  creditoPct: number;
  redenciones: number;
  consumo: number;
  comision: number;
  credito: number;
  margen: number;
}

export type EstadoInforme = 'CUADRA' | 'NO_CUADRA' | 'SIN_DATOS' | 'INCOMPLETO';

export interface Informe {
  semana: Semana;
  activaciones: number;
  personasPrevistas: number;
  redenciones: number;
  cerradasSinConsumo: number;
  /** Redenciones / activaciones de la semana, en %. */
  conversion: number;
  personasAtendidas: number;
  consumoAtribuido: number;
  comision: number;
  creditoGenerado: number;
  margen: number;
  porFuente: { fuente: Fuente; etiqueta: string; activaciones: number; redenciones: number }[];
  /** Un bloque por regla economica aplicada. Casi siempre sera uno. */
  porRegla: BloqueRegla[];
  satisfaccionMedia: number | null;
  incidencias: number;
  /** Ids que el indice nombraba y no se pudieron leer. */
  faltantes: string[];
  /** Redenciones sin economia guardada: no se pueden facturar. */
  sinEconomia: string[];
  filas: string[];
  avisos: string[];
}

export function informeSemanal(
  transacciones: Transaccion[],
  semana: Semana,
  faltantes: string[] = [],
): Informe {
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

  /* Un bloque por regla aplicada. Si alguien cambia el reparto a
     mitad de semana, se ve: dos bloques, cada uno con lo suyo. */
  const reglas = new Map<string, BloqueRegla>();
  for (const t of redimidas) {
    const e = t.economia;
    if (!e) continue;
    const bloque = reglas.get(e.reglaVersion) ?? {
      reglaVersion: e.reglaVersion,
      comisionPct: e.comisionPct,
      creditoPct: e.creditoPct,
      redenciones: 0,
      consumo: 0,
      comision: 0,
      credito: 0,
      margen: 0,
    };
    bloque.redenciones++;
    bloque.consumo += e.consumo;
    bloque.comision += e.comision;
    bloque.credito += e.credito;
    bloque.margen += e.margen;
    reglas.set(e.reglaVersion, bloque);
  }

  const notas = redimidas
    .map((t) => t.seguimiento?.satisfaccion)
    .filter((n): n is number => typeof n === 'number');

  const sinEconomia = redimidas.filter((t) => !t.economia).map((t) => t.codigo);

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
  if (faltantes.length) {
    avisos.push(
      `${faltantes.length} registro(s) que el índice nombra no se pudieron leer. ` +
        'Este informe está incompleto y NO sirve para liquidar hasta resolverlo.',
    );
  }
  if (sinEconomia.length) {
    avisos.push(`${sinEconomia.length} redención(es) sin consumo guardado: revisar antes de facturar.`);
  }
  if (reglas.size > 1) {
    avisos.push('En esta semana se aplicó más de una regla económica. Cada bloque se liquida con la suya.');
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
    porRegla: [...reglas.values()].sort((a, b) => a.reglaVersion.localeCompare(b.reglaVersion)),
    satisfaccionMedia: notas.length
      ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10
      : null,
    incidencias: redimidas.filter((t) => t.seguimiento?.incidencia).length,
    faltantes,
    sinEconomia,
    filas: [CABECERA_CONCILIACION, ...redimidas.map(filaConciliacion)],
    avisos,
  };
}

/* ------------------------------------------------------------
   LA COMPROBACION QUE SE HACE ANTES DE FACTURAR

   Cuadrar dos veces el mismo numero parece redundante hasta el dia
   en que no cuadra. Cada bloque se comprueba con SU regla, no con la
   de hoy: esa era la trampa que encontro la auditoria.
   ------------------------------------------------------------ */
export function conciliacionCuadra(informe: Informe): {
  cuadra: boolean;
  estado: EstadoInforme;
  detalle: string;
} {
  if (informe.faltantes.length) {
    return {
      cuadra: false,
      estado: 'INCOMPLETO',
      detalle: `Faltan ${informe.faltantes.length} registro(s) que el índice nombra. No se puede liquidar.`,
    };
  }
  if (informe.sinEconomia.length) {
    return {
      cuadra: false,
      estado: 'INCOMPLETO',
      detalle: `${informe.sinEconomia.length} redención(es) sin consumo guardado.`,
    };
  }
  if (!informe.redenciones) {
    /* Cero no es cuadrar: es que no hay nada que cuadrar. Decir
       "cuadra" aqui es exactamente como se firma una liquidacion
       vacia sin que nadie se entere. */
    return {
      cuadra: false,
      estado: 'SIN_DATOS',
      detalle: informe.activaciones
        ? `${informe.activaciones} activación(es) y ninguna redención en la semana.`
        : 'No hay ninguna transacción en esta semana.',
    };
  }

  for (const bloque of informe.porRegla) {
    if (bloque.credito + bloque.margen !== bloque.comision) {
      return {
        cuadra: false,
        estado: 'NO_CUADRA',
        detalle: `Regla ${bloque.reglaVersion}: crédito (${bloque.credito}) + margen (${bloque.margen}) no suman la comisión (${bloque.comision}).`,
      };
    }
    /* Cada fila se redondea por su cuenta, asi que la suma puede
       separarse del calculo sobre el total en unos pocos pesos: uno
       por redencion es normal, mas que eso es un error de calculo. */
    const esperada = Math.round((bloque.consumo * bloque.comisionPct) / 100);
    if (Math.abs(esperada - bloque.comision) > Math.max(1, bloque.redenciones)) {
      return {
        cuadra: false,
        estado: 'NO_CUADRA',
        detalle: `Regla ${bloque.reglaVersion}: la comisión suma ${bloque.comision} y sobre el consumo daría ${esperada}.`,
      };
    }
  }

  const total = informe.porRegla.reduce((n, b) => n + b.comision, 0);
  if (total !== informe.comision) {
    return {
      cuadra: false,
      estado: 'NO_CUADRA',
      detalle: `Los bloques por regla suman ${total} y el total dice ${informe.comision}.`,
    };
  }

  return {
    cuadra: true,
    estado: 'CUADRA',
    detalle:
      informe.porRegla.length === 1
        ? `Los totales cuadran con el consumo atribuido (regla ${informe.porRegla[0].reglaVersion}).`
        : 'Los totales cuadran en cada bloque de regla.',
  };
}
