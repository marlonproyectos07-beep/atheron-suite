# Edificio de Algarra — control de calidad y pendientes

> Documento **interno**. No se publica: vive en `docs/`, que no entra en el
> sitio construido. Aquí está lo que hay que resolver **antes** de que estas
> fichas salgan de borrador bajo la marca.
>
> **Ninguna cifra de costos, márgenes ni precios internos se escribe aquí.**
> Esos datos no entran al repositorio en ningún archivo, ni siquiera en
> documentación interna: el repositorio se comparte, se clona y se sirve, y
> un número que no está no se puede filtrar. Se manejan fuera.

## Qué es esto

Un edificio de seis apartamentos en el sector de Algarra, Zipaquirá,
administrado por Edwin, que Atheron Suite comercializa como **alojamiento
aliado**. No es propiedad de Atheron Suite, y la ficha lo dice.

Estado: **todo en borrador**. Las siete páginas llevan `publicado: false`,
salen con `noindex`, no entran en el sitemap y no se enlazan desde el
listado ni desde la portada.

## Riesgos operativos detectados en las reseñas

Esto **no es texto comercial** y no debe convertirse en uno. Es la lista de
lo que hay que verificar antes de poner la marca encima, porque una reseña
mala en una ficha nuestra la paga la marca, no el aliado.

| Riesgo | Qué comprobar antes de publicar |
|---|---|
| Limpieza de sábanas | Protocolo de cambio y verificación por unidad |
| Polvo bajo camas y muebles | Checklist de aseo profundo, no solo superficies visibles |
| Apartamentos aún en aseo al llegar | Hora de corte de limpieza frente a la hora de entrada |
| Dotación limitada de ollas y utensilios | La cocina equipada está confirmada; falta inventario detallado por apartamento |
| Parqueadero no disponible a veces | Hay dos cupos cubiertos para carros y tres para motos; deben solicitarse antes de llegar y siguen sujetos a disponibilidad |
| Ruido entre pisos | Qué se puede mitigar y qué hay que advertir por escrito |
| Internet inestable en el dúplex | Medición real antes de publicar la ficha del dúplex |
| Recargo de aseo por mascotas | Se confirmó que son bienvenidas y deben reportarse; falta definir el valor exacto del recargo antes de publicar una cifra |
| Comunicación y entrega de llaves | Protocolo de entrega y tiempos de respuesta |
| Base de cama desajustada (401) | Reparación verificada |

Además, el **402** aparece hoy en el tramo peor valorado de su categoría en
Airbnb. Es un dato de control de calidad, no un argumento comercial, y no
se muestra en ninguna página.

## Datos ya confirmados

- No hay ascensor: el acceso es por escaleras y no se ofrece accesibilidad para movilidad reducida.
- Hay dos espacios cubiertos para carros ($20.000 por noche) y tres para motos ($10.000 por noche), sujetos a disponibilidad y pagados en las instalaciones.
- La llegada habitual es de 3:00 p. m. a 5:00 p. m.; fuera de ese horario el huésped debe avisar su hora estimada.
- La salida es antes de las 11:00 a. m.
- El edificio está en el barrio Algarra III y ya se verificó el enlace oficial de Google Maps.
- Las mascotas son bienvenidas, deben reportarse y generan un recargo adicional de aseo todavía sin cifra confirmada.
- Cada apartamento tiene cocina equipada, agua caliente y lavadora.
- Las camas dobles miden 1,40 m.
- Los apartamentos conservan, en términos generales, el mismo diseño, estructura y acabados.

## Datos pendientes de confirmar

1. **Nombre comercial del edificio.** Las fichas usan «Apartamentos en
   Algarra», que es descriptivo y no inventa una marca. Falta el definitivo.
2. **Capacidad del 402.** Airbnb declara 7 huéspedes y el título dice hasta
   6. Mientras no se aclare, la ficha **no publica** ninguna cifra.
3. **Distribución del dúplex.** El título dice «3 alcobas» y Airbnb declara
   1 habitación. Igual: no se publica número de habitaciones.
4. **Si el dúplex pertenece al mismo edificio** y cómo se relaciona con los
   otros cinco.
5. **Qué cinco unidades** componen la capacidad grupal de 35. Edwin debe
   identificarlas; la ficha habla de la capacidad sin nombrar unidades.
6. **Distancias y entorno.** La ubicación y el enlace de Maps ya están
   confirmados; faltan tiempos reales hacia puntos de interés.
7. **Tarifa pública aprobada** por unidad y para grupo.
8. **Valor exacto del recargo de aseo por mascotas.** La aceptación y el
   deber de reportarlas ya están confirmados.

## Fotografías

**No hay ninguna autorizada, y por eso no hay ninguna publicada.** Las siete
fichas van sin fotos: el sistema pinta el recuadro de «foto pendiente» y la
página funciona igual.

Antes de cargar cualquier imagen:

- Autorización expresa de Edwin.
- Inventario visual auditado, con la unidad a la que pertenece cada foto.
- **Carpeta separada por apartamento.** Nunca mezclar.

⚠️ **Aviso concreto:** Airbnb muestra hoy en la ficha del **201** varias
imágenes cuyos identificadores pertenecen al anuncio del **301**. No se
descarga, asigna ni publica ninguna de esas fotos como del 201 hasta que
Edwin aclare la situación. Usar la foto de un apartamento para vender otro
es exactamente la clase de error que destruye la confianza cuando el
huésped abre la puerta.

Cuando lleguen las aprobadas: convertir a WebP con el patrón del proyecto
(1086 px de ancho, calidad 82). Se permite corregir luz, balance de blancos,
color, contraste, nitidez, perspectiva y encuadre. **No** añadir, quitar ni
modificar elementos reales.

## Testimonios auditados, pendientes de selección final

Verificados y atribuibles a Airbnb. **Todavía no se publican**: el bloque de
prueba social no está puesto en ninguna ficha hasta que se apruebe la
selección.

- **201** — «Excelente lugar, muy cómodo, limpio y acogedor. El anfitrión fue
  muy atento y todo estuvo perfecto.» — Deibys
- **301** — «Es un apartamento muy agradable y acogedor. La zona es muy
  central.» — Leonel
- **302** — «El apartamento está ubicado en una zona tranquila, fácil
  acceso.» — Leidy Lorena
- **401** — «Lugar agradable, impecable, zona segura y central.» — Diana

Fortalezas que se repiten en las reseñas: ubicación central, zona tranquila,
comodidad, hospitalidad, fácil acceso, cercanía a restaurantes y apartamentos
fieles a las fotografías.

Cuando se aprueben, van con el bloque `pruebaSocial`, atribuidos a Airbnb y
**sin** `aggregateRating` ni `review` en el JSON-LD, igual que en Casa Neusa.

## Lo que la ficha NO dice, a propósito

- No hay `geo`, `petsAllowed`, `aggregateRating`, `review`, `offers` ni
  `priceRange` en el JSON-LD de ninguna de las siete páginas.
- No se afirma qué unidades componen el grupo de 35.
- No se presentan 35 huéspedes como capacidad ordinaria: siempre con
  «sujeta a disponibilidad y confirmación previa» y diciendo que la
  acomodación máxima puede incluir sofá-camas y dos colchonetas.
- No se publican descuentos por volumen ni tarifas de grupo cerradas.
- No se menciona ninguna condición del acuerdo con la administración.
