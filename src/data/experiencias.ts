/* ============================================================
   EXPERIENCIAS DE ZIPAQUIRA — que hacer mientras te quedas

   POR QUE ESTO ES UN ARCHIVO DE DATOS Y NO HTML EN LA PORTADA

   La lista va a crecer, y se sabe: Neusa, gastronomia, museos,
   eventos, transporte. Escrita a mano en la portada, cada anadido
   obliga a tocar la maqueta, y el dia que dos experiencias tengan
   guia propia habra dos bloques casi iguales que se descoordinan.

   Aqui una experiencia se anade rellenando un objeto. La portada
   no cambia.

   LA REGLA DE LA FOTO, Y POR QUE HOY NO HAY NINGUNA

   El campo "foto" es opcional a proposito. A 9 de septiembre de
   2026 el repositorio NO tiene ni una sola fotografia legitima de
   la Catedral de Sal ni del centro historico:

   - Lo unico que existe con ese motivo es el fondo de la portada
     (zipaquira-centro-historico-atardecer-*), y es un activo
     GENERADO CON IA. Su registro de procedencia -docs/fotografias.md
     apartado 8.1- dice literalmente que no se describe "en ningun
     texto visible, ni en alt, ni en Open Graph, ni en JSON-LD".
     Ponerlo en una tarjeta rotulada "Centro historico" seria
     presentarlo como fotografia del lugar, que es justo lo que ese
     registro prohibe.
   - Las fotos reales de la plaza que si existen pertenecen al
     manifiesto de Casa Colonial Centro, un proyecto privado.
   - Bajar una foto de internet no es una opcion: no tenemos
     derechos sobre ninguna.

   Asi que la tarjeta se diseña para funcionar SIN foto, y el dia
   que llegue una legitima se rellena este campo y aparece sola.
   Lo que no se hace es tapar el hueco con una imagen prestada.
   ============================================================ */

export interface Experiencia {
  /** Identificador corto. Se usa como ancla y como clave. */
  id: string;
  /** Nombre visible. */
  titulo: string;
  /** Una linea. Lo que el visitante necesita para decidir si le interesa. */
  texto: string;
  /* Tres datos cortos como maximo. Solo entran los VERIFICADOS: la
     ficha de una experiencia no es sitio para estimaciones. */
  datos?: string[];
  /** Guia propia de Atheron, si ya existe. Sin ella la tarjeta no enlaza. */
  ruta?: string;
  /** Texto del enlace. Solo se usa si hay ruta. */
  enlaceTexto?: string;
  /* Fotografia legitima del lugar. Ver el comentario de arriba: si no
     hay, se queda sin definir y la tarjeta sale en su version
     tipografica. NUNCA se rellena con una imagen generada ni con una
     de otra propiedad. */
  foto?: string;
  fotoAlt?: string;
}

export const experiencias: Experiencia[] = [
  {
    id: 'catedral-de-sal',
    titulo: 'Catedral de Sal',
    texto:
      'El recorrido subterráneo más conocido de Colombia, excavado en una mina de sal en funcionamiento durante siglos. Está a 1,4 km del Hotel Atheron Suite.',
    /* Los tres datos salen de la fuente oficial, consultada el 9 de
       septiembre de 2026, y de la ficha de Hotel Atheron Suite, que
       ya declara la distancia validada. No hay ninguno estimado. */
    datos: ['Abierta todos los días', '9:00 a. m. – 4:40 p. m.', '16 min a pie desde el hotel'],
    ruta: '/zipaquira/catedral-de-sal',
    enlaceTexto: 'Leer la guía de la Catedral de Sal',
  },
  {
    id: 'centro-historico',
    titulo: 'Centro histórico',
    texto:
      'Plaza principal, catedral diocesana, calles coloniales y cafés para caminar sin prisa. Nuestros hospedajes del centro están a pocas cuadras.',
    /* Sin "datos": los horarios y las tarifas de las atracciones del
       centro no estan verificados, y una guia propia todavia no
       existe. Se anadiran cuando se comprueben, no antes. */
  },
];

/* ------------------------------------------------------------
   PROXIMAS EXPERIENCIAS

   Se dejan escritas aqui, sin publicar, para que la siguiente
   sesion no tenga que volver a decidir cuales eran:

     embalse-del-neusa   (Casa Neusa ya esta publicada y lo toca)
     gastronomia         (cuando haya sitios que podamos recomendar
                          de verdad, no una lista copiada)
     museos              (Museo Arqueologico, entre otros)
     eventos             (agenda municipal, si resulta fiable)
     transporte          (como llegar desde Bogota)

   Anadir una es anadir un objeto a la lista de arriba. Ni la
   portada ni el CSS cambian.
   ------------------------------------------------------------ */
