/**
 * HOTEL-016 — catálogo de media REAL por unidad.
 *
 * Solo referencias a assets públicos que ya existen en hotelesatheron.com.
 * No usa stock, no genera imágenes y no inventa videos inexistentes.
 */

const BASE = 'https://hotelesatheron.com';

export const WHATSAPP_MEDIA_CATALOG = Object.freeze({
  '201': {
    title: 'Habitación 201',
    images: [
      {
        url: `${BASE}/assets/201/201_02_Vista_General.png`,
        caption: 'Habitación 201 · vista general',
      },
      {
        url: `${BASE}/assets/201/201_03_Cama_Linea_Hotelera.png`,
        caption: 'Habitación 201 · cama',
      },
      {
        url: `${BASE}/assets/201/201_04_Bano.png`,
        caption: 'Habitación 201 · baño',
      },
    ],
    video: null,
  },
  '301': {
    title: 'Suite 301',
    images: [],
    video: {
      url: `${BASE}/assets/video/suite-301-experiencia-inteligente.mp4`,
      caption: 'Suite 301 · recorrido real',
    },
  },
  '302': {
    title: 'Habitación 302',
    images: [
      {
        url: `${BASE}/assets/img/hospedajes/hotel-atheron-suite-302-habitacion.jpg`,
        caption: 'Habitación 302 · vista general',
      },
      {
        url: `${BASE}/assets/img/hospedajes/hotel-atheron-suite-302-bano.jpg`,
        caption: 'Habitación 302 · baño',
      },
    ],
    video: {
      url: `${BASE}/assets/302/Atheron_Suite_Habitacion_302_WEB.mp4`,
      caption: 'Habitación 302 · recorrido real',
    },
  },
});

export function mediaForUnit(unit) {
  return WHATSAPP_MEDIA_CATALOG[String(unit)] ?? null;
}
