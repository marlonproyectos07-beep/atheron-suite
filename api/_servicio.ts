/* ============================================================
   SERVICIO DE LA RED — la logica del backend, sin HTTP

   Los archivos de /api son adaptadores de diez lineas: leen el
   cuerpo, llaman aqui y devuelven JSON. Todo lo que decide algo esta
   en este archivo, y por eso se puede probar entero sin levantar un
   servidor.

   ============================================================
   LAS CUATRO COSAS QUE LA AUDITORIA ROMPIO, Y COMO SE CIERRAN
   ============================================================

   1. CUALQUIERA PODIA DECLARAR UNA VENTA.
      Redimir y cerrar exigen ahora credencial de operador del
      aliado (api/_autorizacion.ts). El codigo del cliente identifica
      una visita; no autoriza a mover dinero.

   2. DOS REDENCIONES SIMULTANEAS PASABAN LAS DOS.
      Se quito el cerrojo -que no tenia propietario ni revalidacion-
      y se cambio por compare-and-set sobre la version del registro,
      ejecutado dentro del servidor. No hay ventana entre leer y
      escribir porque la comparacion ocurre en la misma operacion.

   3. UN CIERRE CONCURRENTE BORRABA UNA VENTA CONFIRMADA.
      Cierre y redencion usan exactamente la misma transicion y el
      mismo compare-and-set. El que llega segundo se encuentra la
      version cambiada y no escribe. Una venta confirmada no se
      puede borrar con un cierre.

   4. LA CONSULTA CONTABA DE MAS.
      Ahora hay dos vistas explicitas, por lista blanca: la del
      cliente y la del operador. Lo que no esta en la lista no sale,
      aunque manana alguien anada un campo al modelo.

   ============================================================
   EL CREDITO SE EMITE DE VERDAD
   ============================================================

   Al confirmar el consumo se emite un credito en su propio libro
   (src/data/credito-ledger.ts), con su identificador, su saldo, sus
   movimientos y su vencimiento. Antes era una cifra dentro de la
   transaccion; ahora es un registro con vida propia.

   Orden deliberado: primero se escribe la transaccion -que es lo que
   el aliado factura- y despues el credito. Si el credito fallara,
   la transaccion ya guarda su creditoId, asi que la falta se detecta
   y se repara sola en el siguiente intento: reintentar una redencion
   ya hecha vuelve a intentar emitir su credito. Al reves -credito
   primero- quedarian creditos huerfanos que nadie sabria de donde
   salieron.
   ============================================================ */

import { generarCodigo } from '../src/data/codigos-referido.ts';
import { diaColombiano, estaVigente, PILOTO } from '../src/data/piloto-la-triada.ts';
import { AMBITOS_PREVISTOS, REGLA } from '../src/data/economia-red.ts';
import { generaCredito, vistaCredito, type Credito, type CreditoVista } from '../src/data/credito-ledger.ts';
import {
  anotaSeguimiento,
  cierraSinConsumo,
  creaActivacion,
  EXPLICACION_RECHAZO,
  redime,
  type Fuente,
  type MotivoRechazo,
  type Transaccion,
} from '../src/data/transacciones-red.ts';
import {
  informeSemanal,
  semanaDe,
  conciliacionCuadra,
  type EstadoInforme,
  type Informe,
  type Integridad,
} from '../src/data/reporte-aliado.ts';
import { almacen, type Almacen } from './_almacen.ts';

const TX = 'tx';
const CR = 'cr';

/* ------------------------------------------------------------
   LOS INDICES LLEVAN EL TIPO DENTRO DEL NOMBRE

   La reauditoria encontro que los creditos ATH-CR-* acababan en el
   mismo indice que las transacciones, "act:<dia>". El informe leia
   ese indice esperando transacciones, no encontraba las de los
   creditos -porque estan en otro sitio- y daba una venta normal por
   INCOMPLETA.

   Ahora cada entidad tiene su prefijo y no comparten ninguno. Un
   credito no puede aparecer en un indice de transacciones ni al
   reves, y si alguna vez apareciera, el informe lo detecta como
   contaminacion en vez de tratarlo como una transaccion perdida.
   ------------------------------------------------------------ */
const idxActivacion = (dia: string): string => `tx:act:${dia}`;
const idxRedencion = (dia: string): string => `tx:red:${dia}`;
const idxCredito = (dia: string): string => `cr:gen:${dia}`;

/** Un id de transaccion es ATH-TRI-XXXXX; uno de credito, ATH-CR-... */
const ES_TRANSACCION = /^ATH-[A-Z]{3}-[A-Z0-9]{5}$/;

/* ------------------------------------------------------------
   LAS DOS VISTAS — lista blanca, no lista negra

   Antes se construia la vista QUITANDO el contacto. Eso funciona
   hasta que alguien anade un campo nuevo al modelo y se olvida de
   quitarlo tambien: el campo nuevo sale publicado y nadie se entera.

   Aqui se construye ENUMERANDO lo que sale. Un campo nuevo no
   aparece hasta que alguien lo escriba aqui a proposito, que es
   justo el momento de pensarlo.
   ------------------------------------------------------------ */
export interface VistaCliente {
  codigo: string;
  estado: Transaccion['estado'];
  activadoEn: string;
  redimidoEn?: string;
  vigente: boolean;
  /** Solo lo que le importa: lo que pagó y cuánto crédito ganó. */
  consumo?: number;
  credito?: number;
  /* Mientras no exista vinculacion, lo unico verdadero que se le
     puede decir. Ni saldo, ni identificador, ni movimientos: quien
     tenga el codigo no tiene por que ver el estado de un saldo que
     todavia no es de nadie. */
  creditoPendienteVinculacion?: boolean;
  tieneOpinion: boolean;
}

export interface VistaOperador {
  codigo: string;
  estado: Transaccion['estado'];
  activadoEn: string;
  redimidoEn?: string;
  vigente: boolean;
  fuente: Fuente;
  personas?: number;
  personasPrevistas?: number;
  consumo?: number;
  /** El operador sí ve la comisión: es lo que su local le debe a Atheron. */
  comision?: number;
}

export function vistaCliente(t: Transaccion, ahora = new Date()): VistaCliente {
  return {
    codigo: t.codigo,
    estado: t.estado,
    activadoEn: t.activadoEn,
    redimidoEn: t.redimidoEn,
    vigente: estaVigente(new Date(t.activadoEn), ahora),
    consumo: t.economia?.consumo,
    credito: t.economia?.credito,
    creditoPendienteVinculacion: t.creditoId ? true : undefined,
    tieneOpinion: Boolean(t.seguimiento),
  };
}

export const vistaOperador = (t: Transaccion, ahora = new Date()): VistaOperador => ({
  codigo: t.codigo,
  estado: t.estado,
  activadoEn: t.activadoEn,
  redimidoEn: t.redimidoEn,
  vigente: estaVigente(new Date(t.activadoEn), ahora),
  fuente: t.fuente,
  personas: t.personas,
  personasPrevistas: t.personasPrevistas,
  consumo: t.economia?.consumo,
  comision: t.economia?.comision,
});

/* Lo que NUNCA sale de aqui, por si alguien viene a anadir un campo:
   consentimiento (ni el numero ni si lo dio: al cliente no le aporta
   y al local no le incumbe), nota, seguimiento.comentario, margen,
   identificador y saldo del credito, eventos y version. */

export interface Respuesta<T> {
  ok: boolean;
  datos?: T;
  motivo?: MotivoRechazo | 'ALMACEN_NO_CONFIGURADO' | 'NO_AUTORIZADO' | 'DEMASIADAS_PETICIONES' | 'ERROR';
  explicacion?: string;
  yaRedimida?: boolean;
  /** true si la venta quedo registrada pero su credito no se pudo emitir. */
  creditoPendiente?: boolean;
}

const rechaza = <T>(motivo: MotivoRechazo): Respuesta<T> => ({
  ok: false,
  motivo,
  explicacion: EXPLICACION_RECHAZO[motivo],
});

/* ------------------------------------------------------------
   AVISOS A ATHERON

   Notificacion, no registro: la verdad esta en el almacen y este
   webhook puede fallar sin que se pierda ninguna transaccion. Por eso
   su error se traga.

   No se envia WhatsApp ni correo a nadie desde aqui, y menos al
   cliente: eso necesita consentimiento y decision de direccion.
   ------------------------------------------------------------ */
async function avisa(evento: string, datos: Record<string, unknown>): Promise<void> {
  const destino = process.env.ATHERON_WEBHOOK_EVENTOS;
  if (!destino) return;
  try {
    await fetch(destino, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evento, piloto: PILOTO.id, sello: new Date().toISOString(), ...datos }),
    });
  } catch {
    /* Un aviso perdido no invalida nada: el registro ya esta escrito. */
  }
}

/* ------------------------------------------------------------
   ACTIVAR
   ------------------------------------------------------------ */
export interface EntradaActivar {
  fuente?: unknown;
  personasPrevistas?: unknown;
  contacto?: unknown;
  consienteSeguimiento?: boolean;
}

export async function activar(
  entrada: EntradaActivar,
  deposito: Almacen = almacen(),
): Promise<Respuesta<VistaCliente>> {
  /* Cinco intentos: con 923.521 combinaciones, que dos choquen ya es
     raro; cinco seguidos significa que algo va mal en el almacen y
     conviene enterarse en vez de seguir intentando. */
  for (let intento = 0; intento < 5; intento++) {
    const transaccion = creaActivacion({
      codigo: generarCodigo(PILOTO.slugAliado),
      fuente: entrada.fuente,
      personasPrevistas: entrada.personasPrevistas,
      consentimiento: entrada.consienteSeguimiento
        ? { seguimiento: true, contacto: String(entrada.contacto ?? '') }
        : undefined,
    });

    if (await deposito.crea(TX, transaccion, [idxActivacion(transaccion.activadoEn.slice(0, 10))])) {
      await avisa('activacion', {
        codigo: transaccion.codigo,
        fuente: transaccion.fuente,
        personas: transaccion.personasPrevistas ?? null,
        seguimiento: transaccion.consentimiento.seguimiento,
      });
      return { ok: true, datos: vistaCliente(transaccion) };
    }
  }
  return { ok: false, motivo: 'ERROR', explicacion: 'No se pudo generar un código libre.' };
}

/* ------------------------------------------------------------
   CONSULTAR
   ------------------------------------------------------------ */
export async function consultar(
  codigo: string,
  deposito: Almacen = almacen(),
  opciones: { operador?: boolean; ahora?: Date } = {},
): Promise<Respuesta<VistaCliente | VistaOperador>> {
  const ahora = opciones.ahora ?? new Date();
  const transaccion = await deposito.lee<Transaccion>(TX, codigo);
  if (!transaccion) return rechaza('NO_EXISTE');

  return {
    ok: true,
    datos: opciones.operador ? vistaOperador(transaccion, ahora) : vistaCliente(transaccion, ahora),
  };
}

/**
 * El credito, entero. NO lo sirve ningun endpoint publico: mientras
 * no exista vinculacion, conocer un codigo no puede dar acceso al
 * estado de un saldo. Lo usan la conciliacion y las pruebas.
 */
export async function creditoDe(
  creditoId: string,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<CreditoVista | null> {
  const credito = await deposito.lee<Credito>(CR, creditoId);
  return credito ? vistaCredito(credito, ahora) : null;
}

/* ------------------------------------------------------------
   REDIMIR

   Exige operador: quien llame tiene que haberlo comprobado antes
   (lo hace el endpoint). Aqui se asume que ya esta comprobado, y la
   firma lo dice para que no se olvide.
   ------------------------------------------------------------ */
export interface EntradaRedimir {
  codigo: string;
  consumo: unknown;
  personas?: unknown;
  nota?: unknown;
}

/** Emite el credito de una venta. Idempotente: si ya existe, no pasa nada. */
async function emiteCredito(transaccion: Transaccion, deposito: Almacen): Promise<boolean> {
  const importe = transaccion.economia?.credito ?? 0;
  if (!transaccion.creditoId || importe <= 0) return true;
  try {
    /* EL MOMENTO COMERCIAL ES LA REDENCION, no el instante en que se
       ejecuta esta funcion. Si el credito se emite tarde -porque el
       primer intento fallo y se repara en el siguiente-, su
       vencimiento sigue contando desde que el cliente consumio. */
    const momentoComercial = new Date(transaccion.redimidoEn ?? transaccion.activadoEn);

    const credito = generaCredito({
      id: transaccion.creditoId,
      valor: importe,
      origen: { piloto: transaccion.piloto, aliado: transaccion.aliado, codigo: transaccion.codigo },
      ambitos: AMBITOS_PREVISTOS,
      reglaVersion: transaccion.economia?.reglaVersion ?? REGLA.version,
      momentoComercial,
    });
    /* Su propio indice, nunca el de transacciones. crea() devuelve
       false si ya estaba: eso es exito, no error, y es lo que hace
       que reintentar repare una emision a medias. */
    await deposito.crea(CR, credito, [idxCredito(credito.generadoEn.slice(0, 10))]);
    return true;
  } catch (error) {
    registra('emitir el crédito', error);
    return false;
  }
}

export async function redimir(
  entrada: EntradaRedimir,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<VistaOperador>> {
  const guardada = await deposito.lee<Transaccion>(TX, entrada.codigo);
  if (!guardada) return rechaza('NO_EXISTE');

  /* Reintentar tiene que ser seguro: si ya estaba redimida se
     devuelve lo mismo de la primera vez, y de paso se comprueba que
     su credito exista. */
  if (guardada.estado === 'REDIMIDO') {
    const emitido = await emiteCredito(guardada, deposito);
    return {
      ok: true,
      yaRedimida: true,
      creditoPendiente: !emitido,
      datos: vistaOperador(guardada, ahora),
      explicacion: EXPLICACION_RECHAZO.YA_REDIMIDA,
    };
  }
  if (guardada.estado === 'NO_REDIMIDO') return rechaza('CERRADA');
  if (!estaVigente(new Date(guardada.activadoEn), ahora)) return rechaza('CADUCADA');

  const resultado = redime(guardada, entrada.consumo, {
    personas: entrada.personas,
    nota: entrada.nota,
    ahora,
    /* El identificador del credito se decide ANTES de escribir: asi
       la transaccion guarda a que credito apunta, y una emision que
       falle se puede reparar despues sin adivinar nada. */
    creditoId: idCredito(),
  });
  if (!resultado.ok || !resultado.transaccion) return rechaza(resultado.motivo ?? 'CONSUMO_INVALIDO');

  /* Credito de cero -un consumo tan pequeno que el 5% redondea a
     nada- no genera credito, asi que tampoco deja una referencia a
     un credito que no existe: eso descuadraria la conciliacion por
     un crédito "faltante" que nunca debio existir. */
  if ((resultado.transaccion.economia?.credito ?? 0) <= 0) {
    delete resultado.transaccion.creditoId;
  }

  const cambio = await deposito.cambia(TX, resultado.transaccion, [
    idxRedencion(resultado.transaccion.redimidoEn!.slice(0, 10)),
  ]);

  if (cambio === 'CONFLICTO') {
    /* Alguien llego primero. No se escribe encima: se lee lo que hay
       y se contesta con la verdad. Si el otro la redimio, esto es
       una redencion repetida; si la cerro, esta cerrada. */
    const actual = await deposito.lee<Transaccion>(TX, entrada.codigo);
    if (actual?.estado === 'REDIMIDO') {
      const emitido = await emiteCredito(actual, deposito);
      return {
        ok: true,
        yaRedimida: true,
        creditoPendiente: !emitido,
        datos: vistaOperador(actual, ahora),
        explicacion: EXPLICACION_RECHAZO.YA_REDIMIDA,
      };
    }
    if (actual?.estado === 'NO_REDIMIDO') return rechaza('CERRADA');
    return rechaza('CONFLICTO');
  }
  /* Cualquier desenlace que no sea OK es un NO: aqui estaba el
     agujero que encontro la reauditoria. Un ILEGIBLE o un
     INCONSISTENTE se colaban por debajo de los "if" y la funcion
     seguia como si hubiera escrito, devolviendo un 200 sobre una
     venta que no existe. Ahora se enumeran los casos conocidos y
     todo lo demas se rechaza en vez de continuar. */
  if (cambio !== 'OK') {
    if (cambio === 'NO_EXISTE') return rechaza('NO_EXISTE');
    registra('registrar la redención', new Error(`El almacén respondió ${cambio}.`));
    return {
      ok: false,
      motivo: 'ERROR',
      explicacion: 'El registro no se pudo escribir. No se ha confirmado ninguna venta.',
    };
  }

  const emitido = await emiteCredito(resultado.transaccion, deposito);
  const e = resultado.transaccion.economia;
  await avisa('redencion', {
    codigo: resultado.transaccion.codigo,
    fuente: resultado.transaccion.fuente,
    personas: resultado.transaccion.personas ?? null,
    consumo: e?.consumo ?? null,
    comision: e?.comision ?? null,
    credito: e?.credito ?? null,
    creditoEmitido: emitido,
  });

  return { ok: true, creditoPendiente: !emitido, datos: vistaOperador(resultado.transaccion, ahora) };
}

/* ------------------------------------------------------------
   CERRAR SIN CONSUMO

   Misma proteccion que redimir, y por el mismo motivo: la auditoria
   reprodujo una venta confirmada borrada por un cierre que llegaba
   un instante despues.
   ------------------------------------------------------------ */
export async function cerrar(
  codigo: string,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<VistaOperador>> {
  const guardada = await deposito.lee<Transaccion>(TX, codigo);
  if (!guardada) return rechaza('NO_EXISTE');

  const resultado = cierraSinConsumo(guardada, ahora);
  if (!resultado.ok || !resultado.transaccion) return rechaza(resultado.motivo ?? 'YA_REDIMIDA');

  const cambio = await deposito.cambia(TX, resultado.transaccion, [
    idxRedencion(resultado.transaccion.redimidoEn!.slice(0, 10)),
  ]);

  if (cambio === 'CONFLICTO') {
    const actual = await deposito.lee<Transaccion>(TX, codigo);
    /* Si mientras tanto se confirmo una venta, el cierre NO la pisa:
       se contesta que ya estaba redimida y se devuelve la venta. */
    if (actual?.estado === 'REDIMIDO') {
      return { ok: false, motivo: 'YA_REDIMIDA', explicacion: EXPLICACION_RECHAZO.YA_REDIMIDA, datos: vistaOperador(actual, ahora) };
    }
    if (actual?.estado === 'NO_REDIMIDO') return { ok: true, datos: vistaOperador(actual, ahora) };
    return rechaza('CONFLICTO');
  }
  if (cambio !== 'OK') {
    if (cambio === 'NO_EXISTE') return rechaza('NO_EXISTE');
    registra('cerrar la visita', new Error(`El almacén respondió ${cambio}.`));
    return { ok: false, motivo: 'ERROR', explicacion: 'El registro no se pudo escribir.' };
  }

  return { ok: true, datos: vistaOperador(resultado.transaccion, ahora) };
}

/* ------------------------------------------------------------
   SEGUIMIENTO
   ------------------------------------------------------------ */
export interface EntradaSeguimiento {
  codigo: string;
  satisfaccion?: unknown;
  comentario?: unknown;
  incidencia?: unknown;
}

export async function opinar(
  entrada: EntradaSeguimiento,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<VistaCliente>> {
  for (let intento = 0; intento < 3; intento++) {
    const guardada = await deposito.lee<Transaccion>(TX, entrada.codigo);
    if (!guardada) return rechaza('NO_EXISTE');
    /* Preguntar por una visita que no consta es pedirle a alguien que
       valore algo que no hizo. */
    if (guardada.estado !== 'REDIMIDO') return rechaza('NO_EXISTE');

    const actualizada = anotaSeguimiento(guardada, entrada, ahora);
    const cambio = await deposito.cambia(TX, actualizada);
    if (cambio === 'OK') {
      await avisa('seguimiento', {
        codigo: actualizada.codigo,
        satisfaccion: actualizada.seguimiento?.satisfaccion ?? null,
        incidencia: actualizada.seguimiento?.incidencia ?? false,
      });
      return { ok: true, datos: vistaCliente(actualizada, ahora) };
    }
    if (cambio !== 'CONFLICTO') {
      registra('anotar el seguimiento', new Error(`El almacén respondió ${cambio}.`));
      return { ok: false, motivo: 'ERROR', explicacion: 'No se pudo guardar la respuesta.' };
    }
    /* Conflicto: alguien escribio entremedias. Se vuelve a leer y se
       funde otra vez, que es exactamente lo que hay que hacer con
       datos que se fusionan en vez de reemplazarse. */
  }
  return rechaza('CONFLICTO');
}

/* ------------------------------------------------------------
   INTEGRIDAD — LO QUE HAY QUE PODER DEMOSTRAR ANTES DE FACTURAR

   La reauditoria borro las referencias de una venta: habia 300.000
   reales, el informe encontro 200.000 y dijo "cuadra". Cuadraba
   consigo mismo, que no es lo mismo que cuadrar.

   Detectar "indice nombra algo que no esta" no basta. Hay que
   comprobar las dos direcciones y todo lo que cuelga:

     indice  -> objeto     un id que no se puede leer
     objeto  -> indice     una transaccion que ningun indice nombra
     objeto  -> credito    un creditoId que apunta a nada
     indice  != estado     algo en el indice de redenciones sin redimir
     indice  contaminado   un ATH-CR-* dentro de un indice de tx
     TTL     divergente    el objeto y su indice caducan en momentos
                           distintos, asi que uno desaparecera antes

   Si cualquiera de esas falla, el informe NO cuadra. Una liquidacion
   sobre datos que no se pueden demostrar completos es peor que no
   tener liquidacion: la primera se firma.
   ------------------------------------------------------------ */
/* Un dia de diferencia entre el TTL del registro y el de su indice es
   normal: se tocan en momentos distintos y cada escritura lo renueva.
   Mas que eso significa que uno se va a quedar sin el otro. */
const TOLERANCIA_TTL_SEGUNDOS = 24 * 60 * 60;

export async function informe(
  fecha: string,
  deposito: Almacen = almacen(),
): Promise<Respuesta<Informe & { cuadra: boolean; estado: EstadoInforme; detalleConciliacion: string }>> {
  const semana = semanaDe(fecha);
  const dias: string[] = [];
  const desde = new Date(`${semana.lunes}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(desde);
    d.setUTCDate(desde.getUTCDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }

  /* Se leen los dos indices de transacciones de cada dia. El de
     creditos NO entra aqui: es de otra entidad y se comprueba
     aparte, contra las transacciones que lo referencian. */
  const [listasAct, listasRed] = await Promise.all([
    Promise.all(dias.map((d) => deposito.indice(idxActivacion(d)))),
    Promise.all(dias.map((d) => deposito.indice(idxRedencion(d)))),
  ]);

  const enActivacion = new Set(listasAct.flat());
  const enRedencion = new Set(listasRed.flat());
  const todos = [...new Set([...enActivacion, ...enRedencion])];

  /* Lo que no tiene forma de codigo de transaccion no se intenta
     cargar como tal: se declara contaminacion del indice. */
  const contaminados = todos.filter((id) => !ES_TRANSACCION.test(id));
  const ids = todos.filter((id) => ES_TRANSACCION.test(id));

  const { encontrados, faltantes } = await deposito.leeVarios<Transaccion>(TX, ids);

  /* MIRAR DESDE EL OTRO LADO.
     Una transaccion a la que ningun indice apunta es invisible si
     solo se leen los indices, y es exactamente lo que deja una
     escritura a medias. Se recorre el almacen y se leen las que no
     estaban en ningun indice -normalmente, ninguna-. */
  const escaneo = await deposito.escanea(TX);
  const conocidas = new Set(ids);
  const huerfanas = escaneo.ids.filter((id) => !conocidas.has(id)).slice(0, 500);
  const { encontrados: sueltas } = huerfanas.length
    ? await deposito.leeVarios<Transaccion>(TX, huerfanas)
    : { encontrados: [] as Transaccion[] };

  const sinIndice: string[] = [];
  /* De las sueltas, solo importan las de ESTA semana: las de otras
     semanas no descuadran este informe. */
  for (const t of sueltas) {
    const dActivacion = t.activadoEn.slice(0, 10);
    const dCierre = t.redimidoEn?.slice(0, 10);
    if (dias.includes(dActivacion) || (dCierre && dias.includes(dCierre))) sinIndice.push(t.codigo);
  }
  if (escaneo.truncado) {
    /* No se pudo recorrer entero: se dice, en vez de dar por bueno
       lo que se alcanzo a mirar. */
    sinIndice.push('(recuento incompleto: el almacén tiene más registros de los que se recorrieron)');
  }
  const indicesDivergentes: string[] = [];
  const creditosFaltantes: string[] = [];
  const ttlDivergente: string[] = [];

  for (const t of encontrados) {
    const diaActivacion = t.activadoEn.slice(0, 10);
    if (dias.includes(diaActivacion) && !enActivacion.has(t.codigo)) sinIndice.push(t.codigo);

    if (t.redimidoEn) {
      const diaCierre = t.redimidoEn.slice(0, 10);
      if (dias.includes(diaCierre) && !enRedencion.has(t.codigo)) sinIndice.push(t.codigo);
    }
    /* Al reves: si esta en el indice de redenciones, tiene que estar
       redimida o cerrada. Si no, los dos lados se contradicen. */
    if (enRedencion.has(t.codigo) && t.estado !== 'REDIMIDO' && t.estado !== 'NO_REDIMIDO') {
      indicesDivergentes.push(t.codigo);
    }

    if (t.creditoId && !(await deposito.lee(CR, t.creditoId))) creditosFaltantes.push(t.creditoId);

    try {
      const vidaTx = await deposito.vida(TX, t.codigo);
      const vidaIdx = await deposito.vidaIndice(idxActivacion(diaActivacion));
      if (vidaTx >= 0 && vidaIdx >= 0 && Math.abs(vidaTx - vidaIdx) > TOLERANCIA_TTL_SEGUNDOS) {
        ttlDivergente.push(t.codigo);
      }
    } catch (error) {
      /* Si no se puede leer el TTL, no se finge que cuadra. */
      registra('comprobar la retención', error);
      ttlDivergente.push(t.codigo);
    }
  }

  const integridad: Integridad = {
    faltantes,
    sinIndice: [...new Set(sinIndice)],
    creditosFaltantes,
    indicesDivergentes,
    contaminados,
    ttlDivergente,
  };

  const resultado = informeSemanal([...encontrados, ...sueltas.filter((t) => sinIndice.includes(t.codigo))], semana, integridad);
  const conciliacion = conciliacionCuadra(resultado);
  return {
    ok: true,
    datos: {
      ...resultado,
      cuadra: conciliacion.cuadra,
      estado: conciliacion.estado,
      detalleConciliacion: conciliacion.detalle,
    },
  };
}

/** El dia de hoy en Colombia. Lo usa el informe cuando no le dan fecha. */
export const hoyColombiano = (): string => diaColombiano(new Date());

/* ------------------------------------------------------------
   REGISTRO DE ERRORES, REDACTADO

   Lo que se escribe en el registro del servidor es el sitio y el
   tipo de error. Nunca el cuerpo de la peticion, ni el codigo, ni el
   mensaje entero: los registros se leen, se exportan y a veces se
   reenvian, y un telefono o un codigo ahi dentro es una fuga que no
   se ve venir.
   ------------------------------------------------------------ */
export function registra(donde: string, error: unknown): void {
  const tipo = error instanceof Error ? error.name : typeof error;
  const codigo = (error as { codigo?: string })?.codigo;
  console.error(`[atheron/api] fallo al ${donde}: ${tipo}${codigo ? ` (${codigo})` : ''}`);
}

/* ------------------------------------------------------------
   IDENTIFICADOR DE CREDITO

   Al azar, no derivado del codigo del cliente. Derivarlo seria
   comodo -se podria recalcular- pero ataria el credito al codigo de
   la visita: el dia que un credito se pueda reclamar, cualquiera que
   hubiera visto ese codigo podria calcular su identificador.
   ------------------------------------------------------------ */
const ALFABETO_CREDITO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function idCredito(): string {
  const n = new Uint32Array(8);
  crypto.getRandomValues(n);
  return `ATH-CR-${Array.from(n, (v) => ALFABETO_CREDITO[v % ALFABETO_CREDITO.length]).join('')}`;
}
