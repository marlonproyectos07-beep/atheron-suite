# Video del recorrido — Hotel La Margarita

La ficha ya está preparada. El reproductor **solo aparece cuando existen los dos archivos**
(comprobación en el build, `src/pages/hospedajes/[slug].astro`). Mientras no estén, la ficha sale
sin sección de video, sin cuadro vacío y sin reproductor roto.

## Dónde colocar los archivos

| Archivo | Ruta exacta en el repo |
|---|---|
| Video maestro | `public/assets/video/hotel-la-margarita/hotel-la-margarita-recorrido-web.mp4` |
| Poster (fotograma de la fachada) | `public/assets/video/hotel-la-margarita/hotel-la-margarita-poster.webp` |

Si el video final no es 16:9, ajustar `ancho` y `alto` en `videoPrincipal` de
`src/content/hospedajes/hotel-la-margarita.md` (de ahí sale la proporción reservada, sin saltos de página).
Textos ya cargados: «Conoce Hotel La Margarita» / «Un recorrido real por el hospedaje».

## Comportamiento en la web

`controls`, `playsinline`, `preload="none"` (no descarga nada hasta pulsar play, no afecta al LCP),
poster visible, ancho fluido. Sin autoplay, sin texto sobre el reproductor.

## Cómo armar el video maestro (35–45 s), sin editar la realidad

Secuencia: fachada → entrada → recepción → zonas comunes → acceso a habitaciones → habitación.
Solo cortes y unión: sin filtros de color, sin aceleración engañosa, sin escenas añadidas.

```bash
# A = video de fachada (~10 s), B = recorrido (~68 s). Ajustar -ss/-t a los tramos reales.
ffmpeg -i fachada.mp4 -vf "scale=1280:-2,fps=30" -an -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p a.mp4
ffmpeg -ss 0 -t 32 -i recorrido.mp4 -vf "scale=1280:-2,fps=30" -an -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p b.mp4
printf "file 'a.mp4'\nfile 'b.mp4'\n" > lista.txt
ffmpeg -f concat -safe 0 -i lista.txt -c copy -movflags +faststart hotel-la-margarita-recorrido-web.mp4

# Poster: un fotograma real de la fachada
ffmpeg -ss 2 -i fachada.mp4 -frames:v 1 -vf "scale=1280:-2" -c:v libwebp -quality 80 hotel-la-margarita-poster.webp
```

Si el material es vertical, usar `scale=720:-2` y poner `ancho: 720`, `alto: 1280`.
Objetivo de peso: ≤ 8 MB el video y ≤ 150 KB el poster (límite del sitio: 1 MB por foto).
Si hay audio ambiente útil, quitar `-an`; si hay voces de personas, dejarlo sin audio.
