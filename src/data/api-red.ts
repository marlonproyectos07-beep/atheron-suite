/* ============================================================
   CLIENTE DE LA API — lo que usan las pantallas de ATH-LOOP-002

   QUE CAMBIA RESPECTO AL PILOTO TECNICO

   En ATH-PILOT-001 la verdad estaba en el navegador. Aqui la verdad
   esta en el servidor, y el navegador solo pregunta. La diferencia
   se nota en tres sitios: el codigo lo genera el servidor -y por eso
   ahora si es unico-, la redencion es idempotente, y el estado se ve
   igual desde el movil del cliente y desde el del restaurante.

   ============================================================
   SI NO HAY SERVIDOR, SE DICE. NO SE FINGE
   ============================================================

   El almacen todavia no esta autorizado ni configurado (es un gate
   de direccion: credenciales y coste). Mientras no lo este, la API
   responde 503 y estas pantallas lo dicen con todas las letras y no
   dejan seguir.

   La tentacion seria caer en el navegador "mientras tanto". Seria
   repetir, con mas pasos, el problema que este modulo viene a
   resolver: dos moviles que no se ven y una redencion que se puede
   hacer dos veces. Para probar sin servidor ya estan las paginas de
   /piloto, que dicen exactamente lo que son.

   El unico dato que se guarda en el navegador es el codigo propio
   del cliente, para poder volver a ensenarselo. No es la fuente de
   verdad de nada: si se pierde, el servidor sigue teniendo la
   transaccion entera.
   ============================================================ */

import type { Fuente } from './transacciones-red.ts';
import type { CreditoVista } from './credito-ledger.ts';

export const RUTAS = {
  activar: '/red/la-triada',
  validar: '/red/la-triada/validar',
  seguimiento: '/red/la-triada/seguimiento',
  informe: '/red/la-triada/informe',
  desde: '/red/la-triada/desde',
} as const;

const API = {
  activar: '/api/activar',
  transaccion: '/api/transaccion',
  redimir: '/api/redimir',
  seguimiento: '/api/seguimiento',
  reporte: '/api/reporte',
  operador: '/api/operador',
} as const;

/* La vista que devuelve el servidor. NO es la transaccion completa:
   el servidor la construye por lista blanca y esto es su reflejo. Si
   aqui apareciera un campo de mas, seria mentira: no llega. */
export interface TransaccionVista {
  codigo: string;
  estado: 'ACTIVADO' | 'VALIDADO' | 'REDIMIDO' | 'NO_REDIMIDO';
  activadoEn: string;
  redimidoEn?: string;
  vigente: boolean;
  consumo?: number;
  credito?: number;
  creditoId?: string;
  creditoVista?: CreditoVista;
  seguimientoConsentido: boolean;
  tieneOpinion: boolean;
  /* Solo con credencial de operador. */
  fuente?: Fuente;
  personas?: number;
  personasPrevistas?: number;
  comision?: number;
}

export interface RespuestaApi<T> {
  ok: boolean;
  datos?: T;
  motivo?: string;
  explicacion?: string;
  yaRedimida?: boolean;
  /** La venta quedó registrada, pero su crédito no se pudo emitir. */
  creditoPendiente?: boolean;
  /** true cuando el fallo es de conexion o de configuracion, no del dato. */
  sinServidor?: boolean;
}

export const SIN_SERVIDOR =
  'El registro central de la Red Atheron todavía no está configurado, así que esto no puede ' +
  'guardarse. No es un fallo de la pantalla: falta autorizar y provisionar el almacén.';

async function llama<T>(
  ruta: string,
  opciones: { metodo?: 'GET' | 'POST'; cuerpo?: unknown; credencial?: string } = {},
): Promise<RespuestaApi<T>> {
  let respuesta: Response;
  const cabeceras: Record<string, string> = {};
  if (opciones.cuerpo) cabeceras['content-type'] = 'application/json';
  /* La credencial va en cabecera, nunca en la direccion: las
     direcciones acaban en registros, historiales y capturas. */
  if (opciones.credencial) cabeceras.authorization = `Bearer ${opciones.credencial}`;
  try {
    respuesta = await fetch(ruta, {
      method: opciones.metodo ?? 'GET',
      headers: Object.keys(cabeceras).length ? cabeceras : undefined,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch {
    /* Sin red, o la API no existe en este despliegue. */
    return { ok: false, sinServidor: true, motivo: 'SIN_CONEXION', explicacion: SIN_SERVIDOR };
  }

  let cuerpo: RespuestaApi<T>;
  try {
    cuerpo = (await respuesta.json()) as RespuestaApi<T>;
  } catch {
    /* Un 404 de HTML cuando la API no esta desplegada: se distingue
       de un error de datos para no culpar a quien teclea. */
    return { ok: false, sinServidor: true, motivo: 'SIN_API', explicacion: SIN_SERVIDOR };
  }

  if (respuesta.status === 503 || cuerpo.motivo === 'ALMACEN_NO_CONFIGURADO') {
    return { ...cuerpo, ok: false, sinServidor: true, explicacion: SIN_SERVIDOR };
  }
  return cuerpo;
}

/* ------------------------------------------------------------
   LAS CUATRO LLAMADAS
   ------------------------------------------------------------ */
export interface DatosActivar {
  fuente?: Fuente;
  personas?: number;
  contacto?: string;
  consienteSeguimiento?: boolean;
}

export const activar = (datos: DatosActivar = {}): Promise<RespuestaApi<TransaccionVista>> =>
  llama(API.activar, { metodo: 'POST', cuerpo: datos });

export const consultar = (codigo: string, credencial?: string): Promise<RespuestaApi<TransaccionVista>> =>
  llama(`${API.transaccion}?c=${encodeURIComponent(codigo)}`, { credencial });

/* Redimir y cerrar son del operador del aliado. Sin credencial, el
   servidor responde 401: no es que la pantalla lo esconda, es que la
   accion no existe para quien no es el local. */
export const redimir = (
  datos: { codigo: string; consumo: number; personas?: number; nota?: string },
  credencial: string,
): Promise<RespuestaApi<TransaccionVista>> =>
  llama(API.redimir, { metodo: 'POST', cuerpo: datos, credencial });

export const cerrarSinConsumo = (
  codigo: string,
  credencial: string,
): Promise<RespuestaApi<TransaccionVista>> =>
  llama(API.redimir, { metodo: 'POST', cuerpo: { codigo, cerrar: true }, credencial });

export const opinar = (datos: {
  codigo: string;
  satisfaccion?: number;
  comentario?: string;
  incidencia?: boolean;
}): Promise<RespuestaApi<TransaccionVista>> => llama(API.seguimiento, { metodo: 'POST', cuerpo: datos });

/* ------------------------------------------------------------
   LA CREDENCIAL DEL LOCAL

   Se teclea una vez y se queda en la memoria de ESA pestana. No en
   localStorage: una credencial que sobrevive a cerrar el navegador
   es una credencial que se queda en un movil prestado.
   ------------------------------------------------------------ */
export const CLAVE_CREDENCIAL = 'atheron.red.operador.v1';

/** ¿Sirve esta credencial? Se pregunta al teclearla, no al cobrar. */
export const compruebaCredencial = (credencial: string): Promise<RespuestaApi<never>> =>
  llama(API.operador, { credencial });

export const guardaCredencial = (valor: string): void => {
  try {
    sessionStorage.setItem(CLAVE_CREDENCIAL, valor);
  } catch {
    /* Se tecleara otra vez. */
  }
};

export const credencialGuardada = (): string => {
  try {
    return sessionStorage.getItem(CLAVE_CREDENCIAL) ?? '';
  } catch {
    return '';
  }
};

export const olvidaCredencial = (): void => {
  try {
    sessionStorage.removeItem(CLAVE_CREDENCIAL);
  } catch {
    /* Nada que hacer. */
  }
};

/** El informe pide token. Se manda en cabecera, nunca en la direccion. */
export async function informe<T>(fecha: string, token: string): Promise<RespuestaApi<T>> {
  try {
    const respuesta = await fetch(`${API.reporte}?fecha=${encodeURIComponent(fecha)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const cuerpo = (await respuesta.json()) as RespuestaApi<T>;
    if (respuesta.status === 503) return { ...cuerpo, ok: false, sinServidor: true, explicacion: SIN_SERVIDOR };
    return cuerpo;
  } catch {
    return { ok: false, sinServidor: true, explicacion: SIN_SERVIDOR };
  }
}

/* ------------------------------------------------------------
   EL RECUERDO DEL CODIGO — comodidad, no registro

   Solo para que el cliente pueda volver a ver su codigo sin
   activarlo otra vez. Todo entre try: un navegador puede tener el
   almacenamiento cerrado, y eso no puede romper la pantalla.
   ------------------------------------------------------------ */
export const CLAVE_MI_CODIGO = 'atheron.red.la-triada.codigo.v1';

export const recuerda = (codigo: string): void => {
  try {
    localStorage.setItem(CLAVE_MI_CODIGO, codigo);
  } catch {
    /* Sin sitio donde guardar, el codigo sigue en pantalla. */
  }
};

export const recordado = (): string | null => {
  try {
    return localStorage.getItem(CLAVE_MI_CODIGO);
  } catch {
    return null;
  }
};

export const olvida = (): void => {
  try {
    localStorage.removeItem(CLAVE_MI_CODIGO);
  } catch {
    /* Nada que hacer. */
  }
};

/* ------------------------------------------------------------
   LA FUENTE

   De donde venia quien activa. Llega por ?f= en la direccion -la
   pone el enlace de la ficha, del blog o el QR del local- y se
   recuerda durante la visita, porque el QR inverso lleva a alguien a
   Atheron hoy y esa persona puede reservar manana.
   ------------------------------------------------------------ */
export const CLAVE_FUENTE = 'atheron.red.fuente.v1';

export function guardaFuente(fuente: string): void {
  try {
    sessionStorage.setItem(CLAVE_FUENTE, fuente);
  } catch {
    /* Se seguira usando la de la direccion, si la hay. */
  }
}

export function fuenteGuardada(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_FUENTE);
  } catch {
    return null;
  }
}
