# Hotel La Margarita — trazabilidad de datos y pendientes

> Documento **interno**. No se publica: vive en `docs/`, que no entra en el
> sitio construido.
>
> Existe por una razon concreta: la ficha se levanto **sin poder abrir la
> fuente que se entrego**. Aqui queda escrito de donde sale cada dato que se
> publica, para que cualquiera pueda comprobarlo o tumbarlo.

## Que es esto

Hotel en Zipaquira que Atheron Suite comercializa como **alojamiento aliado**.
No es propiedad de Atheron Suite, y la ficha lo dice. Es el segundo aliado de
la marca, despues de Hotel Colonial Confort.

Estado: **borrador**. `publicado: false`, sale con `noindex`, no entra en el
sitemap y no aparece ni en el listado ni en la portada.

## El bloqueo: la fuente entregada no se puede abrir

El enlace que se entrego para levantar la ficha es la ficha publica de Google
del hotel:

```
https://share.google/ahqOT4EGauLT2ntoi
```

**No se puede abrir desde el entorno de trabajo.** No es el enlace ni los
permisos: el proxy de salida deniega la conexion por politica de la
organizacion, igual que ya paso con Google Drive.

```
curl https://share.google/ahqOT4EGauLT2ntoi
curl: (56) CONNECT tunnel failed, response 403
```

Tambien estan bloqueados `paginasamarillas.com.co`, `viajaporcolombia.com`,
`nexdu.com` y el resolutor de nombres no resuelve `hotellamargarita.com`. La
unica via de salida que funciona es la **busqueda web**, que devuelve
extractos de esas mismas paginas sin abrirlas.

Consecuencia directa: **de la ficha de Google no se obtuvo nada**. Ni
calificacion, ni numero de resenas, ni fotografias, ni horarios, ni el texto
de las opiniones. Nada de eso se publica.

## De donde sale cada dato publicado

| Dato en la ficha | Fuente |
|---|---|
| Nombre «Hotel La Margarita» | Busqueda web, coincidente en las cuatro fuentes |
| Zipaquira, Cundinamarca | Idem |
| Barrio La Esmeralda | Extracto de directorio: «Calle 12 No 9-31, Barrio La Esmeralda – Zipaquira» |
| Cerca del centro historico y de la Catedral de Sal | Descripcion que repiten las fuentes consultadas |
| Wifi | Idem |
| Television por cable en las habitaciones | Idem |
| RNT numero 29756 | Registro Nacional de Turismo, citado en varias fuentes y en el listado de prestadores de servicios turisticos |
| Hasta 40 huespedes en grupo | **Marlon**, por escrito en el encargo |
| Desde $ 65.000 por persona por noche | **Marlon**, por escrito en el encargo |
| Es un aliado con el que ya se ha trabajado | **Marlon**, por escrito en el encargo |
| Enlace del mapa | **Marlon**, es el enlace que entrego |

## Datos conocidos que NO se publican, a proposito

- **Direccion exacta: Calle 12 No 9-31.** Se conoce, pero el patron de la marca
  para alojamientos aliados es no publicar la direccion: se entrega al
  confirmar la reserva. Igual que en Hotel Colonial Confort. Si se quiere
  cambiar el criterio, se cambia para todos, no solo para este.
- **Telefonos que aparecen en directorios** (un fijo y un celular). No se
  publican: el contacto de la marca es el WhatsApp de Atheron Suite, y publicar
  la linea del hotel invita al cliente a saltarse la intermediacion.

## Lo que la ficha NO dice, porque no se pudo verificar

Ninguno de estos datos aparece en la pagina. No se dedujeron, no se estimaron
y no se rellenaron con texto de ejemplo:

1. **Numero de habitaciones.** La cifra no esta en ninguna fuente accesible.
2. **Tipos de habitacion, camas y banos.** La unica entrada del bloque de
   habitaciones esta marcada como pendiente y lo dice de forma explicita.
3. **Horarios de entrada y salida.** El bloque de horarios va vacio y por eso
   no se pinta. Tampoco hay `checkinTime` ni `checkoutTime` en el JSON-LD.
4. **Calificacion y resenas de Google.** La busqueda devolvio dos frases
   sueltas atribuidas a huespedes, pero **sin autor, sin fecha y sin poder
   abrir la pagina que las contiene**. No se publican, y el bloque de prueba
   social no existe en la ficha.
5. **Politica de mascotas.** Sin dato, y por eso el JSON-LD no lleva
   `petsAllowed` en ningun valor, ni siquiera `false`.
6. **Parqueadero.** Sin dato. No se menciona.
7. **Desayuno o alimentacion.** Sin dato. No se menciona.
8. **Coordenadas.** `latitud` y `longitud` van nulas. El boton de ubicacion usa
   el enlace publico de Google que entrego Marlon.
9. **Distancias reales** a la Catedral de Sal y al centro. Se dice que esta
   cerca, que es lo que afirman las fuentes; no se publica ningun tiempo ni
   ninguna distancia concreta.

## Fotografias

**No hay ninguna, y por eso no hay ninguna publicada.** La ficha va sin fotos:
el sistema pinta el recuadro de «foto pendiente» y la pagina funciona igual.

Deliberadamente **no se descargo ninguna imagen** de la ficha de Google, de
Facebook ni de ningun directorio. Publicar la foto de un hotel bajo la marca
de Atheron Suite sin autorizacion del hotel es un problema de derechos, y
ademas ya se detecto en otro aliado que las fotos de los directorios llegan
sin constancia de permiso.

Antes de cargar cualquier imagen:

- Autorizacion expresa del hotel.
- Constancia de quien la tomo o de que el hotel puede cederla.
- Conversion con `npm run foto` (1086 px de ancho, calidad 82) y las variantes
  responsive que genera el proyecto.

## Que hace falta para poder publicar

El guardian de publicacion (`npm run prueba`) exige, para un hospedaje por
habitaciones, todo esto. Hoy faltan cuatro cosas:

| Requisito | Estado |
|---|---|
| Nombre real | Cumple |
| Presentacion escrita | Cumple |
| Sector real en el listado | Cumple |
| Descripcion para buscadores de 80+ caracteres | Cumple |
| Precio real | Cumple |
| Ubicacion publica | Cumple |
| Titulo del apartado de contacto | Cumple |
| Servicios listados | Cumple |
| Condiciones de reserva | Cumple |
| **Foto de tarjeta** | **Falta** |
| **Al menos una habitacion con datos reales** | **Falta** |

Es decir: con **fotografias autorizadas** y el **inventario de habitaciones**,
la ficha se publica cambiando una sola linea.

## Preguntas para el hotel

Ordenadas por lo que mas bloquea:

1. Autorizacion escrita para usar fotografias, y que fotografias.
2. Cuantas habitaciones hay, de que tipo, con cuantas camas y cuantos banos.
3. Horario de entrada y de salida.
4. Se admiten mascotas o no.
5. Hay parqueadero, cuantos cupos y con que costo.
6. Se incluye desayuno.
7. Confirmar que la capacidad de 40 personas sigue vigente y con que
   distribucion.
8. Confirmar si la tarifa de $ 65.000 por persona es la vigente para 2026 y si
   cambia por temporada o por tamano del grupo.

## Nota sobre la numeracion

La ficha entra con `orden: 6` e insignia `06`. Conviene revisarlo: entre los
hospedajes publicados hoy la numeracion va 01, 02, 03 y 05, sin 04. Las
plantillas en obra (`hospedaje-02` a `hospedaje-07`) ocupan los numeros 2 a 7,
asi que cualquier numero nuevo colisiona con alguna de ellas; como estan
despublicadas no afecta al listado, pero la insignia que ve el visitante si
salta numeros.
