/* ============================================================
   ESCANER DE QR CON LA CAMARA DEL TELEFONO

   TODO SE QUEDA EN EL TELEFONO. Los fotogramas se leen en un canvas
   del propio navegador y se decodifican aqui mismo. Ninguna imagen
   viaja a ningun servidor: lo unico que sale, despues, es el codigo
   de texto, igual que si se hubiera tecleado.

   DOS DECODIFICADORES

   - BarcodeDetector, el nativo, cuando existe (Chrome en Android).
     Es rapido y no descarga nada.
   - jsQR cuando no (Safari en iPhone). Se descarga SOLO al abrir la
     camara, con import(): quien nunca escanea no lo paga en la carga
     de la pagina.

   LOS FALLOS SE CLASIFICAN, porque cada uno tiene su frase:
     PERMISO       -> el usuario (o el navegador) dijo que no
     SIN_CAMARA    -> no hay camara, o no hay trasera que sirva
     NO_DISPONIBLE -> el navegador no ofrece camara (http, WebView...)
     ERROR         -> cualquier otra cosa
   ============================================================ */

export type FalloCamara = 'PERMISO' | 'SIN_CAMARA' | 'NO_DISPONIBLE' | 'EN_USO' | 'ERROR';

export const MENSAJE_CAMARA: Record<FalloCamara, string> = {
  PERMISO: 'No hay permiso para usar la cámara. Puedes ingresar el código manualmente.',
  SIN_CAMARA: 'Este dispositivo no tiene una cámara disponible. Ingresa el código manualmente.',
  NO_DISPONIBLE: 'Este navegador no permite usar la cámara aquí. Ingresa el código manualmente.',
  EN_USO: 'La cámara está ocupada por otra aplicación. Ciérrala o ingresa el código manualmente.',
  ERROR: 'No se pudo abrir la cámara. Ingresa el código manualmente.',
};

export function clasificaFallo(error: unknown): FalloCamara {
  const nombre = (error as { name?: string } | null)?.name ?? '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError' || nombre === 'PermissionDeniedError') return 'PERMISO';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError' || nombre === 'DevicesNotFoundError') return 'SIN_CAMARA';
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError' || nombre === 'AbortError') return 'EN_USO';
  if (nombre === 'TypeError') return 'NO_DISPONIBLE';
  return 'ERROR';
}

type Decodifica = (fuente: HTMLCanvasElement) => Promise<string | null>;

interface DetectorNativo {
  detect(fuente: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

async function decodificador(): Promise<Decodifica> {
  const Nativo = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): DetectorNativo; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (Nativo) {
    try {
      const formatos = (await Nativo.getSupportedFormats?.()) ?? ['qr_code'];
      if (formatos.includes('qr_code')) {
        const detector = new Nativo({ formats: ['qr_code'] });
        return async (lienzo) => {
          const hallados = await detector.detect(lienzo);
          return hallados[0]?.rawValue ?? null;
        };
      }
    } catch {
      /* Si el nativo falla, se usa jsQR. */
    }
  }
  const jsQR = (await import('jsqr')).default;
  return async (lienzo) => {
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    return jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

export interface Escaneo {
  /** Para la camara y suelta el dispositivo. Se puede llamar varias veces. */
  detener(): void;
}

/**
 * Abre la camara trasera en `video` y llama a `alLeer` con cada texto
 * de QR leido, hasta que se llame a detener(). Si la camara no se
 * puede abrir, rechaza con el tipo de fallo ya clasificado.
 */
export async function escanear(video: HTMLVideoElement, alLeer: (texto: string) => void): Promise<Escaneo> {
  if (!navigator.mediaDevices?.getUserMedia) throw 'NO_DISPONIBLE' as FalloCamara;

  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    throw clasificaFallo(error);
  }

  let activo = true;
  const detener = (): void => {
    activo = false;
    for (const pista of flujo.getTracks()) pista.stop();
    video.srcObject = null;
  };

  video.srcObject = flujo;
  video.muted = true;
  video.setAttribute('playsinline', '');
  try {
    await video.play();
  } catch (error) {
    detener();
    throw clasificaFallo(error);
  }

  let lee: Decodifica;
  try {
    lee = await decodificador();
  } catch {
    detener();
    throw 'ERROR' as FalloCamara;
  }

  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const MAX = 640;

  const vuelta = async (): Promise<void> => {
    if (!activo) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h && ctx) {
      const escala = Math.min(1, MAX / Math.max(w, h));
      lienzo.width = Math.round(w * escala);
      lienzo.height = Math.round(h * escala);
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      try {
        const texto = await lee(lienzo);
        if (texto && activo) alLeer(texto);
      } catch {
        /* Un fotograma que no se puede leer no es un error: el siguiente. */
      }
    }
    if (activo) setTimeout(() => void vuelta(), 150);
  };
  void vuelta();

  return { detener };
}
