/* ============================================================
   QUE HACER CON LO QUE LEE LA CAMARA

   El QR del cliente lleva una direccion:
     https://<sitio><RUTAS.validar>?c=ATH-TRI-K7M2Q

   De ahi solo interesa el codigo. Pero antes de buscarlo hay que
   saber que el QR ES NUESTRO: la camara lee cualquier cosa que se le
   ponga delante -la carta del restaurante, un QR de pago, el de la
   wifi- y buscar "lo que sea" en el servidor solo produce errores
   confusos delante de una fila.

   Se aceptan tres formas:
     - una direccion de ESTE mismo sitio (el Preview o el que sea),
     - una direccion del dominio oficial (con o sin www),
     - el codigo suelto, por si alguien imprime solo el texto.

   Todo lo demas se rechaza diciendo POR QUE, en una frase.

   Nada de esto sale del telefono: se decide aqui, en el navegador.
   ============================================================ */
import { leerCodigo } from './codigos-referido.ts';

export type LecturaQr =
  | { ok: true; codigo: string }
  | { ok: false; motivo: 'OTRO_ORIGEN' | 'INVALIDO'; explicacion: string };

function origenesAceptados(origenActual: string, dominioOficial: string): Set<string> {
  const oficial = new URL(dominioOficial);
  const conWww = `${oficial.protocol}//www.${oficial.host.replace(/^www\./, '')}`;
  const sinWww = `${oficial.protocol}//${oficial.host.replace(/^www\./, '')}`;
  return new Set([origenActual, sinWww, conWww]);
}

export function codigoDeQr(
  texto: string,
  origenActual: string,
  dominioOficial: string,
  prefijoAliado: string,
  /** La ruta de la pantalla del local (RUTAS.validar). */
  rutaValidar: string,
): LecturaQr {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, motivo: 'INVALIDO', explicacion: 'El QR está vacío.' };

  /* El codigo suelto. */
  if (!/^[a-z][a-z0-9+.-]*:/i.test(limpio)) {
    const lectura = leerCodigo(limpio, prefijoAliado);
    return lectura.valido
      ? { ok: true, codigo: lectura.codigo }
      : { ok: false, motivo: 'INVALIDO', explicacion: 'Este QR no es un código de cliente Atheron.' };
  }

  let url: URL;
  try {
    url = new URL(limpio);
  } catch {
    return { ok: false, motivo: 'INVALIDO', explicacion: 'Este QR no es un código de cliente Atheron.' };
  }

  if (!origenesAceptados(origenActual, dominioOficial).has(url.origin)) {
    return { ok: false, motivo: 'OTRO_ORIGEN', explicacion: 'Este QR no es de Atheron. Pide al cliente el QR de su beneficio.' };
  }
  const ruta = url.pathname.replace(/\/$/, '').replace(/\.html$/, '');
  const c = url.searchParams.get('c');
  if (ruta !== rutaValidar.replace(/\/$/, '') || !c) {
    return { ok: false, motivo: 'INVALIDO', explicacion: 'Este QR es de Atheron, pero no es el de un cliente.' };
  }
  const lectura = leerCodigo(c, prefijoAliado);
  return lectura.valido
    ? { ok: true, codigo: lectura.codigo }
    : { ok: false, motivo: 'INVALIDO', explicacion: lectura.explicacion ?? 'El código del QR no es válido.' };
}
