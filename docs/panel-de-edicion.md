# El panel de edición

> Cómo administrar Atheron Suite sin tocar código.
> 20 de agosto de 2026.
>
> **Estado: funcionando online.** Falta solo fusionar a `main` para que viva en
> `hotelesatheron.com/admin`. Ver [CONTINUIDAD-PROYECTO.md](CONTINUIDAD-PROYECTO.md).

---

## 1. Qué es y qué no es

El panel deja editar **el contenido**: textos, precios, servicios, fotos y datos de los siete hospedajes.

No deja cambiar **la estructura**: el diseño, las secciones de las páginas, los colores o el código. Eso sigue viviendo en el repositorio, y es a propósito: si el panel pudiera tocarlo, un clic mal dado podría descuadrar el sitio entero.

---

## 2. Dónde se entra

| Situación | Dirección |
|---|---|
| **Desde internet** (después del merge) | `hotelesatheron.com/admin` |
| **Ahora, para probar** | `atheron-suite-git-astro-marlon-atheron.vercel.app/admin` |
| **En tu computador** (desarrollo) | `http://localhost:4321/admin/index.html` |

Entras con **tu cuenta de GitHub**. No hay usuario ni contraseña de Atheron
Suite: es deliberado, así no hay una contraseña más que gestionar ni que se
pueda filtrar.

El modo local necesita el servidor de desarrollo en marcha (`npm run dev`) y **solo funciona en Chrome, Edge o Brave** — usa una función que Firefox y Safari no tienen. El modo online funciona en cualquier navegador, **también en el móvil**: puedes hacer la foto en la propiedad y subirla ahí mismo.

---

## 3. Cómo un cambio llega a la web

```
Escribes en el panel  →  Guardar
        │
        ▼
GitHub recibe el cambio, con fecha y detalle de qué cambió
        │
        ▼
Vercel lo detecta y reconstruye el sitio
        │
        ▼
hotelesatheron.com actualizado        ~40 a 60 segundos
```

**Verificado de punta a punta** el 20 de agosto de 2026: una edición hecha desde
el panel online generó el commit `400d938` en GitHub, Vercel construyó sin
errores, y el cambio apareció en la ficha, en el listado, en la portada y en el
mensaje de WhatsApp. **Una sola edición, cuatro sitios actualizados.**

**En modo local esto no ocurre.** El panel escribe archivos en tu disco y ahí se quedan: hay que subirlos con Git a mano. El flujo automático solo existe cuando el panel entra desde internet.

> ### ⚠️ Antes del merge, una advertencia
>
> El panel está configurado para escribir en la rama **`astro`**, no en `main`.
> Es lo correcto ahora mismo, porque `main` todavía sirve el sitio antiguo.
>
> **Después del merge hay que cambiar `public/admin/config.yml`, línea 45, de
> `branch: astro` a `branch: main`.** Si se olvida, guardarás desde el panel,
> verás "guardado", y el sitio no cambiará nunca — sin ningún error visible.
>
> Está anotado como paso 1 en [CONTINUIDAD-PROYECTO.md](CONTINUIDAD-PROYECTO.md).

---

## 4. El interruptor más importante: "Publicado"

Cada ficha de hospedaje tiene una casilla llamada **Publicado**.

| Estado | Qué pasa |
|---|---|
| **Apagado** | La página existe pero le pide a Google que **no la indexe**, y **no entra** en el mapa del sitio |
| **Encendido** | Se indexa y entra en el mapa del sitio |

Enciéndelo **solo cuando la ficha tenga nombre real, fotos y precio.**

> **Por qué importa tanto:** publicar varias páginas casi vacías y parecidas entre sí es lo que Google llama "contenido delgado", y no castiga solo a esas páginas: castiga a **todo el dominio**. Es mejor una ficha buena indexada que siete flojas.

Antes esto eran dos tareas separadas —quitar el `noindex` a mano *y* acordarse de añadir la dirección al mapa del sitio—. Era fácil hacer una y olvidar la otra, y entonces la página se indexaba pero Google nunca la descubría. Ahora es la misma casilla y no se pueden desincronizar.

---

## 5. El otro interruptor delicado: "Publicar la dirección exacta"

| Estado | Qué pasa |
|---|---|
| **Apagado** | La calle **no** aparece ni en la página ni en los datos que lee Google, y sale el aviso de que la dirección se entrega al confirmar la reserva |
| **Encendido** | Se publica la dirección completa |

**Apagado en los hospedajes aliados.** Publicar la dirección de una propiedad ajena sin permiso no es un detalle de diseño: es un problema real.

---

## 6. Fotos

### Los límites, y por qué existen

```
Peso recomendado ....... menos de 300 KB
Ancho recomendado ...... 1600 px
Formato ................ JPG
```

En la primera prueba se subió una captura de pantalla de **1,1 MB**. Multiplicada por 5 fotos de galería y 7 hospedajes, son **38 MB** que el visitante descarga. En móvil con datos, eso no es lentitud: es abandono.

Por eso la publicación:

- **Avisa** por encima de 300 KB, pero sigue.
- **Se detiene** por encima de 1 MB, con un mensaje que dice qué foto es y cómo arreglarlo.

Si la publicación se detiene, **el sitio anterior sigue en pie**. No se cae nada.

### Cómo comprimir sin saber de edición de imagen

Hay una herramienta en el proyecto. En una terminal, dentro de la carpeta:

```bash
npm run foto -- "C:/ruta/a/tu/foto.jpg" sala la-magia-de-zipaquira
```

Reduce la foto a 1600 px, la convierte a JPG de calidad alta y la deja con nombre descriptivo. En la prueba pasó de **1.095 KB a 102 KB, un 91% menos**, sin diferencia visible.

Al terminar te dice la dirección exacta que tienes que pegar en el campo de foto del panel.

### Los nombres de archivo

Las fotos se guardan en `public/assets/img/hospedajes/` con nombres del tipo:

```
la-magia-de-zipaquira-sala.jpg
la-magia-de-zipaquira-fachada.jpg
```

Un nombre como `pasted-image-1787270231146.png` no le dice nada a Google, y dentro de seis meses tampoco a ti.

### "Qué se ve en la foto"

Cada foto tiene ese campo al lado. **No lo dejes vacío.** Es lo que lee Google y lo que oye quien usa un lector de pantalla. Una foto sin ese texto es una foto que Google no entiende.

Escribe lo que se ve, en una frase: *"Fachada de la casa con jardín delantero"*, no *"foto1"*.

---

## 7. Los textos en amarillo

El sitio marca en amarillo todo lo que todavía es provisional, para que sea imposible publicarlo por error creyendo que era definitivo.

En el panel eso se controla con las casillas **"Provisional"** que hay junto a varios campos. Cuando pongas el dato real, apágala y el amarillo desaparece.

En la tarjeta del listado no hace falta tocarlas: **si la ficha no está publicada, sus datos salen en amarillo solos.**

---

## 8. Si algo sale mal

Tres redes de seguridad, de la más rápida a la más profunda:

| # | Dónde | Qué hace |
|---|---|---|
| 1 | **Vercel** → Deployments | Eliges la publicación anterior y "Promote to Production". Un clic, medio minuto |
| 2 | **GitHub** → historial | Cada guardado queda registrado con fecha y qué palabras cambiaron. Se puede volver a cualquier punto |
| 3 | **La comprobación previa** | Si el cambio rompe algo, ni llega a publicarse: la construcción falla y el sitio anterior sigue en pie |

**Nada de lo que hagas en el panel puede dejar el sitio caído.** Lo peor que puede pasar es que un cambio no aparezca, o que aparezca algo feo que se deshace en un clic.

---

## 9. Mejora futura pendiente

**Optimización automática de imágenes al subirlas: compresión y conversión a WebP/AVIF.**

Hoy la compresión es manual (`npm run foto`). Lo ideal sería que al subir una foto desde el panel se comprimiera y convirtiera sola, sin que el administrador tenga que saber nada de optimización de imágenes.

No se implementa todavía porque añade complejidad y riesgo a una etapa que ya tiene bastante. El script `scripts/optimiza-fotos.mjs` es el punto de partida cuando se aborde.

---

## 10. Cómo entra el panel a GitHub

Cuando pulsas *"Iniciar sesión con GitHub"* pasa esto:

```
El panel  →  el portero en Cloudflare  →  GitHub  →  de vuelta al panel
```

El **portero** es un programa minúsculo alojado gratis en Cloudflare
(`sveltia-cms-auth.comercialgsc001.workers.dev`). Existe porque GitHub no deja
que una página web le pida permiso directamente: exige un intermediario que
guarde las credenciales fuera de la vista.

**No almacena nada.** Recibe el permiso de GitHub y te lo devuelve al navegador.

Lleva **lista blanca de dominios**: solo responde desde `hotelesatheron.com`,
sus subdominios y la dirección de pruebas. Si otra web intentara usarlo para
conseguir acceso a tu repositorio, lo rechaza. Está verificado.

### Qué permiso recibe, dicho sin adornos

GitHub concede un permiso llamado `repo`, que alcanza **todos tus
repositorios**, no solo este. Es más de lo necesario y es el punto débil de
este montaje.

Lo que lo compensa: el permiso vive **solo en tu navegador**, el panel solo
conoce `atheron-suite`, y el portero tiene la lista blanca.

**Para cortar el acceso al instante:** GitHub → Settings → Applications →
`Atheron Suite CMS` → *Revocar todos los tokens de usuario*.

---

## 11. Qué NO puede hacer el panel

- Cambiar el diseño, los colores o las tipografías *(previsto para una etapa posterior)*
- Editar los artículos del blog *(siguen en código; previsto para una etapa posterior)*
- Editar los textos de la portada y de las dos landings *(decisión tomada: la estructura de esas páginas se queda en código)*
- Crear páginas nuevas
- Cambiar el dominio o la configuración del servidor
