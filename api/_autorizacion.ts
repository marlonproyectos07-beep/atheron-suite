/* ============================================================
   AUTORIZACION Y LIMITE DE ABUSO

   ============================================================
   EL AGUJERO QUE CIERRA ESTE ARCHIVO
   ============================================================

   La auditoria lo dijo sin rodeos: cualquiera que conociera un
   codigo podia llamar a /api/redimir y declarar una venta, o cerrar
   la del cliente de al lado. El codigo del cliente era, a la vez, la
   credencial del restaurante. Eso no es un fallo de validacion: es
   que la frontera de confianza estaba en el sitio equivocado.

   Son dos papeles distintos y necesitan dos pruebas distintas:

     CLIENTE   tiene un codigo. Sirve para que le identifiquen y para
               consultar SU visita. No autoriza nada mas.
     OPERADOR  trabaja en el aliado. Puede declarar consumo y cerrar
               sin consumo. Necesita credencial propia.

   Tener el codigo del cliente NO concede el papel de operador. Es la
   regla entera, y hay una prueba dedicada a que siga siendo cierta.

   ============================================================
   COMO SE PRUEBA QUE ALGUIEN ES OPERADOR
   ============================================================

   Con una credencial por aliado, que se teclea UNA VEZ en el movil
   del local y se queda en la memoria de esa pestana. Viaja en la
   cabecera Authorization, nunca en la direccion -las direcciones
   acaban en registros, en historiales y en capturas de pantalla-.

   EL QR NO LLEVA SECRETOS. Lleva el codigo del cliente y nada mas.
   Un QR se fotografia, se reenvia por WhatsApp y se pega en una
   mesa: cualquier secreto que viaje ahi deja de serlo el primer dia.

   EN EL SERVIDOR SOLO ESTA EL HASH. La variable de entorno guarda el
   SHA-256 de la credencial, no la credencial. Si alguien lee las
   variables del despliegue, no se lleva nada que pueda teclear. Por
   eso la credencial tiene que ser LARGA y aleatoria: un PIN de
   cuatro cifras se descubre desde su hash en un segundo, y entonces
   guardar el hash no habria servido de nada.

   ============================================================
   COMO CRECE A VARIOS ALIADOS
   ============================================================

   Hoy: una variable por aliado, derivada de su slug.

     ATHERON_OPERADOR_LA_TRIADA = <sha256 en hexadecimal>

   Anadir el segundo aliado es anadir su variable; no se toca codigo.
   Eso aguanta bien hasta unos diez aliados.

   A partir de ahi el camino esta escrito y no cambia nada de lo de
   arriba: los operadores pasan a ser registros del propio almacen
   (namespace "op"), con su hash, su aliado, su alta y su baja, y
   esta funcion busca ahi en vez de en el entorno. Lo que no cambia
   nunca es que el servidor guarde el hash y que el QR no lleve
   secretos.

   Lo que este piloto NO hace, y conviene decirlo: la credencial es
   del LOCAL, no de la persona que atiende. No hay usuarios, ni
   turnos, ni "quien registro esta cuenta". Para un piloto de un
   aliado es suficiente; para pagar comisiones a varios, no.
   ============================================================ */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Almacen } from './_almacen.ts';

export type Papel = 'OPERADOR' | 'ADMIN';

/** El nombre de la variable de entorno de un aliado. */
export const variableDe = (aliado: string): string =>
  `ATHERON_OPERADOR_${aliado.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

const sha256 = (texto: string): Buffer => createHash('sha256').update(texto, 'utf8').digest();

/**
 * Compara sin filtrar por tiempo. timingSafeEqual exige la misma
 * longitud, y por eso se comparan los HASHES y no los textos: los
 * hashes siempre miden 32 bytes, asi que la longitud de la
 * credencial no se deduce del error.
 */
function coincide(recibido: string, esperadoHex: string): boolean {
  let esperado: Buffer;
  try {
    esperado = Buffer.from(esperadoHex.trim(), 'hex');
  } catch {
    return false;
  }
  if (esperado.length !== 32) return false;
  return timingSafeEqual(sha256(recibido), esperado);
}

/* ------------------------------------------------------------
   LA CABECERA

   Tres casos distintos, y se distinguen porque merecen respuestas
   distintas: no hay credencial (401), hay algo que no tiene forma de
   credencial (400: el cliente esta mal escrito, no es que le falten
   permisos), o hay una credencial que se puede comprobar.

   Se exige el formato Bearer de forma estricta. Aceptar la cabecera
   "a pelo" parece amable y lo que hace es tragarse cualquier cosa
   que llegue, incluida una cookie o un token de otro sistema.
   ------------------------------------------------------------ */
export type Cabecera =
  | { tipo: 'AUSENTE' }
  | { tipo: 'MALFORMADA' }
  | { tipo: 'PRESENTE'; valor: string };

export function credencialDe(cabeceras: Record<string, string | string[] | undefined>): Cabecera {
  const bruta = cabeceras.authorization ?? cabeceras.Authorization;
  /* Una cabecera repetida llega como lista. Dos credenciales no son
     una credencial: se rechaza por malformada en vez de elegir una,
     que es como se cuelan las peticiones ambiguas. */
  if (Array.isArray(bruta)) return bruta.length === 1 ? analizaCabecera(bruta[0]) : { tipo: 'MALFORMADA' };
  if (bruta === undefined || bruta === null) return { tipo: 'AUSENTE' };
  if (typeof bruta !== 'string') return { tipo: 'MALFORMADA' };
  return analizaCabecera(bruta);
}

function analizaCabecera(bruta: string): Cabecera {
  const texto = bruta.trim();
  if (!texto) return { tipo: 'AUSENTE' };
  const encaja = /^Bearer\s+(\S+)$/i.exec(texto);
  if (!encaja) return { tipo: 'MALFORMADA' };
  return { tipo: 'PRESENTE', valor: encaja[1] };
}

/**
 * ¿Quien llama puede actuar como operador de este aliado?
 * Sin variable configurada, NO. Nunca "abierto mientras tanto": asi
 * es como se quedan abiertos.
 */
export function esOperador(credencial: string, aliado: string): boolean {
  if (!credencial) return false;
  const esperado = process.env[variableDe(aliado)];
  if (!esperado) return false;
  return coincide(credencial, esperado);
}

/** Lo mismo para el informe de conciliacion, que es de Atheron. */
export function esAdmin(credencial: string): boolean {
  if (!credencial) return false;
  const esperado = process.env.ATHERON_TOKEN_ADMIN;
  if (!esperado) return false;
  return coincide(credencial, esperado);
}

/* ------------------------------------------------------------
   LIMITE DE ABUSO

   Los endpoints publicos son tres puertas abiertas a internet:
   activar crea registros, consultar permite probar codigos uno a
   uno, y seguimiento escribe texto. Sin limite, cualquiera con un
   bucle llena el almacen o prueba codigos hasta encontrar uno.

   Es un contador por ventana, guardado en el mismo almacen y sumado
   con una operacion atomica. No es un anti-abuso sofisticado y no
   pretende serlo: corta el bucle tonto, que es el que va a llegar.

   LA IDENTIDAD DEL QUE LLAMA

   Se usa la IP que pone la plataforma en x-forwarded-for. Se puede
   falsificar detras de algunos proxies, pero en Vercel la escribe la
   propia plataforma y no el cliente. Se toma SOLO la primera, que es
   la del visitante; las siguientes las anaden los intermediarios y
   se pueden inyectar.

   Y se guarda HASHEADA. Una IP es un dato personal: para contar
   peticiones basta con distinguir, no con saber de quien es.
   ------------------------------------------------------------ */
export function quienLlama(cabeceras: Record<string, string | string[] | undefined>): string {
  const bruta = cabeceras['x-forwarded-for'] ?? cabeceras['x-real-ip'];
  const texto = Array.isArray(bruta) ? bruta[0] : (bruta ?? '');
  const primera = texto.split(',')[0]?.trim() || 'desconocida';
  return createHash('sha256').update(primera).digest('hex').slice(0, 16);
}

export interface Limite {
  /** Cuantas peticiones se admiten en la ventana. */
  max: number;
  /** Ventana en segundos. */
  ventana: number;
}

/** Limites por endpoint. Generosos para una persona, cortos para un bucle. */
export const LIMITES: Record<string, Limite> = {
  activar: { max: 20, ventana: 600 },
  transaccion: { max: 60, ventana: 600 },
  redimir: { max: 60, ventana: 600 },
  seguimiento: { max: 10, ventana: 600 },
  reporte: { max: 30, ventana: 600 },
  /* Intentos de credencial equivocada. Mucho mas corto: es lo que
     usa quien prueba a adivinarla. */
  credencial: { max: 10, ventana: 900 },
};

const cubeta = (endpoint: string, quien: string, ahora: Date): string => {
  /* La ventana entra en la clave: asi caduca sola y no hay que
     acordarse de reiniciar contadores. */
  const limite = LIMITES[endpoint];
  return `${endpoint}:${quien}:${Math.floor(ahora.getTime() / (limite.ventana * 1000))}`;
};

/**
 * Suma uno y dice si se ha pasado. Para endpoints de trafico normal.
 *
 * Si el contador falla, NO se bloquea la peticion: un contador caido
 * no puede dejar sin registrar una venta que ya ocurrio. Para las
 * credenciales la decision es la contraria, y esta abajo.
 */
export async function pasaLimite(
  deposito: Almacen,
  endpoint: string,
  quien: string,
  ahora = new Date(),
): Promise<boolean> {
  const limite = LIMITES[endpoint];
  if (!limite) return true;
  try {
    const n = await deposito.contador(cubeta(endpoint, quien, ahora), limite.ventana);
    return n <= limite.max;
  } catch {
    return true;
  }
}

/* ============================================================
   LA POLITICA UNICA DE AUTENTICACION

   La reauditoria encontro que el contador de credenciales fallidas
   se incrementaba pero su resultado se ignoraba: el intento numero
   once seguia llegando a comprobar la credencial. Y /api/transaccion
   permitia probar credenciales sin contabilizarlas igual que el
   resto.

   Ahora hay UNA funcion, y todos los endpoints protegidos pasan por
   ella. El orden importa y es este:

     1. Mirar cuantos fallos lleva quien llama, SIN sumar.
     2. Si ya se paso, cortar AQUI. No se comprueba la credencial.
     3. Comprobar.
     4. Si falla, sumar uno.
     5. Si acierta, no sumar nada: un operador con trabajo no puede
        agotarse su propio cupo acertando.

   QUE PASA SI EL CONTADOR NO RESPONDE: FAIL-CLOSED

   Aqui NO se deja pasar. Y no es una postura dura por gusto: el
   contador vive en el MISMO almacen donde hay que escribir la venta.
   Si no responde, la redencion tampoco se iba a poder guardar, asi
   que dejar pasar la autenticacion no salvaria ninguna operacion;
   solo abriria la puerta a probar credenciales justo cuando el
   sistema esta ciego.

   Lo que si se respeta: una venta YA confirmada no se toca ni se
   deshace por esto. El fallo corta autenticaciones nuevas, no
   registros existentes.
   ============================================================ */
export type Veredicto = 'OK' | 'AUSENTE' | 'MALFORMADA' | 'INVALIDA' | 'BLOQUEADO' | 'ALMACEN';

export async function autoriza(
  deposito: Almacen,
  cabeceras: Record<string, string | string[] | undefined>,
  papel: Papel,
  aliado: string,
  ahora = new Date(),
): Promise<Veredicto> {
  const cabecera = credencialDe(cabeceras);
  if (cabecera.tipo === 'AUSENTE') return 'AUSENTE';
  if (cabecera.tipo === 'MALFORMADA') return 'MALFORMADA';

  const quien = quienLlama(cabeceras);
  const clave = cubeta('credencial', quien, ahora);
  const limite = LIMITES.credencial;

  let fallos: number;
  try {
    fallos = await deposito.cuenta(clave);
  } catch {
    return 'ALMACEN';
  }
  if (fallos >= limite.max) return 'BLOQUEADO';

  const vale = papel === 'ADMIN' ? esAdmin(cabecera.valor) : esOperador(cabecera.valor, aliado);
  if (vale) return 'OK';

  try {
    await deposito.contador(clave, limite.ventana);
  } catch {
    /* No se pudo anotar el fallo. Se rechaza igual: lo que no puede
       pasar es que un contador caido convierta un intento fallido en
       un intento gratis. */
    return 'ALMACEN';
  }
  return 'INVALIDA';
}

/** La respuesta HTTP que corresponde a cada veredicto. */
export const RESPUESTA_AUTORIZACION: Record<Exclude<Veredicto, 'OK'>, { estado: number; cuerpo: unknown }> = {
  AUSENTE: {
    estado: 401,
    cuerpo: {
      ok: false,
      motivo: 'NO_AUTORIZADO',
      explicacion: 'Esta pantalla es del personal del local. Hace falta su credencial.',
    },
  },
  MALFORMADA: {
    estado: 400,
    cuerpo: {
      ok: false,
      motivo: 'CABECERA_INVALIDA',
      explicacion: 'La credencial se manda como «Authorization: Bearer <credencial>», una sola vez.',
    },
  },
  INVALIDA: {
    estado: 401,
    cuerpo: { ok: false, motivo: 'NO_AUTORIZADO', explicacion: 'Esa credencial no es la de este local.' },
  },
  BLOQUEADO: {
    estado: 429,
    cuerpo: {
      ok: false,
      motivo: 'DEMASIADAS_PETICIONES',
      explicacion: 'Demasiados intentos fallidos. Espera un rato antes de volver a intentarlo.',
    },
  },
  ALMACEN: {
    estado: 503,
    cuerpo: { ok: false, motivo: 'ALMACEN_INCIERTO' },
  },
};
