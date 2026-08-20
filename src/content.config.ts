/* ============================================================
   COLECCION DE HOSPEDAJES

   Aqui se define QUE datos tiene un hospedaje. Es el contrato
   entre el contenido y la maqueta, y mas adelante tambien es lo
   que el panel usara para dibujar el formulario.

   Por que existe este archivo:
   antes, cada ficha era un archivo HTML de 416 lineas. Las seis
   fichas en obra eran identicas salvo el numero: 2.496 lineas
   para almacenar seis numeros distintos. Ahora los datos estan
   en src/content/hospedajes/ y la maqueta se escribe UNA vez en
   src/pages/hospedajes/[slug].astro.

   REGLA DE ORO DE ESTE ARCHIVO:
   aqui solo entra lo que CAMBIA de un hospedaje a otro. Lo que
   es igual en los siete (el formulario, la nota de la direccion,
   las experiencias de la Catedral y el centro historico) vive en
   la maqueta. Meterlo aqui obligaria a repetirlo siete veces, que
   es justo el problema del que venimos.
   ============================================================ */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* Un dato de la fila de cifras de la portada.
   Ej: { numero: "1,4 km", texto: "A la Catedral de Sal" } */
const dato = z.object({
  numero: z.string(),
  texto: z.string(),
  /* true => se pinta en amarillo porque todavia es provisional. */
  pendiente: z.boolean().default(false),
});

/* Una fila de la tabla de distancias u horarios. */
const fila = z.object({
  lugar: z.string(),
  valor: z.string(),
  pendiente: z.boolean().default(false),
});

/* Una habitacion del hospedaje. Los campos numericos son texto
   a proposito: mientras no haya dato real llevan "N". */
const habitacion = z.object({
  nombre: z.string(),
  huespedes: z.string(),
  camas: z.string(),
  banos: z.string(),
  descripcion: z.string(),
  precio: z.string().default('$ ---'),
  pendiente: z.boolean().default(false),
});

const hospedajes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/hospedajes' }),
  schema: z.object({

    /* ----------------------------------------------------------
       IDENTIDAD Y ESTADO
       ---------------------------------------------------------- */

    nombre: z.string(),

    /* Posicion en el listado. Manda el orden que se ve en pantalla,
       no el nombre del archivo. */
    orden: z.number(),

    /* EL INTERRUPTOR IMPORTANTE.
       false => la ficha lleva noindex y NO entra en el sitemap.
       true  => se indexa y entra en el sitemap automaticamente.

       Esto cierra los pendientes 47 y 48 de un plumazo: antes habia
       que acordarse de quitar el noindex a mano Y de anadir la
       direccion al sitemap. Olvidarse de lo segundo era facil.
       Ahora son la misma casilla. */
    publicado: z.boolean().default(false),

    /* Numero que se ve en la insignia de la tarjeta del listado. */
    insignia: z.string(),

    /* ----------------------------------------------------------
       SEO
       ---------------------------------------------------------- */

    titulo: z.string(),
    descripcion: z.string(),
    ogTitulo: z.string().optional(),
    ogDescripcion: z.string().optional(),

    /* Banda amarilla superior. Se quita poniendo null. */
    avisoBorrador: z.string().nullable().default(null),

    /* ----------------------------------------------------------
       PORTADA DE LA FICHA
       ---------------------------------------------------------- */

    /* Zona de referencia. Sale en la etiqueta de la portada y como
       titulo del apartado de ubicacion. */
    zona: z.string(),

    /* Frase de presentacion bajo el titulo. */
    presentacion: z.string(),
    presentacionPendiente: z.boolean().default(false),

    /* Las tres cifras de la portada. */
    datos: z.array(dato).length(3),

    /* ----------------------------------------------------------
       DESCRIPCION
       El texto largo va en el CUERPO del archivo .md, debajo del
       frontmatter. Asi se escribe comodo y con parrafos.
       ---------------------------------------------------------- */

    tituloDescripcion: z.string(),
    tituloDescripcionPendiente: z.boolean().default(false),
    caracteristicas: z.array(z.object({
      texto: z.string(),
      pendiente: z.boolean().default(false),
    })),

    /* ----------------------------------------------------------
       TARJETA DEL LISTADO (/hospedajes)
       ---------------------------------------------------------- */

    /* En la tarjeta, el nombre, el sector, el segundo dato y el
       resumen se pintan en amarillo cuando publicado es false.
       No hace falta marcarlos uno por uno: si la ficha no esta
       publicada, es porque sus datos todavia son provisionales. */

    /* Sector tal y como se muestra en la tarjeta. Suele ser mas
       corto que "zona". */
    listadoSector: z.string(),
    /* Segundo dato de la tarjeta: distancia, numero de habitaciones... */
    listadoSegundoDato: z.string(),
    /* Texto que acompana al segundo dato y que NO va en amarillo.
       Ej: dato "N" + sufijo " habitaciones". */
    listadoSegundoDatoSufijo: z.string().default(''),
    /* Descripcion de dos lineas de la tarjeta (pendiente 4). */
    resumen: z.string(),
    /* Precio por noche (pendiente 5). Sigue en amarillo aunque la
       ficha ya este publicada, porque es el ultimo dato que llega. */
    precio: z.string().default('$ ---'),
    precioPendiente: z.boolean().default(true),

    /* ----------------------------------------------------------
       HABITACIONES
       ---------------------------------------------------------- */

    habitaciones: z.array(habitacion),
    /* Aviso opcional bajo el titulo del apartado. */
    notaHabitaciones: z.string().nullable().default(null),

    /* ----------------------------------------------------------
       UBICACION
       ---------------------------------------------------------- */

    descripcionZona: z.string(),
    descripcionZonaPendiente: z.boolean().default(false),
    distancias: z.array(fila),
    /* Solo aparece si tiene filas. */
    horarios: z.array(fila).default([]),

    /* Recuadro del mapa de OpenStreetMap. */
    mapaBbox: z.string(),
    mapaTitulo: z.string(),
    mapaNota: z.string(),
    mapaNotaPendiente: z.boolean().default(false),

    /* POLITICA DE DIRECCION.
       false => se muestra la caja que explica que la direccion
                exacta se entrega al confirmar la reserva.
       true  => el hospedaje publica su direccion (es propio, no
                aliado) y la caja no aparece.

       No es un detalle: publicar la direccion de un hospedaje
       aliado sin permiso es un problema real, no solo de diseno. */
    direccionPublica: z.boolean().default(false),

    /* ----------------------------------------------------------
       EXPERIENCIAS
       Las dos primeras (Catedral de Sal y centro historico) son
       iguales en todas las fichas y viven en la maqueta. Aqui solo
       se pueden ajustar sus textos y anadir la tercera.
       ---------------------------------------------------------- */

    experiencias: z.array(z.object({
      titulo: z.string(),
      texto: z.string(),
      pendiente: z.boolean().default(false),
    })).length(3),

    /* ----------------------------------------------------------
       CONTACTO
       ---------------------------------------------------------- */

    tituloContacto: z.string(),
    /* Los puntos de la lista bajo el boton de WhatsApp, SIN el
       telefono: ese es igual en las siete fichas y lo pone la
       maqueta. Aqui solo va texto plano, nunca HTML: el contenido
       no deberia poder inyectar etiquetas en la pagina. */
    datosContacto: z.array(z.string()),

    /* ----------------------------------------------------------
       DATOS ESTRUCTURADOS (JSON-LD)

       REGLA: solo se rellena lo que el visitante puede VER en la
       pagina. Marcar datos que no se muestran, o inventados, es
       motivo de penalizacion. Por eso casi todo es opcional: una
       ficha en obra simplemente no los lleva.
       ---------------------------------------------------------- */

    /* Direccion exacta. Solo para hospedajes propios; en los
       aliados se deja sin poner a proposito. */
    calle: z.string().optional(),
    /* Coordenadas. Pendiente 8: se anaden cuando salgan de Google Maps. */
    latitud: z.number().optional(),
    longitud: z.number().optional(),
    checkin: z.string().optional(),
    checkout: z.string().optional(),
    mascotas: z.boolean().optional(),
    /* Fecha del ultimo cambio real de la ficha. Va al sitemap.
       Si no se pone, se usa la fecha en que se publico el sitio. */
    actualizado: z.coerce.date().optional(),

    /* Comodidades confirmadas y visibles en la pagina. */
    comodidades: z.array(z.string()).default([]),
  }),
});

export const collections = { hospedajes };
