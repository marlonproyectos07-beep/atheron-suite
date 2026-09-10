/* ============================================================
   CAPACIDAD PARA GRUPOS — se calcula, no se escribe

   EL PROBLEMA QUE RESUELVE ESTE ARCHIVO

   /grupos mostraba tres propiedades y ninguna cifra total. Cada vez
   que se publica un alojamiento nuevo, alguien tendria que acordarse
   de sumar a mano y de cambiar el numero en la pagina. No pasa: se
   olvida, y entonces la pagina anuncia menos capacidad de la que
   hay, o -mucho peor- mas.

   Aqui la capacidad sale de las fichas y se suma sola. Publicar una
   ficha con su cifra de personas la mete en el total sin tocar nada.

   ============================================================
   LAS TRES REGLAS QUE NO SE NEGOCIAN
   ============================================================

   1. SOLO ENTRA LO VALIDADO.
      Una cifra sirve si esta en "datos" de la ficha, si habla de
      PERSONAS o HUESPEDES y si NO esta marcada como pendiente.
      "13 habitaciones" no dice cuanta gente cabe; "28 personas en
      camas fijas" si.

   2. SOLO SE SUMA LO QUE ES UN NUMERO EXACTO.
      "Hasta 40" y "6 a 7" son rangos. Un rango es un maximo o una
      horquilla, no una capacidad confirmada, y sumar el extremo alto
      de varios rangos produce un total que no existe en ninguna
      fecha. Esas propiedades SE MUESTRAN -son opciones reales- pero
      no entran en la suma.

   3. NO SE PUBLICA UN TOTAL QUE NO SE PUEDA SOSTENER.
      Si hay dudas de doble conteo o no hay suficientes cifras
      exactas, la pagina no enseña ningun numero y dice "consulta la
      capacidad disponible para las fechas de tu grupo". Un total
      falso en una pagina comercial es una promesa que alguien
      tendra que cumplir en recepcion.

   ============================================================
   DOBLE CONTEO — EL RIESGO REAL DE ESTE SITIO
   ============================================================

   La coleccion tiene fichas que se CONTIENEN unas a otras. En
   Algarra existe la ficha del edificio entero y ademas la de cada
   apartamento por separado. Sumar las dos cosas cuenta las mismas
   camas dos veces.

   Hoy no estalla porque los apartamentos y el edificio estan sin
   publicar, pero el dia que se publiquen -que es el plan- el total
   se dispararia solo, sin que nadie tocara este archivo y sin
   ningun error visible. Por eso la comprobacion esta escrita ya, y
   no "cuando haga falta": el momento en que haga falta es
   exactamente el momento en que nadie estara mirando.

   Una ficha declara a quien pertenece con "perteneceA". Si una
   ficha y su contenedora estan publicadas a la vez, se suma SOLO la
   contenedora y se avisa por consola al construir.

   ============================================================
   EL P1 CONOCIDO: HOTEL ATHERON SUITE
   ============================================================

   Su ficha no declara hoy ninguna cifra de personas en "datos": las
   tres que trae son distancia, tiempo y hora de entrada. En el
   cuerpo si aparece "hasta 7 huespedes con las camas fijas" y "de 8
   a 10 anadiendo camas", pero eso es texto libre dentro de otro
   campo, no un dato estructurado.

   NO se resuelve por suposicion, que es justo lo que pidio
   direccion. La propiedad aparece en la pagina, con lo que su ficha
   declara, y no entra en el total. Se arregla anadiendo la cifra
   validada a "datos" en el panel, y entonces entra sola.
   ============================================================ */

/** Una cifra de la portada de una ficha. */
interface Dato {
  numero: string;
  texto: string;
  pendiente?: boolean;
}

/* Habla de personas si nombra huespedes o personas. La ene y las
   tildes las escribe una persona en el panel, asi que se comparan
   sin ellas: "huespedes" y "huéspedes" son la misma palabra. */
const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const HABLA_DE_PERSONAS = /hu[e]sped|persona/i;

/** La cifra de personas de una ficha, si la declara y esta validada. */
export const capacidadDe = (datos: Dato[] = []): Dato | undefined =>
  datos.find((d) => !d.pendiente && HABLA_DE_PERSONAS.test(sinTildes(d.texto)));

/* ------------------------------------------------------------
   ¿ES UNA CIFRA EXACTA?

   Solo se suma un numero limpio. Cualquier otra cosa -"Hasta 40",
   "6 a 7", "más de 20", "20+"- es un rango o un maximo y se queda
   fuera del total.

   Se comprueba que el texto ENTERO sea el numero, no que empiece
   por uno: "6 a 7" empieza por 6 y sumarlo como 6 seria inventar
   una precision que la ficha no da.
   ------------------------------------------------------------ */
export function cifraExacta(numero: string): number | null {
  const limpio = String(numero).trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------
   MINIMO DE PROPIEDADES PARA PUBLICAR UN TOTAL

   Con una sola propiedad exacta, "capacidad verificada: 22" no
   informa de la capacidad de Atheron: informa de la de una casa, y
   ademas se lee como si fuera el techo de toda la operacion. A
   partir de dos, la suma ya dice algo.
   ------------------------------------------------------------ */
const MINIMO_PARA_PUBLICAR_TOTAL = 2;

export interface Alojamiento {
  id: string;
  nombre: string;
  /** Municipio, tal y como lo declara la ficha. */
  localidad: string;
  /** La cifra de personas tal y como la escribe la ficha. */
  capacidad?: Dato;
  /** Cuanto suma al total. null = no se puede sumar (rango o sin cifra). */
  suma: number | null;
  /** true = otra ficha publicada ya la incluye; no se suma. */
  contenidaEnOtra: boolean;
  /** Naturaleza de la cifra comercial para explicarla sin ambiguedad. */
  tipo?: 'fija' | 'maxima';
  nota?: string;
}

export interface ResumenCapacidad {
  /** Los alojamientos que se muestran, en el orden de la coleccion. */
  alojamientos: Alojamiento[];
  /** Total verificado, o null si no se puede sostener. */
  total: number | null;
  /** Cuantas propiedades entran en el total. */
  contadas: number;
  /* ----------------------------------------------------------
     LOS MUNICIPIOS QUE ENTRAN EN EL TOTAL

     No es un adorno: es lo que impide que la cifra mienta por
     omision. La pagina se titula "grupos en Zipaquira" y Casa
     Neusa esta en Cogua, asi que un total a secas haria creer que
     ese numero de personas puede dormir en Zipaquira. Un grupo que
     llega contando con eso descubre el problema al repartir las
     habitaciones, que es el peor momento posible.

     La pagina nombra los municipios junto a la cifra. Se calculan
     desde las fichas, asi que publicar manana una propiedad en
     otro municipio actualiza la frase sola.
     ---------------------------------------------------------- */
  localidades: string[];
  /** Por que no hay total, para dejarlo escrito en el informe. */
  motivo: string | null;
}

interface FichaEntrada {
  id: string;
  data: {
    nombre: string;
    datos?: Dato[];
    /** Municipio de la propiedad. Casa Neusa NO esta en Zipaquira. */
    localidad?: string;
    /** id de la ficha que contiene a esta, si la hay. */
    perteneceA?: string | null;
    grupos?: {
      visible: boolean;
      capacidad: number;
      tipo: 'fija' | 'maxima';
      nota?: string;
    };
  };
}

/**
 * Calcula que se muestra y cuanto se puede afirmar.
 * Recibe SOLO fichas publicadas: una ficha sin publicar no es
 * capacidad disponible, es un borrador.
 */
export function resumeCapacidad(publicadas: FichaEntrada[]): ResumenCapacidad {
  const idsPublicados = new Set(publicadas.map((f) => f.id));

  const alojamientos: Alojamiento[] = publicadas.map((f) => {
    const capacidad = capacidadDe(f.data.datos);
    const padre = f.data.perteneceA ?? null;
    const contenidaEnOtra = Boolean(padre && idsPublicados.has(padre));

    if (contenidaEnOtra) {
      console.warn(
        `[grupos] ${f.id} pertenece a ${padre}, que tambien esta publicada. ` +
        `Se muestra, pero NO se suma al total: contarlas las dos seria ` +
        `contar las mismas camas dos veces.`,
      );
    }

    return {
      id: f.id,
      nombre: f.data.nombre,
      localidad: f.data.localidad ?? 'Zipaquirá',
      capacidad,
      suma: contenidaEnOtra || !capacidad ? null : cifraExacta(capacidad.numero),
      contenidaEnOtra,
      tipo: grupo.tipo,
      nota: grupo.nota,
    };
  });

  const sumables = alojamientos.filter((a) => a.suma !== null);
  const total = sumables.reduce((acc, a) => acc + (a.suma as number), 0);

  /* Los municipios de LAS QUE SE SUMAN, no los de todas: la frase
     acompaña a la cifra y tiene que describir exactamente lo que esa
     cifra incluye. */
  const localidades = [...new Set(sumables.map((a) => a.localidad))].sort();

  /* Se publica el total solo si hay suficientes propiedades con
     cifra exacta. Si no, se dice la verdad: que hay que consultar. */
  if (sumables.length < MINIMO_PARA_PUBLICAR_TOTAL) {
    return {
      alojamientos,
      total: null,
      contadas: sumables.length,
      localidades,
      motivo:
        `Solo ${sumables.length} propiedad(es) publicada(s) declaran una cifra ` +
        `exacta de personas. Hacen falta al menos ${MINIMO_PARA_PUBLICAR_TOTAL}.`,
    };
  }

  return { alojamientos, total, contadas: sumables.length, localidades, motivo: null };
}

/* Capacidad comercial de la red para grupos. A diferencia del resumen
   historico de cifras exactas, este cálculo admite máximos declarados porque
   el resultado se comunica expresamente como "hasta" y nunca como camas
   disponibles para una fecha. */
export function resumeCapacidadGrupos(fichas: FichaEntrada[]): ResumenCapacidad {
  const visibles = fichas.filter((f) => f.data.grupos?.visible);
  const idsVisibles = new Set(visibles.map((f) => f.id));

  const alojamientos: Alojamiento[] = visibles.map((f) => {
    const grupo = f.data.grupos!;
    const padre = f.data.perteneceA ?? null;
    const contenidaEnOtra = Boolean(padre && idsVisibles.has(padre));
    return {
      id: f.id,
      nombre: f.data.nombre,
      localidad: f.data.localidad ?? 'Zipaquirá',
      capacidad: {
        numero: grupo.tipo === 'maxima' ? `Hasta ${grupo.capacidad}` : String(grupo.capacidad),
        texto: 'huéspedes',
      },
      suma: contenidaEnOtra ? null : grupo.capacidad,
      contenidaEnOtra,
      /* Sin estos dos campos el desglose de /grupos pintaba "22" donde la
         tarjeta de la misma ficha decia "Hasta 22": un maximo leido como
         cifra fija. */
      tipo: grupo.tipo,
      nota: grupo.nota,
    };
  });

  const sumables = alojamientos.filter((a) => a.suma !== null);
  return {
    alojamientos,
    total: sumables.reduce((total, a) => total + (a.suma as number), 0),
    contadas: sumables.length,
    localidades: [...new Set(sumables.map((a) => a.localidad))].sort(),
    motivo: null,
  };
}

/** "Zipaquirá", "Zipaquirá y Cogua", "A, B y C". Para la frase de la cifra. */
export function enumera(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/* ------------------------------------------------------------
   TRAMOS DEL PLANIFICADOR

   No es un motor de reservas y no pretende serlo. Su trabajo es
   quitar la pregunta "¿y como les digo cuantos somos?": el visitante
   pulsa su tramo y WhatsApp se abre con la cifra ya escrita.

   Los tramos NO afirman que tengamos esas camas libres. El texto de
   la pagina lo dice, y el mensaje habla de "aproximadamente".
   ------------------------------------------------------------ */
export const TRAMOS = ['10', '20', '30', '50', '80', '100', '150', '200+'] as const;

/* ------------------------------------------------------------
   TIPOS DE GRUPO

   Seccion comercial y de posicionamiento. Son los perfiles que
   Atheron ya recibe o puede recibir; ninguno nombra a un cliente
   concreto, ni una empresa, ni una fecha, ni un numero de personas.
   ------------------------------------------------------------ */
export const TIPOS_DE_GRUPO: { titulo: string; texto: string }[] = [
  {
    titulo: 'Empresas y contratistas',
    texto: 'Equipos desplazados por obra o proyecto, con estancias de varias noches y facturación.',
  },
  {
    titulo: 'Matrimonios y eventos',
    texto: 'Alojamiento para los invitados que vienen de fuera, repartido cerca del lugar de la celebración.',
  },
  {
    titulo: 'Delegaciones deportivas',
    texto: 'Equipos y acompañantes que necesitan dormir juntos y salir temprano.',
  },
  {
    titulo: 'Ciclistas',
    texto: 'Grupos de ruta que buscan sitio seguro para las bicicletas y salida a primera hora.',
  },
  {
    titulo: 'Motociclistas',
    texto: 'Rodadas que llegan en grupo y necesitan parqueo y una base para el fin de semana.',
  },
  {
    titulo: 'Grupos culturales y de danza',
    texto: 'Delegaciones que vienen a un encuentro o un festival, con horarios de ensayo.',
  },
  {
    titulo: 'Instituciones y excursiones',
    texto: 'Salidas académicas y grupos organizados que visitan Zipaquirá y la Catedral de Sal.',
  },
  {
    titulo: 'Grupos turísticos',
    texto: 'Viajes organizados que hacen base en Zipaquirá para recorrer la sabana.',
  },
  {
    titulo: 'Familias numerosas',
    texto: 'Reuniones familiares que prefieren una casa entera antes que habitaciones sueltas.',
  },
];

/* ------------------------------------------------------------
   GRUPOS QUE YA HEMOS RECIBIDO

   ESTRUCTURA PREPARADA, SIN TESTIMONIOS.

   Direccion reporta experiencia real con ciclistas, moteros, car
   audio, danza, delegaciones mexicanas, constructoras, empresas
   electricas y mineria. Eso respalda la frase generica de abajo.

   Lo que NO hay, y por eso NO se publica: ni una sola cita textual,
   ni un nombre de empresa, ni un numero de personas, ni una fecha,
   ni una fotografia de un grupo. Inventar un testimonio es la forma
   mas rapida de perder la confianza que esta seccion busca ganar, y
   ademas es ilegal presentarlo como real.

   Cuando llegue un testimonio con permiso escrito, se anade a
   "testimonios" y la pagina lo pinta. Mientras esa lista este
   vacia, solo sale la frase generica.
   ------------------------------------------------------------ */
export const PERFILES_RECIBIDOS =
  'De delegaciones culturales y deportivas a equipos empresariales y grupos de trabajo.';

export interface Testimonio {
  texto: string;
  autor: string;
  fecha: string;
  /** Sin permiso escrito no se publica. */
  autorizado: boolean;
}

export const testimonios: Testimonio[] = [];
