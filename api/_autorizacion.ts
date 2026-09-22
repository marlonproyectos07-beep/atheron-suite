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

/** Saca la credencial de la cabecera. Nunca de la direccion. */
export function credencialDe(cabeceras: Record<string, string | string[] | undefined>): string {
  const bruta = cabeceras.authorization ?? cabeceras.Authorization;
  const texto = Array.isArray(bruta) ? bruta[0] : (bruta ?? '');
  return texto.replace(/^Bearer\s+/i, '').trim();
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

/**
 * Suma uno y dice si se ha pasado.
 * Si el almacen falla, NO se bloquea la peticion: un contador caido
 * no puede dejar sin registrar una venta que ya ocurrio.
 */
export async function pasaLimite(
  deposito: Almacen,
  endpoint: string,
  quien: string,
  ahora = new Date(),
): Promise<boolean> {
  const limite = LIMITES[endpoint];
  if (!limite) return true;
  /* La ventana entra en la clave: asi caduca sola y no hay que
     acordarse de reiniciar contadores. */
  const cubo = Math.floor(ahora.getTime() / (limite.ventana * 1000));
  try {
    const n = await deposito.contador(`${endpoint}:${quien}:${cubo}`, limite.ventana);
    return n <= limite.max;
  } catch {
    return true;
  }
}
