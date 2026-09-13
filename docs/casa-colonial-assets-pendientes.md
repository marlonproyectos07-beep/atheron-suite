# Casa Colonial Centro — assets pendientes del recorrido

**Estado al 12 de septiembre de 2026.** Dirección aprobó la narrativa
completa hasta la Habitación 206 —textos, capacidades y distribuciones—
pero **las imágenes de 16 bloques no han llegado** ni a Drive ni al
repositorio. Este documento existe para que la próxima subida no tenga
que adivinarse nada.

## Dónde van los archivos

```
G:\Mi unidad\Fotos hotel casa colonial\CURADURIA CASA COLONIAL CENTRO - WEB BROCHURE VIDEO\
```

Desde ahí entran al repositorio en:

```
public/assets/img/proyectos/casa-colonial-centro/
```

## La regla que decide si un bloque se publica

**Las dos imágenes de una pareja tienen que ser del mismo punto de
vista.** Una fotografía de un sitio junto a un render de otro no es una
transformación: el visitante lee «esto se convertirá en aquello», y eso
promete algo que nadie aprobó.

Si un bloque solo tiene el render y no existe la fotografía real del
mismo encuadre, **hay que decidirlo expresamente** antes de publicarlo:
o se consigue la foto, o el bloque se presenta como propuesta suelta y
rotulada, no como comparativa.

## Nombres exactos que espera el código

Dos archivos por bloque, siempre separados. **Nunca un montaje
«antes y después» en un solo archivo**: una imagen combinada se recorta
al compartirla y el aviso de conceptual se pierde por el camino.

| # | Bloque | Archivo REAL | Archivo VISIÓN |
|---|---|---|---|
| 06 | Recepción + escalera | `casa-colonial-recepcion-actual.webp` | `casa-colonial-recepcion-vision.webp` |
| 07 | Patio 1 / cafetería — A | `casa-colonial-patio1-a-actual.webp` | `casa-colonial-patio1-a-vision.webp` |
| 08 | Patio 1 / cafetería — B | `casa-colonial-patio1-b-actual.webp` | `casa-colonial-patio1-b-vision.webp` |
| 11 | Balcón del lobby | `casa-colonial-balcon-lobby-actual.webp` | `casa-colonial-balcon-lobby-vision.webp` |
| 12 | Lobby piso 2 | `casa-colonial-lobby-actual.webp` | `casa-colonial-lobby-vision.webp` |
| 13 | Habitación 208 · mochilero | `casa-colonial-208-actual.webp` | `casa-colonial-208-vision.webp` |
| 14 | Baño mochilero | `casa-colonial-208-bano-actual.webp` | `casa-colonial-208-bano-vision.webp` |
| 15 | Pasillo central piso 2 | `casa-colonial-pasillo-central-actual.webp` | `casa-colonial-pasillo-central-vision.webp` |
| 16 | Pasillo habitaciones | *(ya está: `casa-colonial-pasillo-habitaciones-actual.webp`)* | *(ya está: `casa-colonial-concepto-pasillo.webp`)* |
| 17 | Habitación 201 | `casa-colonial-201-actual.webp` | `casa-colonial-201-vision.webp` |
| 18 | Habitación 202 | `casa-colonial-202-actual.webp` | `casa-colonial-202-vision.webp` |
| 19 | Habitación 203 | `casa-colonial-203-actual.webp` | `casa-colonial-203-vision.webp` |
| 20 | Baño modelo 201–208 | `casa-colonial-bano-modelo-actual.webp` | `casa-colonial-bano-modelo-vision.webp` |
| 21 | Habitación 204 | `casa-colonial-204-actual.webp` | `casa-colonial-204-vision.webp` |
| 22 | Habitación 205 | `casa-colonial-205-actual.webp` | `casa-colonial-205-vision.webp` |
| 23 | Habitación 206 | `casa-colonial-206-actual.webp` | `casa-colonial-206-vision.webp` |

El bloque 16 ya tiene sus dos imágenes y está publicado como «Aquí
comienza el hospedaje».

## Datos aprobados de cada habitación

Se copian aquí porque son lo que NO se puede cambiar ni deducir de una
imagen. Ninguna capacidad se publica si no está en esta tabla.

| Habitación | Capacidad | Distribución aprobada |
|---|---|---|
| **208 · Mochilero** | 12 huéspedes | 6 camarotes, 12 plazas. Primera prueba de Atheron en el segmento mochilero. **Se presenta como concepto, no como unidad definitiva.** |
| **201** | *sin validar* | 1 cama matrimonial + 1 camarote + 1 sofá cama + escritorio. Unidad amplia / familiar / grupal. **No publicar capacidad exacta: no está validada.** |
| **202** | 3 huéspedes | Camarote especial: cama inferior **doble**, superior **sencilla**. |
| **203** | 3 huéspedes | Cama inferior doble, superior sencilla. Diferencial: balcón con vista al Parque Principal. |
| **204** | 4 huéspedes | Camarote doble: inferior doble + superior doble. El acceso al baño debe quedar visible. |
| **205** | 3 huéspedes | Misma tipología que la 202: inferior doble + superior sencilla. **Usar la imagen 205 separada, nunca el collage 205+206.** |
| **206** | 6–8 huéspedes | 2 camarotes a la izquierda, 1 a la derecha, pasillo central libre, balcón al fondo, acceso al baño a mano derecha nada más entrar. **Solo la última versión aprobada; no volver a iteraciones anteriores.** |

**Baño modelo:** es el concepto visual maestro de los baños de las
habitaciones 201–208. Se muestra como propuesta de remodelación, nunca
como fotografía de obra terminada. La referencia física real es
sanitario, lavamanos, ducha al fondo y división de vidrio.

## Requisitos técnicos de los archivos

- **WebP**, entre 1000 y 1600 px por el lado largo.
- Las dos imágenes de una pareja, **con la misma proporción** si es
  posible. Si no lo es, no pasa nada: el bloque las alinea arriba y
  cada una conserva su forma. Lo que no se hace nunca es recortar para
  igualarlas.
- Sin texto incrustado si puede evitarse. Los rótulos van en HTML, y
  los pone el componente a partir del tipo de la imagen.
- Algunos renders aprobados ya traen cartelería dentro del render
  («ATHERON CAFETERÍA», números de habitación). **No se recrean ni se
  modifican sin autorización**; simplemente no se les añade texto
  encima.

## Cómo se integran cuando lleguen

1. `ficha()` en `src/data/casa-colonial-centro.ts`, con `tipo: 'REAL'` o
   `tipo: 'CONCEPTUAL'`. El tipo es lo que hace que el render salga con
   el sello encima, el rótulo debajo y el aviso de que el diseño puede
   cambiar. **Ningún rótulo se escribe a mano en la maqueta.**
2. Entrada nueva en el array `comparativas`, en su posición del orden
   maestro.
3. Los textos ya están aprobados y viven en la orden del 12/09/2026.

La lista corta de lo que falta también está comentada dentro de
`src/data/casa-colonial-centro.ts`, junto al array `comparativas`.
