/* ============================================================
   CLIENTE DE LA API — lo que usan las pantallas de ATH-LOOP-002

   QUE CAMBIA RESPECTO AL PILOTO TECNICO

   En ATH-PILOT-001 la verdad estaba en el navegador. Aqui la verdad
   esta en el servidor, y el navegador solo pregunta. La diferencia
   se nota en tres sitios: el codigo lo genera el servidor -y por eso
   ahora si es unico-, la redencion es idempotente, y el estado se ve
   igual desde el movil del cliente y desde el del restaurante.

   ============================================================
   SI ALGO FALLA, SE DICE QUE FALLO. NO SE FINGE, Y NO SE MIENTE
   ============================================================

   No se cae al navegador "mientras tanto": seria repetir, con mas
   pasos, el problema que este modulo viene a resolver -dos moviles
   que no se ven y una redencion que se puede hacer dos veces-. Para
   probar sin servidor ya estan las paginas de /piloto, que dicen
   exactamente lo que son.

   Pero tampoco se le echa la culpa al sitio equivocado. Mas abajo
   estan las cuatro clases de fallo y por que hubo que separarlas.

   El unico dato que se guarda en el navegador es el codigo propio
   del cliente, para poder volver a ensenarselo. No es la fuente de
   verdad de nada: si se pierde, el servidor sigue teniendo la
   transaccion entera.
   ============================================================ */

import type { Fuente } from './transacciones-red.ts';

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
  estado: '/api/estado',
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
  /* Lo unico que se puede decir del credito mientras no exista
     vinculacion. Ni identificador, ni saldo, ni estado detallado:
     conocer un codigo no puede dar acceso a un saldo. */
  creditoPendienteVinculacion?: boolean;
  tieneOpinion?: boolean;
  /* Solo con credencial de operador. */
  fuente?: Fuente;
  personas?: number;
  personasPrevistas?: number;
  /* Llega con credencial de operador pero la pantalla del local NO
     la pinta: es cuenta interna entre Atheron y el aliado. */
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
  /** true cuando no hubo respuesta util del servidor (red o API). */
  sinServidor?: boolean;
  /** Que tipo de problema fue. Lo mira quien depura, no el cliente. */
  clase?: ClaseDeFallo;
}

/* ============================================================
   POR QUE UN FALLO NO ES "EL ALMACEN NO ESTA CONFIGURADO"

   En la prueba fisica el cliente vio, palabra por palabra, que el
   registro central no estaba configurado. Era mentira: Redis ya
   estaba provisionado y conectado. Lo que habia fallado era el
   empaquetado de la funcion, que devolvio un 500 con una pagina de
   error de Vercel; como no era JSON, este modulo lo metia en el
   mismo saco que "no hay almacen" y enseñaba ese texto.

   Un mensaje que acusa al sitio equivocado es peor que uno generico:
   manda a arreglar lo que no esta roto. Asi que ahora se distinguen
   cuatro cosas, que son cuatro problemas distintos con cuatro
   soluciones distintas:

     RED          el movil no llego a salir. Lo arregla el cliente.
     API          la direccion no existe o no contesta JSON: el
                  despliegue esta mal. Lo arregla quien despliega.
     ALMACEN      el servidor contesta, y dice que no puede guardar.
                  Lo arregla quien configura el almacen.
     SERVIDOR     el servidor contesta y se rompe por dentro. Lo
                  arregla quien programa.

   Y ninguno de los cuatro le cuenta al cliente de que va: lee una
   frase corta y sabe si puede reintentar. El detalle tecnico va en
   `motivo`, que es lo que mira quien depura, no quien cena.
   ============================================================ */
export type ClaseDeFallo = 'RED' | 'API' | 'ALMACEN' | 'SERVIDOR' | 'DATOS';

/** Lo que ve el cliente. Corto, sin jerga y sin culpar a nadie. */
export const MENSAJE_FALLO: Record<ClaseDeFallo, string> = {
  RED: 'No hay conexión. Revisa tus datos o el wifi y vuelve a intentarlo.',
  API: 'Esto no está disponible en este momento. Vuelve a intentarlo en un minuto.',
  ALMACEN: 'No podemos guardarlo ahora mismo. Vuelve a intentarlo en un minuto.',
  SERVIDOR: 'Algo falló de nuestro lado. Vuelve a intentarlo en un minuto.',
  DATOS: 'Revisa lo que has escrito y vuelve a intentarlo.',
};

/* El unico texto que sigue explicando de verdad lo que pasa, porque
   es el unico caso en el que no hay nada que reintentar: el almacen
   no esta configurado. Solo se usa cuando el SERVIDOR lo dice con
   ese codigo exacto, nunca por descarte. */
export const SIN_ALMACEN_CONFIGURADO =
  'El registro central de la Red Atheron todavía no está configurado, así que esto no puede ' +
  'guardarse. No es un fallo de la pantalla: falta autorizar y provisionar el almacén.';

/** Nombre antiguo, mantenido para no romper lo que ya lo importaba. */
export const SIN_SERVIDOR = SIN_ALMACEN_CONFIGURADO;

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
    /* fetch solo lanza si la peticion no llego a completarse: sin
       red, DNS caido, el navegador la corto. Nunca por un 500. */
    return falla('RED', 'SIN_CONEXION');
  }

  let cuerpo: RespuestaApi<T> | null = null;
  try {
    cuerpo = (await respuesta.json()) as RespuestaApi<T>;
  } catch {
    /* No es JSON. Toda nuestra API contesta JSON siempre, asi que
       esto es una pagina de error de la plataforma. El codigo de
       estado dice cual de los dos problemas es. */
    cuerpo = null;
  }

  if (cuerpo === null || typeof cuerpo !== 'object') {
    if (respuesta.status === 404 || respuesta.status === 405) return falla('API', `HTTP_${respuesta.status}`);
    if (respuesta.status >= 500) return falla('SERVIDOR', `HTTP_${respuesta.status}`);
    return falla('API', `HTTP_${respuesta.status}`);
  }

  /* A partir de aqui el servidor contesto JSON: es NUESTRA respuesta,
     y su motivo manda sobre el codigo de estado. */
  if (cuerpo.motivo === 'ALMACEN_NO_CONFIGURADO') {
    return { ...cuerpo, ok: false, clase: 'ALMACEN', sinServidor: true, explicacion: SIN_ALMACEN_CONFIGURADO };
  }
  if (cuerpo.motivo === 'ALMACEN_INCIERTO') {
    /* El almacen existe y no contesto lo que debia. Se puede
       reintentar, y NO se le dice al cliente que falte configurar
       nada: eso mandaria a tocar lo que ya esta bien. */
    return { ...cuerpo, ok: false, clase: 'ALMACEN', explicacion: MENSAJE_FALLO.ALMACEN };
  }
  if (respuesta.status >= 500) {
    return { ...cuerpo, ok: false, clase: 'SERVIDOR', explicacion: cuerpo.explicacion ?? MENSAJE_FALLO.SERVIDOR };
  }
  if (!respuesta.ok && cuerpo.explicacion === undefined) {
    /* 400, 401, 404, 409, 429 sin texto: es un problema del dato o
       del momento, no de la maquina. */
    return { ...cuerpo, ok: false, clase: 'DATOS', explicacion: MENSAJE_FALLO.DATOS };
  }
  return cuerpo;
}

const falla = <T>(clase: ClaseDeFallo, motivo: string): RespuestaApi<T> => ({
  ok: false,
  clase,
  motivo,
  explicacion: MENSAJE_FALLO[clase],
  /* Se mantiene porque hay pantallas que lo miran, pero ya no
     significa "no hay almacen": significa "no hubo respuesta util". */
  sinServidor: clase === 'RED' || clase === 'API',
});

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

/* Lo que ve el cliente que espera con el QR abierto. Solo lectura y
   solo lo suyo: ni comision, ni margen, ni nada del operador. */
export interface EstadoPublico {
  codigo: string;
  estado: TransaccionVista['estado'];
  vigente: boolean;
  consumo?: number;
  credito?: number;
  vigenciaCreditoDias?: number;
}

export const estadoPublico = (codigo: string): Promise<RespuestaApi<EstadoPublico>> =>
  llama(`${API.estado}?c=${encodeURIComponent(codigo)}`);

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

   EL RIESGO QUE ESTO TIENE, DICHO

   sessionStorage lo puede leer cualquier JavaScript que llegue a
   ejecutarse en esta pagina. Si alguna vez entrara un script ajeno
   -un XSS-, se llevaria la credencial del local mientras la pestana
   siga abierta. Se asume a sabiendas porque estas paginas no cargan
   nada de terceros, no aceptan HTML de nadie y duran lo que dura un
   turno.

   Lo que lo cerraria de verdad es una cookie HttpOnly emitida por el
   servidor, que el JavaScript no puede leer. Eso necesita sesiones,
   y sesiones necesitan decidir su duracion y su cierre: es trabajo
   de la siguiente fase, no de este piloto, y queda anotado como tal
   en docs/loop-002-la-triada.md.

   Mientras tanto: la credencial se borra al cerrar la pestana, y la
   pantalla ofrece salir a mano.
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
export const informe = <T>(fecha: string, token: string): Promise<RespuestaApi<T>> =>
  llama<T>(`${API.reporte}?fecha=${encodeURIComponent(fecha)}`, { credencial: token });

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
