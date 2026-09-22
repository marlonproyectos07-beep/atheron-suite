/* ============================================================
   SERVICIO DE LA RED — la logica del backend, sin HTTP

   POR QUE LA LOGICA NO VIVE EN LOS ENDPOINTS

   Los archivos de /api son adaptadores de diez lineas: leen el
   cuerpo, llaman aqui y devuelven JSON. Todo lo que decide algo esta
   en este archivo, y por eso se puede probar entero sin levantar un
   servidor ni simular una peticion. Las pruebas de
   scripts/prueba-loop002.mts llaman a estas funciones tal cual, con
   un almacen de mentira.

   ============================================================
   LO QUE EL SERVIDOR RESUELVE Y EL NAVEGADOR NO PODIA
   ============================================================

   UNICIDAD DEL CODIGO. El codigo lo genera el servidor y lo escribe
   con "solo si no existe". Si ya estaba -cosa que en el navegador
   era imposible de saber-, se reintenta con otro. Ahora la unicidad
   no es "practicamente segura": esta comprobada.

   DOBLE REDENCION. Una transaccion se redime una vez. Intentarlo dos
   veces no da error feo ni cobra dos comisiones: devuelve la misma
   respuesta de la primera vez, diciendo que ya estaba redimida. Eso
   es lo que hace que reintentar sea seguro, que es justo lo que
   ocurre cuando la conexion del restaurante se cae a mitad.

   Y hay un cerrojo de treinta segundos por codigo, para el caso de
   dos aparatos confirmando el mismo consumo a la vez: sin el, los
   dos leerian "ACTIVADO" antes de que ninguno escribiera.

   ============================================================
   MINIMIZACION: EL CONTACTO NO SALE DE AQUI
   ============================================================

   El telefono, si lo hay, se guarda y no se devuelve nunca en
   ninguna respuesta: ni a la pantalla del local, ni al informe, ni a
   la notificacion. La pantalla del restaurante no necesita saber
   quien es el cliente para cobrarle, y lo que no viaja no se filtra.
   ============================================================ */

import { generarCodigo } from '../src/data/codigos-referido.ts';
import { diaColombiano, estaVigente, PILOTO } from '../src/data/piloto-la-triada.ts';
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
import { informeSemanal, semanaDe, conciliacionCuadra, type Informe } from '../src/data/reporte-aliado.ts';
import { almacen, type Almacen } from './_almacen.ts';

/* ------------------------------------------------------------
   LO QUE SALE HACIA FUERA

   Una transaccion publica es la transaccion SIN el contacto. Se
   construye quitando, no copiando campo a campo: si manana se anade
   un dato personal al modelo, este filtro lo sigue dejando fuera
   solo. Copiando campos, el nuevo se colaria el dia que alguien se
   olvide de actualizarlo.
   ------------------------------------------------------------ */
export type TransaccionPublica = Omit<Transaccion, 'consentimiento'> & {
  consentimiento: { seguimiento: boolean };
};

export const sinDatosPersonales = (t: Transaccion): TransaccionPublica => {
  const { consentimiento, ...resto } = t;
  return { ...resto, consentimiento: { seguimiento: consentimiento.seguimiento === true } };
};

export interface Respuesta<T> {
  ok: boolean;
  datos?: T;
  motivo?: MotivoRechazo | 'ALMACEN_NO_CONFIGURADO' | 'NO_AUTORIZADO' | 'ERROR';
  explicacion?: string;
}

const rechaza = <T>(motivo: MotivoRechazo): Respuesta<T> => ({
  ok: false,
  motivo,
  explicacion: EXPLICACION_RECHAZO[motivo],
});

/* ------------------------------------------------------------
   AVISOS A ATHERON

   Que Atheron se entere de una activacion o una redencion sin que
   nadie copie nada. Es una NOTIFICACION, no un registro: la verdad
   esta en el almacen, y este webhook puede fallar sin que se pierda
   ninguna transaccion. Por eso su error se traga: un aviso caido no
   puede tumbar una redencion que ya esta guardada.

   Si no hay webhook configurado, no se manda nada. No se envia
   WhatsApp ni correo a nadie desde aqui, y menos al cliente: eso
   necesita consentimiento y una decision de direccion.
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
  fuente?: Fuente;
  personasPrevistas?: number;
  contacto?: string;
  consienteSeguimiento?: boolean;
}

export async function activar(
  entrada: EntradaActivar,
  deposito: Almacen = almacen(),
): Promise<Respuesta<TransaccionPublica>> {
  /* Cinco intentos es de sobra: con 923.521 combinaciones, que dos
     choquen ya es raro, y que choquen cinco veces seguidas es
     imposible en la practica. Si pasara, es que algo va mal en el
     almacen y conviene enterarse, no seguir intentando. */
  for (let intento = 0; intento < 5; intento++) {
    const transaccion = creaActivacion({
      codigo: generarCodigo(PILOTO.slugAliado),
      fuente: entrada.fuente,
      personasPrevistas: entrada.personasPrevistas,
      consentimiento: entrada.consienteSeguimiento
        ? { seguimiento: true, contacto: entrada.contacto }
        : undefined,
    });

    if (await deposito.crea(transaccion)) {
      await avisa('activacion', {
        codigo: transaccion.codigo,
        fuente: transaccion.fuente,
        personas: transaccion.personasPrevistas ?? null,
        seguimiento: transaccion.consentimiento.seguimiento,
      });
      return { ok: true, datos: sinDatosPersonales(transaccion) };
    }
  }
  return { ok: false, motivo: 'ERROR', explicacion: 'No se pudo generar un código libre.' };
}

/* ------------------------------------------------------------
   CONSULTAR — lo que mira la pantalla del local al escanear
   ------------------------------------------------------------ */
export async function consultar(
  codigo: string,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<TransaccionPublica & { vigente: boolean }>> {
  const transaccion = await deposito.lee(codigo);
  if (!transaccion) return rechaza('NO_EXISTE');
  return {
    ok: true,
    datos: {
      ...sinDatosPersonales(transaccion),
      vigente: estaVigente(new Date(transaccion.activadoEn), ahora),
    },
  };
}

/* ------------------------------------------------------------
   REDIMIR — idempotente
   ------------------------------------------------------------ */
export interface EntradaRedimir {
  codigo: string;
  consumo: number;
  personas?: number;
  nota?: string;
}

export async function redimir(
  entrada: EntradaRedimir,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<TransaccionPublica> & { yaRedimida?: boolean }> {
  const guardada = await deposito.lee(entrada.codigo);
  if (!guardada) return rechaza('NO_EXISTE');

  /* Reintentar tiene que ser seguro: si ya estaba redimida se
     devuelve lo mismo de la primera vez, con la marca puesta. La
     pantalla lo muestra como "ya registrado", no como un fallo. */
  if (guardada.estado === 'REDIMIDO') {
    return {
      ok: true,
      yaRedimida: true,
      datos: sinDatosPersonales(guardada),
      explicacion: EXPLICACION_RECHAZO.YA_REDIMIDA,
    };
  }
  if (guardada.estado === 'NO_REDIMIDO') return rechaza('CERRADA');
  if (!estaVigente(new Date(guardada.activadoEn), ahora)) return rechaza('CADUCADA');

  if (!(await deposito.cierra(`redim:${entrada.codigo}`, 30))) {
    /* Otro aparato esta confirmando este mismo codigo ahora mismo.
       Se devuelve lo que hay, sin escribir encima. */
    const actual = await deposito.lee(entrada.codigo);
    return actual?.estado === 'REDIMIDO'
      ? { ok: true, yaRedimida: true, datos: sinDatosPersonales(actual) }
      : rechaza('YA_REDIMIDA');
  }

  const resultado = redime(guardada, entrada.consumo, {
    personas: entrada.personas,
    nota: entrada.nota,
    ahora,
  });
  if (!resultado.ok || !resultado.transaccion) return rechaza(resultado.motivo ?? 'ERROR' as MotivoRechazo);

  await deposito.guarda(resultado.transaccion);
  const e = resultado.transaccion.economia;
  await avisa('redencion', {
    codigo: resultado.transaccion.codigo,
    fuente: resultado.transaccion.fuente,
    personas: resultado.transaccion.personas ?? null,
    consumo: e?.consumo ?? null,
    comision: e?.comision ?? null,
    credito: e?.credito ?? null,
  });
  return { ok: true, datos: sinDatosPersonales(resultado.transaccion) };
}

export async function cerrar(
  codigo: string,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<TransaccionPublica>> {
  const guardada = await deposito.lee(codigo);
  if (!guardada) return rechaza('NO_EXISTE');
  const resultado = cierraSinConsumo(guardada, ahora);
  if (!resultado.ok || !resultado.transaccion) return rechaza(resultado.motivo ?? 'YA_REDIMIDA');
  await deposito.guarda(resultado.transaccion);
  return { ok: true, datos: sinDatosPersonales(resultado.transaccion) };
}

/* ------------------------------------------------------------
   SEGUIMIENTO — "¿Como te fue en La Triada?"

   Solo sobre una transaccion redimida: preguntar por una visita que
   no consta es pedirle a alguien que valore algo que no hizo.
   ------------------------------------------------------------ */
export interface EntradaSeguimiento {
  codigo: string;
  satisfaccion?: number;
  comentario?: string;
  incidencia?: boolean;
}

export async function opinar(
  entrada: EntradaSeguimiento,
  deposito: Almacen = almacen(),
  ahora = new Date(),
): Promise<Respuesta<TransaccionPublica>> {
  const guardada = await deposito.lee(entrada.codigo);
  if (!guardada) return rechaza('NO_EXISTE');
  if (guardada.estado !== 'REDIMIDO') return rechaza('NO_EXISTE');

  const actualizada = anotaSeguimiento(guardada, entrada, ahora);
  await deposito.guarda(actualizada);
  await avisa('seguimiento', {
    codigo: actualizada.codigo,
    satisfaccion: actualizada.seguimiento?.satisfaccion ?? null,
    incidencia: actualizada.seguimiento?.incidencia ?? false,
  });
  return { ok: true, datos: sinDatosPersonales(actualizada) };
}

/* ------------------------------------------------------------
   INFORME SEMANAL

   Se leen los dias de la semana pedida y el lunes anterior: una
   activacion del domingo puede redimirse el lunes siguiente, y el
   indice esta por dia de activacion. Sin ese margen, esa redencion
   no aparece en ningun informe.
   ------------------------------------------------------------ */
export async function informe(
  fecha: string,
  deposito: Almacen = almacen(),
): Promise<Respuesta<Informe & { cuadra: boolean; detalleConciliacion: string }>> {
  const semana = semanaDe(fecha);
  const dias: string[] = [];
  const desde = new Date(`${semana.lunes}T12:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - 7);
  for (let i = 0; i < 14; i++) {
    const d = new Date(desde);
    d.setUTCDate(desde.getUTCDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }

  const lotes = await Promise.all(dias.map((d) => deposito.delDia(d)));
  const transacciones = lotes.flat();
  const resultado = informeSemanal(transacciones, semana);
  const conciliacion = conciliacionCuadra(resultado);
  return {
    ok: true,
    datos: { ...resultado, cuadra: conciliacion.cuadra, detalleConciliacion: conciliacion.detalle },
  };
}

/** El dia de hoy en Colombia. Lo usa el informe cuando no le dan fecha. */
export const hoyColombiano = (): string => diaColombiano(new Date());
