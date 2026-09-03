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

/* NOTA: la comprobacion de las almohadillas en YAML no puede
   hacerse aqui. Cuando el texto llega a este archivo, YAML ya lo
   ha cortado y no queda rastro. Se hace antes de construir, sobre
   los archivos originales, en scripts/comprueba-contenido.mjs. */

/* ------------------------------------------------------------
   CAMPOS OPCIONALES, TAL Y COMO LOS ESCRIBE EL PANEL

   Cuando dejas un campo vacio en el panel, este NO omite la linea:
   escribe el campo con un valor vacio.

       latitud: null
       actualizado: ''

   El ".optional()" normal significa "el campo puede no estar", y
   no acepta ni null ni cadena vacia. Resultado: dejar un campo en
   blanco desde el panel tumbaba la publicacion con un mensaje que
   no dice nada a quien solo estaba editando texto.

   Estas ayudas tratan null y "" como "no hay dato".
   ------------------------------------------------------------ */
const estaVacio = (v: unknown) => v === null || v === undefined || v === '';

/** Texto que puede venir vacio desde el panel. */
const textoOpcionalPanel = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (estaVacio(v) ? undefined : (v as string)));

/** Numero que puede venir vacio, o como texto, desde el panel. */
const numeroOpcionalPanel = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => (estaVacio(v) ? undefined : Number(v)))
  .refine((v) => v === undefined || !Number.isNaN(v), {
    message: 'Tiene que ser un numero, o quedar vacio.',
  });

/** Si/no que puede venir vacio desde el panel. */
const siNoOpcionalPanel = z
  .union([z.boolean(), z.null()])
  .optional()
  .transform((v) => (v === null ? undefined : v));

/** Fecha que puede venir vacia desde el panel. */
const fechaOpcionalPanel = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (estaVacio(v) ? undefined : new Date(v as string)))
  .refine((v) => v === undefined || !Number.isNaN(v.getTime()), {
    message: 'La fecha no se entiende. Dejala vacia o usa AAAA-MM-DD.',
  });

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

/* Texto que puede quedar vacio.

   Si desde el panel se borra el contenido de un campo, lo que llega
   aqui es una cadena vacia, no la ausencia del campo. Sin esta
   conversion, el sitio pintaria una banda amarilla vacia o un aviso
   en blanco. Con ella, vaciar el campo equivale a quitarlo. */
const textoOpcional = z
  .string()
  .nullable()
  .default(null)
  .transform((v) => (v && v.trim() ? v : null));

/* Una foto de la galeria.

   El "alt" no es opcional: es lo que lee Google y lo que oye quien
   usa un lector de pantalla. Una foto sin alt es una foto que no
   aporta nada al posicionamiento. */
const fotoGaleria = z.object({
  imagen: z.string(),
  alt: z.string(),
});

/* Una habitacion del hospedaje. Los campos numericos son texto
   a proposito: mientras no haya dato real llevan "N". */
const habitacion = z.object({
  nombre: z.string(),
  /* Los tres datos de la cabecera pueden faltar. No es lo normal, pero
     una habitacion recien cargada puede tener confirmada la cama y
     todavia no cuantas personas admite. Antes que poner un numero
     supuesto, el dato no sale: la ficha se ve igual, con una etiqueta
     menos. Cuando llegue el dato se rellena y aparece. */
  huespedes: textoOpcionalPanel,
  camas: textoOpcionalPanel,
  banos: textoOpcionalPanel,
  descripcion: z.string(),
  precio: z.string().default('$ ---'),
  pendiente: z.boolean().default(false),
  foto: textoOpcionalPanel,
  fotoAlt: textoOpcionalPanel,

  /* ----------------------------------------------------------
     COMO SE DISTINGUE ESTA HABITACION EN EL SELECTOR

     El distintivo que va sobre la foto salia del CSS, atado al
     identificador de cada habitacion del Hotel Atheron Suite. Con
     Casa Algarra acertaba por casualidad -se llaman igual- y su
     habitacion principal se quedaba sin decir que el bano es
     privado, que es justo lo que la vende. Ahora sale del dato.

     Vacio = sin distintivo. NO se deduce del nombre ni del numero:
     si no esta confirmado, no se pinta nada.
     ---------------------------------------------------------- */
  tipoBano: z.enum(['privado', 'compartido', 'auxiliar']).optional(),
  /* Distintivo propio, cuando lo que distingue a la habitacion no es
     el bano. Sustituye al del tipo de bano. */
  insignia: textoOpcionalPanel,
  /* Realce visual de la habitacion estrella del hospedaje. */
  destacada: z.boolean().default(false),
  /* Texto corto del boton en la tarjeta compacta, si el generico no
     encaja. Ej: "Ver suite". */
  etiquetaVer: textoOpcionalPanel,

  /* Galeria propia de la habitacion. Opcional y aditiva: una
     habitacion sin fotos sigue funcionando igual, solo que no
     pinta el bloque. La galeria del hospedaje (galeria, mas
     abajo) se mantiene aparte, para zonas comunes, fachada y
     entorno. */
  galeria: z.array(fotoGaleria).default([]),

  /* Video de la habitacion. OPCIONAL y aditivo, igual que la
     galeria: una habitacion sin video se ve exactamente como antes,
     sin hueco ni tarjeta vacia, y su ficha ni siquiera carga el
     guion del visor.

     Sirve para cualquier habitacion de cualquier hospedaje: la 301
     hoy, y manana la 201, la 202 o las de otro hospedaje. Solo hay
     que rellenar estos campos.

     "ancho" y "alto" son los del archivo, y no estan de adorno: de
     ellos sale la proporcion de la tarjeta y del visor, para que el
     hueco este reservado antes de que cargue nada y la pagina no de
     ningun salto.

     "webm" es opcional: si esta, el navegador que lo entienda se
     lleva el archivo mas ligero y el resto se queda con el mp4. */
  video: z
    .object({
      /* Archivo principal, en mp4 (H.264 + AAC): lo reproduce todo. */
      src: z.string(),
      /* Alternativa mas ligera, si se genera. */
      webm: textoOpcional,
      /* Portada. Tiene que salir de un fotograma del propio video. */
      poster: z.string(),
      /* Que se ve, para el boton y para el lector de pantalla. */
      titulo: z.string(),
      /* Texto del boton. Si no se pone, se usa uno generico. */
      etiqueta: textoOpcional,
      ancho: z.number(),
      alto: z.number(),
      /* Duracion en texto ("1:12"), solo para mostrarla. */
      duracion: textoOpcional,
    })
    .optional(),
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
       COMO SE VENDE ESTE HOSPEDAJE

       "habitaciones" => se alquilan habitaciones sueltas, aunque
                         ademas se ofrezca la casa entera.
       "casa-completa" => solo se alquila entera.

       Lo usa el guardian del minimo publicable (scripts/
       minimo-publicable.mjs) para saber que pedirle a la ficha antes
       de dejarla salir. Una casa que solo se alquila entera no tiene
       -ni va a tener- ficha comercial por habitacion, y con el
       guardian anterior no se podia publicar nunca.

       Se declara, no se deduce: si se dedujera de que la ficha no
       tiene habitaciones, cualquier ficha a la que simplemente le
       falten pasaria por casa completa, que es justo el descuido que
       el guardian existe para atrapar. */
    modalidad: z.enum(['habitaciones', 'casa-completa']).default('habitaciones'),

    /* ----------------------------------------------------------
       SEO
       ---------------------------------------------------------- */

    titulo: z.string(),
    descripcion: z.string(),
    ogTitulo: textoOpcionalPanel,
    ogDescripcion: textoOpcionalPanel,

    /* Banda amarilla superior. Se quita poniendo null. */
    avisoBorrador: textoOpcional,

    /* ----------------------------------------------------------
       PORTADA DE LA FICHA
       ---------------------------------------------------------- */

    /* Zona de referencia. Sale en la etiqueta de la portada y como
       titulo del apartado de ubicacion. */
    zona: z.string(),

    /* ----------------------------------------------------------
       MUNICIPIO

       Hasta ahora la maqueta escribia "Zipaquira" a mano en cinco
       sitios: el addressLocality del JSON-LD, los tres mensajes de
       WhatsApp y la linea que acompana al enlace de Google Maps.
       Valia mientras todos los hospedajes estuvieran en Zipaquira.
       Casa Neusa esta en Cogua, y con el texto fijo habriamos
       publicado datos estructurados que situan la casa en un
       municipio que no es el suyo.

       El valor por defecto es Zipaquira, asi que las fichas que ya
       existen no cambian ni una letra. */
    localidad: z.string().default('Zipaquira'),
    /* Departamento, por si algun dia hay algo fuera de Cundinamarca. */
    departamento: z.string().default('Cundinamarca'),

    /* Frase de presentacion bajo el titulo. */
    presentacion: z.string(),
    presentacionPendiente: z.boolean().default(false),

    /* ----------------------------------------------------------
       FOTOS

       Mientras un campo de foto este vacio, la pagina sigue
       pintando el rectangulo rayado de "foto pendiente". En cuanto
       subes la imagen desde el panel, aparece la foto. No hay que
       tocar codigo en ningun momento.

       Cierra los pendientes 9 y 10.
       ---------------------------------------------------------- */

    /* La que se ve en la tarjeta del listado y de la portada. */
    fotoTarjeta: textoOpcionalPanel,
    fotoTarjetaAlt: textoOpcionalPanel,

    /* La grande, junto a la descripcion de la ficha. */
    fotoPrincipal: textoOpcionalPanel,
    fotoPrincipalAlt: textoOpcionalPanel,

    /* Las cinco de la galeria. Si esta vacia, se pintan los cinco
       rectangulos de siempre. */
    galeria: z.array(fotoGaleria).default([]),

    /* Las tres cifras de la portada. */
    /* Entre 1 y 4. No se fija en 3 exactos a proposito: si desde el
       panel se anade una cuarta cifra, el sitio debe seguir
       construyendose. Un build que falla por un dato de mas es un
       fallo confuso para quien solo estaba editando texto. */
    datos: z.array(dato).min(1).max(4),

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
    notaHabitaciones: textoOpcional,

    /* ----------------------------------------------------------
       PRESENTACION COMERCIAL

       Portada con la foto a sangre, en vez de la portada sobria de
       color. Se pide desde el contenido y no desde el nombre del
       hospedaje, para que valga en cualquiera. */
    heroFoto: z.boolean().default(false),
    /* Que parte de la foto se ve en la franja de portada. La foto no
       se toca: es la misma, solo cambia el trozo que queda a la vista
       cuando la banda es mucho mas ancha que alta. Se escribe como el
       object-position del CSS ("center 30%"). Vacio = centrada. */
    heroEncuadre: textoOpcional,
    /* Lo mismo, para pantallas estrechas: ahi la franja es alta y el
       recorte bueno suele ser otro. Vacio = el afinado por defecto. */
    heroEncuadreMovil: textoOpcional,

    /* Venta del alojamiento entero, por delante de las habitaciones
       sueltas. Si este bloque no esta, la ficha lista las
       habitaciones y ya, como siempre.

       Todo lo que se lee en pantalla vive aqui y no en la plantilla:
       un hospedaje nuevo con este modelo no necesita tocar codigo,
       solo rellenar estos campos en su .md. Los que llevan valor por
       defecto se pueden omitir. */
    casaCompleta: z
      .object({
        /* Cabecera del apartado */
        etiquetaSeccion: z.string().default('Opciones de alojamiento'),
        tituloSeccion: z.string().default('Elige como quieres hospedarte'),
        introSeccion: textoOpcional,

        /* Tarjeta destacada */
        ceja: z.string().default('¿Viajan juntos?'),
        titulo: z.string().default('Casa completa para grupos'),
        insignia: z.string().default('Mejor opcion para grupos'),
        nombre: z.string(),
        /* Datos duros de la tarjeta: "Hasta 22 huespedes", "5 habitaciones"... */
        datos: z.array(z.string()).default([]),
        resumen: z.string(),
        /* El precio va en dos lineas a proposito. La segunda es la
           condicion, y no se puede quedar fuera: una tarifa de grupo
           sin decir desde cuantas personas aplica es publicidad
           enganosa. */
        precio: textoOpcional,
        precioNota: textoOpcional,

        /* Bloque de detalle al que llevan los botones */
        detalleCeja: z.string().default('Para grupos grandes'),
        detalleTitulo: z.string(),
        detalleTexto: z.string(),
        detalleDatos: z.array(z.string()).default([]),

        /* Botones y mensaje que se manda por WhatsApp */
        ctaVer: z.string().default('Ver casa completa'),
        ctaCotizar: z.string().default('Cotizar casa completa'),
        mensaje: z.string(),

        /* Cabecera del listado de habitaciones */
        cejaHabitaciones: z.string().default('¿Prefieres una habitacion?'),
        tituloHabitaciones: z.string().default('Conoce las opciones'),
        introHabitaciones: textoOpcional,
      })
      .optional(),

    /* ----------------------------------------------------------
       TARIFA POR NUMERO DE HUESPEDES

       Un alojamiento entero no tiene "un" precio: tiene una tarifa
       base y un incremento por persona. Poner solo la cifra baja es
       publicidad enganosa, y poner solo la alta espanta. Se publican
       las dos y el desglose completo, para que nadie descubra el
       precio real al escribir por WhatsApp.

       Aditivo: sin este bloque la ficha se pinta como antes.
       ---------------------------------------------------------- */
    tarifas: z
      .object({
        etiqueta: z.string().default('Tarifas'),
        titulo: z.string(),
        /* La cifra grande. Ej: "Desde $300.000 por noche". */
        desde: z.string(),
        /* Que cubre esa cifra. NO es opcional: una tarifa "desde"
           sin decir hasta cuantas personas cubre no informa de nada. */
        cubre: z.string(),
        intro: textoOpcional,
        /* El desglose. Cada fila es un numero de huespedes y su precio. */
        filas: z
          .array(z.object({ huespedes: z.string(), precio: z.string() }))
          .default([]),
        /* La regla en una linea, para quien quiera calcularlo. */
        regla: textoOpcional,
        nota: textoOpcional,
        cta: z.string().default('Consultar disponibilidad'),
        /* Mensaje de WhatsApp propio del bloque. */
        mensaje: textoOpcional,
      })
      .optional(),

    /* ----------------------------------------------------------
       ESPACIOS DE LA CASA

       Las zonas comunes que se venden solas: la sala con chimenea,
       la cocina, el balcon, la zona de BBQ. No son habitaciones -no
       se reservan por separado- pero son lo que hace que alguien
       elija una casa y no un hotel.

       Aditivo: sin este bloque la ficha se ve exactamente como
       antes. Sirve para cualquier hospedaje, no solo para el que lo
       estrena.
       ---------------------------------------------------------- */
    espacios: z
      .object({
        etiqueta: z.string().default('La casa'),
        titulo: z.string(),
        intro: textoOpcional,
        lista: z
          .array(
            z.object({
              titulo: z.string(),
              texto: z.string(),
              foto: textoOpcionalPanel,
              fotoAlt: textoOpcionalPanel,
            }),
          )
          .default([]),
      })
      .optional(),

    /* ----------------------------------------------------------
       PRUEBA SOCIAL

       Valoraciones que YA existen en una plataforma de terceros.
       No son testimonios recogidos por Atheron, y la ficha tiene
       que decirlo: por eso "fuente" es obligatoria y el texto de
       atribucion se pinta siempre junto a la nota.

       La nota tampoco es decorativa. Una puntuacion es una foto de
       un dia; si manana entran dos resenas malas, la cifra de la
       pagina deja de ser cierta. Decir de donde sale y que puede
       cambiar es la diferencia entre citar y afirmar.
       ---------------------------------------------------------- */
    pruebaSocial: z
      .object({
        /* De donde salen los datos. Ej: "Airbnb". */
        fuente: z.string(),
        etiqueta: z.string().default('Opiniones'),
        titulo: z.string(),
        intro: textoOpcional,
        /* La cifra, tal cual se escribe. Texto y no numero: en
           Colombia se escribe con coma. */
        puntuacion: textoOpcional,
        /* Sobre cuanto. Sin esto, un "4,92" no significa nada. */
        sobre: textoOpcional,
        resenas: numeroOpcionalPanel,
        distintivo: textoOpcional,
        /* Aviso de que el dato es de un tercero y puede cambiar. */
        nota: textoOpcional,
        enlace: textoOpcional,
        enlaceTexto: z.string().default('Ver el anuncio original'),
        /* Extractos literales. "autor" y "fecha" no son opcionales:
           una cita sin quien la dijo y cuando no se puede verificar,
           y entonces no es prueba de nada. */
        extractos: z
          .array(
            z.object({
              texto: z.string(),
              autor: z.string(),
              fecha: z.string(),
            }),
          )
          .default([]),
      })
      .optional(),

    /* ----------------------------------------------------------
       ANTES DE RESERVAR

       Las condiciones que el huesped necesita saber ANTES de
       escribir, no despues: mascotas, uso de zonas exteriores,
       y lo que el anuncio dice sobre seguridad.

       Sobre la seguridad: "consta" distingue lo confirmado de lo
       que NO consta. Son cosas distintas y la pagina no puede
       mezclarlas. Que no conste un detector de humo no significa
       que no lo haya; significa que no esta verificado, y eso es
       exactamente lo que hay que decir, sin adornarlo y sin
       asustar a nadie.
       ---------------------------------------------------------- */
    antesDeReservar: z
      .object({
        etiqueta: z.string().default('Antes de reservar'),
        titulo: z.string(),
        intro: textoOpcional,
        condiciones: z
          .array(
            z.object({
              titulo: z.string(),
              texto: z.string(),
              /* Enlace externo opcional de la condicion. Sirve para lo
                 que el huesped tiene que mirar por su cuenta: un
                 parqueadero publico que no es nuestro, por ejemplo.
                 Abre en pestana nueva y con noopener. */
              enlace: textoOpcional,
              enlaceTexto: textoOpcional,
            }),
          )
          .default([]),
        seguridadTitulo: textoOpcional,
        seguridadNota: textoOpcional,
        seguridad: z
          .array(
            z.object({
              texto: z.string(),
              /* true = confirmado. false = no consta en el anuncio. */
              consta: z.boolean().default(false),
            }),
          )
          .default([]),
      })
      .optional(),

    /* ----------------------------------------------------------
       UBICACION
       ---------------------------------------------------------- */

    descripcionZona: z.string(),
    descripcionZonaPendiente: z.boolean().default(false),
    distancias: z.array(fila),
    /* Solo aparece si tiene filas. */
    horarios: z.array(fila).default([]),

    /* Recuadro del mapa de OpenStreetMap. */
    /* Opcionales a proposito: un hospedaje cuya ubicacion todavia no
       esta confirmada no puede pintar un mapa. Encuadrar un punto
       cualquiera para rellenar el hueco seria inventar una direccion,
       y eso no se hace. Sin bbox, la ficha lo dice y ofrece
       coordinarlo por WhatsApp. */
    mapaBbox: textoOpcional,
    mapaTitulo: textoOpcional,
    mapaNota: textoOpcional,
    mapaNotaPendiente: z.boolean().default(false),

    /* Enlace a la ficha del hospedaje en Google Maps. Es el que
       lleva al punto exacto mientras el recuadro de arriba solo
       encuadre el barrio. Alimenta tambien "hasMap" del JSON-LD. */
    enlaceMapa: textoOpcional,

    /* Como se llamaba antes el hospedaje. Sirve para que quien lo
       busque por el nombre viejo lo encuentre, y para decirle a
       Google que es un cambio de nombre y no dos negocios. Se
       muestra en la pagina antes de marcarlo en el JSON-LD. */
    nombreAnterior: textoOpcional,

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
    })).max(4),
    /* Sin minimo: un hospedaje cuya zona todavia no esta confirmada no
       puede listar que hay alrededor sin inventarselo. Con la lista
       vacia, el apartado no se pinta. */

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
    calle: textoOpcionalPanel,
    /* Coordenadas. Pendiente 8: se anaden cuando salgan de Google Maps. */
    latitud: numeroOpcionalPanel,
    longitud: numeroOpcionalPanel,
    checkin: textoOpcionalPanel,
    checkout: textoOpcionalPanel,
    mascotas: siNoOpcionalPanel,
    /* Rango de tarifa para el JSON-LD ("priceRange"). Solo se rellena
       si las dos cifras se muestran en la pagina: marcar un rango que
       el visitante no puede ver es exactamente lo que no se hace. */
    rangoPrecio: textoOpcionalPanel,
    /* Fecha del ultimo cambio real de la ficha. Va al sitemap.
       Si no se pone, se usa la fecha en que se publico el sitio. */
    actualizado: fechaOpcionalPanel,

    /* Comodidades confirmadas y visibles en la pagina. */
    comodidades: z.array(z.string()).default([]),
  }),
});

export const collections = { hospedajes };
