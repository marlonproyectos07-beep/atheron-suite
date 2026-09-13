# Fraunces — procedencia y licencia

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `fraunces-latin-var.woff2` | Fraunces, fuente variable, subconjunto **latin**. 65,7 KB. |
| `OFL.txt` | La licencia, tal y como la publica el proyecto. Se conserva porque la licencia obliga a distribuirla con la fuente. |

## Licencia

**SIL Open Font License, Version 1.1.**
Copyright 2018 The Fraunces Project Authors
<https://github.com/undercasetype/Fraunces>

La OFL permite expresamente usar, estudiar, modificar y **redistribuir**
libremente el software de fuente, incluido servirlo desde nuestro propio
dominio. Las dos condiciones que nos afectan y que cumplimos:

1. **La licencia viaja con la fuente.** Por eso `OFL.txt` está en esta
   misma carpeta y se publica junto al archivo, no solo en el repositorio.
2. **No se renombra la fuente.** No la hemos modificado; es el archivo tal
   cual lo distribuye el proyecto, así que tampoco aplica la cláusula de
   cambio de nombre para versiones derivadas.

No se vende ni se sublicencia. No hay que pagar nada a nadie.

## Origen exacto del archivo binario

Se descargó el 9 de septiembre de 2026 de la CDN oficial de Google Fonts,
que es el canal por el que el proyecto Fraunces se distribuye para web:

```
https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2
```

Es **exactamente el mismo archivo** que el sitio venía descargando en cada
visita hasta hoy. Esa es la razón de haberlo tomado de ahí y no de
recompilarlo desde el repositorio original: garantiza que la tipografía se
ve igual byte a byte, sin ninguna diferencia de renderizado que revisar.

El repositorio original —`github.com/undercasetype/Fraunces`— es de donde
sale `OFL.txt` y es la fuente de verdad de la licencia.

## Por qué solo el subconjunto «latin»

Google parte Fraunces en tres subconjuntos: `latin`, `latin-ext` y
`vietnamese`. Se recorrió el texto de las 28 páginas construidas y se
clasificó cada carácter:

| Subconjunto | Caracteres que el sitio usa |
|---|---|
| `latin` | 93 |
| `latin-ext` | **ninguno** |
| `vietnamese` | **ninguno** |

El castellano cabe entero en `latin`: las vocales acentuadas, la eñe, la
diéresis, `¿` y `¡` están todas en el bloque U+0000–U+00FF, y los guiones
largos y las comillas tipográficas en U+2000–U+206F.

Quedan cuatro caracteres fuera de los tres subconjuntos —🚿, 🔒, ← y ★—,
pero ninguna fuente latina los trae: los pinta la fuente de emoji del
sistema, igual que antes.

## Un solo archivo para los pesos 500 y 600

Es una **fuente variable**: el mismo archivo cubre todo el rango de grosor
y el eje de tamaño óptico (`opsz`, 9–144). Por eso hay dos declaraciones
`@font-face` en `base.css` apuntando al mismo archivo, que es exactamente
como lo declaraba Google. El navegador lo descarga una sola vez.

## Por qué dejamos de usar Google Fonts

Medido con Lighthouse sobre el sitio construido y servido con compresión,
el 9 de septiembre de 2026. El elemento LCP de casi todas las páginas es
el `<h1>`, y su *element render delay* era de **1.283 ms** esperando estos
65,8 KB desde un tercero, con dos conexiones extra que montar (DNS + TLS
a `fonts.googleapis.com` y a `fonts.gstatic.com`).

Sirviéndolo desde nuestro dominio, el archivo viaja por la conexión que ya
está abierta, con las cabeceras de caché largas que `vercel.json` ya aplica
a `/assets/`, y sin depender de que un tercero esté disponible.

## Si algún día hay que actualizar la fuente

1. Pedir el CSS a `fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap`
   con un agente de navegador moderno.
2. Quedarse con la URL del bloque `/* latin */`.
3. Descargarla aquí con el mismo nombre.
4. Volver a comprobar qué subconjuntos hacen falta, no darlo por hecho.
5. Medir Lighthouse antes y después.
