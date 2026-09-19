/* ============================================================
   FECHAS QUE SE LE ENSENAN A UNA PERSONA

   Habia tres formas distintas de escribir la misma fecha en el sitio:
   el blog la ponia larga ("10 de septiembre de 2026"), Gallina al
   Vapor tenia su propia copia de la misma funcion, y las fichas de
   lugares publicaban el AAAA-MM-DD en crudo: "Datos comprobados el
   2026-09-19". Eso ultimo no es una fecha para un visitante, es un
   dato de base de datos.

   Aqui solo hay una, y todas las paginas la usan.

   POR QUE timeZone UTC Y MEDIODIA

   La fecha se guarda como AAAA-MM-DD, sin hora. Si se convierte a
   Date sin decir nada, el navegador -o la maquina que construye- la
   interpreta en SU zona, y una fecha de Colombia construida en un
   servidor europeo puede retroceder un dia. Fijando la hora al
   mediodia UTC y formateando en UTC, el dia no se mueve nunca.
   ============================================================ */

/** "2026-09-19" -> "19 de septiembre de 2026". */
export const fechaLarga = (iso: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));
