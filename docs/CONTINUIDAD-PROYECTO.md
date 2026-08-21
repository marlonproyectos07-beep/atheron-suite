# Continuidad del proyecto — Atheron Suite

> **Documento de traspaso.** Escrito el 20 de agosto de 2026, al cerrar la sesión
> en que el sitio se migró a Astro y se montó el panel de edición online.
>
> Si eres una sesión nueva de Claude, o una persona que retoma el proyecto:
> **lee este documento entero antes de tocar nada.** Contiene decisiones que no
> se deducen del código y errores ya cometidos que no conviene repetir.

---

## 1. Estado en una frase

El sitio está migrado a Astro y tiene un panel de edición online funcionando,
**pero todavía no se ha publicado**: todo vive en la rama `astro`. El dominio
`hotelesatheron.com` sigue sirviendo el sitio antiguo desde `main`.

---

## 2. Arquitectura actual

```
        TÚ, desde cualquier navegador
                    │
                    ▼
        hotelesatheron.com/admin          ← el panel (Sveltia CMS)
                    │
                    │  "quiero entrar"
                    ▼
    sveltia-cms-auth.comercialgsc001.workers.dev
        (Cloudflare Worker — el "portero")
                    │
                    ▼
                 GITHUB                    ← pide permiso, lo devuelve
                    │
    ────────────────┴────────────────
                    │
        Guardas → commit en GitHub
                    │
                    ▼
        Vercel construye (npm run build)
                    │
                    ▼
        hotelesatheron.com actualizado     ~40 a 60 segundos
```

### Piezas

| Pieza | Qué es | Dónde |
|---|---|---|
| **Generador** | Astro 7.2.4, salida estática | `astro.config.mjs` |
| **Contenido** | 7 hospedajes en Markdown | `src/content/hospedajes/` |
| **Esquema** | Qué campos tiene un hospedaje (49) | `src/content.config.ts` |
| **Panel** | Sveltia CMS desde CDN | `public/admin/` |
| **Portero** | Cloudflare Worker, `sveltia-cms-auth` | Cuenta `Comercialgsc001@gmail.com` |
| **Identidad** | App OAuth `Atheron Suite CMS` | GitHub de `marlonproyectos07-beep` |
| **Publicación** | Vercel, proyecto `atheron-suite` | Equipo `marlon-atheron` |

### Decisiones estructurales que NO deben revertirse

| Decisión | Por qué |
|---|---|
| `build.format: 'preserve'` | Genera los archivos con la forma exacta que tenían antes. **Cambiarlo mueve las 14 direcciones del sitio.** |
| `trailingSlash: 'never'` | Igual que hoy en producción |
| El `<head>` vive solo en `src/layouts/Base.astro` | Antes estaba repetido 19 veces |
| Los comentarios van en `{/* */}`, no en `<!-- -->` | Los de HTML se envían al navegador y contienen notas internas |
| `main.js` se enlaza con `is:inline` | Para que Astro no lo empaquete ni le cambie el nombre |
| El sitemap se genera en `src/pages/sitemap.xml.ts` | Conserva la dirección `/sitemap.xml` exacta. El plugin oficial la cambiaría a `/sitemap-index.xml` |
| Las landings NO llevan menú | Decisión de conversión: cada enlace es una puerta de salida |

---

## 3. Dominio oficial

**`hotelesatheron.com`, sin `www`.** Una sola versión canónica.

```
hotelesatheron.com          200, servido por Vercel
www.hotelesatheron.com      308 permanente → hotelesatheron.com
canónica de la portada      https://hotelesatheron.com/
sitemap en robots.txt       https://hotelesatheron.com/sitemap.xml
astro.config.mjs            site: 'https://hotelesatheron.com'
```

Ya está todo coherente. **No hay nada que cambiar aquí.**

> **La razón de conservar `hotelesatheron.com` es estratégica, no técnica:**
> Atheron Suite no se proyecta solo para Zipaquirá. La visión es operar en
> varias ciudades de Colombia y después fuera. Un dominio atado a una ciudad
> habría limitado eso.

**No cambiar el dominio. No migrar a `www`. No tocar DNS.**

---

## 4. Rama de trabajo

**`astro`.** Todo el trabajo está ahí. `main` conserva el sitio antiguo intacto.

Commits de la sesión, en orden:

```
9afa500  Etapa 1: esqueleto de Astro, layout base y Home migrada
ce20f60  Etapa 2: componentes compartidos y 8 paginas migradas
130d952  Merge branch 'main' into astro
066d670  Etapa 3: las fichas pasan a coleccion de contenido
1fd3421  Etapa 6a: panel de edicion en /admin con Sveltia CMS
1ebcb6f  Corrige una direccion truncada por YAML y anade proteccion
eb9359d  Fotos editables desde el panel, y arregla el guardado del panel
09b01d3  Limpieza previa a produccion: texto, fotos y documentacion
c0d4c92  Conecta el panel al intermediario de Cloudflare
400d938  Update Hospedaje "la-magia-de-zipaquira"   ← escrito por el CMS
```

El último lo escribió **el panel**, no una persona. Es la prueba de que el
flujo completo funciona.

---

## 5. Qué está funcionando

| Comprobación | Estado |
|---|---|
| 14 páginas construyen y responden 200 | ✅ |
| Las direcciones no cambiaron: 16 de 18 archivos en la ruta idéntica | ✅ |
| Los 2 restantes son plantillas retiradas, con redirección 308 | ✅ |
| Canónicas correctas en las 14 | ✅ |
| `noindex` solo en las 6 fichas en obra | ✅ |
| `noindex` y sitemap nunca coinciden | ✅ |
| 10 bloques JSON-LD, los 10 válidos | ✅ |
| Cero enlaces internos rotos | ✅ |
| Cero comentarios HTML enviados al visitante | ✅ |
| Códigos de WhatsApp por URL, y persisten al navegar | ✅ |
| Panel online con inicio de sesión por GitHub | ✅ |
| Lista blanca del portero: acepta el dominio, rechaza otros | ✅ |
| Flujo completo panel → GitHub → Vercel → sitio | ✅ demostrado |

El HTML entregado al visitante bajó entre un **28% y un 37%**.

---

## 6. CMS online

**Dirección final:** `hotelesatheron.com/admin` *(tras el merge)*
**Dirección de pruebas:** `atheron-suite-git-astro-marlon-atheron.vercel.app/admin`
*(esta última es estable, no cambia con cada despliegue)*

**Modo local**, para desarrollo: `npm run dev` y abrir
`http://localhost:4321/admin/index.html`. **Solo Chrome, Edge o Brave** — usa
la API de acceso a archivos que Firefox y Safari no implementan.

### Qué se puede editar

Los **49 campos** de los 7 hospedajes: textos, precios, servicios, zona,
distancias, habitaciones, fotos con su texto alternativo, y los datos que lee
Google. Los nombres del panel coinciden **uno a uno** con los del esquema;
hay un script que lo comprueba.

### Los dos interruptores importantes

| Campo | Efecto |
|---|---|
| **`publicado`** | Apagado = `noindex` **y** fuera del sitemap. Encendido = las dos contrarias. Cierra los pendientes 47 y 48, que antes eran dos acciones manuales fáciles de desincronizar |
| **`direccionPublica`** | Apagado = oculta la calle en pantalla **y** en el JSON-LD, y muestra el aviso de que la dirección se entrega al confirmar. **Debe ir apagado en los hospedajes aliados** |

### Modo de publicación

Simple: guardar escribe en la rama y el sitio se republica. **No** está activado
el modo revisión (`publish_mode: editorial_workflow`), que queda comentado en
`public/admin/config.yml` a una línea de distancia.

---

## 7. Cloudflare Worker

```
Nombre        sveltia-cms-auth
Dirección     https://sveltia-cms-auth.comercialgsc001.workers.dev
Cuenta        Comercialgsc001@gmail.com
Repositorio   marlonproyectos07-beep/sveltia-cms-auth (privado)
Plan          Gratuito — 100.000 peticiones/día
```

Su única función es guardar las credenciales de la aplicación OAuth, que no
pueden vivir en una página web. **No almacena el permiso**: lo recibe de GitHub
y lo devuelve al navegador.

### Variables configuradas

| Nombre | Tipo | Contenido |
|---|---|---|
| `GITHUB_CLIENT_ID` | Text | El identificador público de la app OAuth |
| `GITHUB_CLIENT_SECRET` | **Secret** | La clave. Cifrada, no legible |
| `ALLOWED_DOMAINS` | Text | `hotelesatheron.com,*.hotelesatheron.com,atheron-suite-git-astro-marlon-atheron.vercel.app` |

`ALLOWED_DOMAINS` es la defensa principal: el portero **solo responde desde
esas tres direcciones**. Verificado — una petición desde un dominio inventado
se rechaza.

> **Al fusionar**, la tercera entrada (la de Vercel) puede retirarse. No es
> urgente: solo sirve para pruebas y no da acceso a nada por sí sola.

---

## 8. OAuth de GitHub

```
Nombre             Atheron Suite CMS
Propietario        marlonproyectos07-beep
URI de redirección https://sveltia-cms-auth.comercialgsc001.workers.dev/callback
Permisos (scope)   repo, user
Caducidad tokens   DESACTIVADA (a propósito)
```

### Qué alcanza ese permiso — dicho sin adornos

`repo` da **escritura sobre todos los repositorios** de la cuenta, no solo
sobre `atheron-suite`. Es más de lo necesario y es el punto débil real de esta
arquitectura. Lo impone el portero, no es una elección del proyecto.

Lo que lo compensa:

- El permiso **vive solo en el navegador** del administrador
- El panel **solo conoce `atheron-suite`**
- El portero tiene **lista blanca de dominios**

**Repositorios alcanzables hoy:** `atheron-suite` y `sveltia-cms-auth`.

### Cómo revocar el acceso al instante

GitHub → Settings → Applications → `Atheron Suite CMS` →
**Revocar todos los tokens de usuario**.

### Por qué la caducidad está desactivada

Con ella activa, GitHub caduca la sesión cada 8 horas y espera que la
aplicación pida una renovación automática. **El portero no hace esa
renovación.** Con la casilla marcada, el panel echaría fuera al administrador
cada mañana con un error que no explica nada.

---

## 9. Vercel

```
Proyecto     atheron-suite
Equipo       marlon-atheron
Framework    Astro, detectado automáticamente
Producción   hotelesatheron.com  (rama main — sitio ANTIGUO)
Pruebas      atheron-suite-git-astro-marlon-atheron.vercel.app  (rama astro)
Protección   Vercel Authentication ACTIVADA en las vistas previas
```

`vercel.json` contiene `cleanUrls`, `trailingSlash: false` y las dos
redirecciones permanentes de las plantillas retiradas.

**Antes de cada publicación se ejecuta solo `scripts/comprueba-contenido.mjs`.**
Si encuentra un problema, **detiene la publicación y el sitio anterior sigue en
pie.** Verificado funcionando dentro de Vercel.

---

## 10. Seguridad

### Lo que está bien

- El secreto de cliente está **cifrado** en Cloudflare
- El portero **no guarda** ningún permiso
- **Lista blanca de dominios** activa y verificada
- `/admin` lleva `noindex` y está bloqueado en `robots.txt`
- El contenido **no puede inyectar HTML**: `datosContacto` es texto plano por diseño

### Lo que queda abierto

| Asunto | Estado |
|---|---|
| El permiso `repo` alcanza todos los repositorios | Aceptado, mitigado por la lista blanca |
| Verificación en dos pasos en GitHub | ✅ **Activada el 21 de agosto de 2026**, con aplicación de autenticación (TOTP). Los códigos de recuperación quedan en poder del usuario |
| Un secreto de cliente pasó por el chat | ✅ **Rotado el 21 de agosto de 2026.** Secreto nuevo generado en GitHub, pegado en Cloudflare sin pasar por el chat, y verificado con un inicio de sesión completo. El antiguo fue eliminado: ya no existe |
| **La cuenta de GitHub no tiene contraseña propia** | **Descubierto el 21 de agosto de 2026.** Se entra a `marlonproyectos07-beep` únicamente a través de la cuenta de Google. Ver la nota de abajo |

> **La puerta real del proyecto es la cuenta de Google, no GitHub.**
> `marlonproyectos07-beep` figura con `Contraseña: No configurado` y un único
> método de entrada: *Google, 1 cuenta conectada*. Quien controle ese correo
> controla el repositorio del sitio y la aplicación OAuth del panel. El 2FA de
> GitHub ya está activo y protege las operaciones sensibles dentro de GitHub,
> pero **queda por verificar la verificación en dos pasos de la cuenta de
> Google**, que es el eslabón que sostiene todo lo demás. Lo mismo aplica a la
> cuenta de Cloudflare `Comercialgsc001@gmail.com`, que guarda el secreto del
> portero: su 2FA tampoco está confirmado.

### Regla permanente

**Ninguna clave, secreto, token o contraseña se pega jamás en el chat.**
Se copian de donde se generan y se pegan donde van. Claude nunca los necesita:
puede verificar que funcionan desde fuera, sin verlos.

---

## 11. Pruebas completadas

| Prueba | Resultado |
|---|---|
| Build local de las 14 páginas | ✅ |
| Comparación de direcciones contra producción | ✅ 16/18 idénticas, 2 con 308 |
| Validación de los 10 JSON-LD | ✅ |
| Enlaces internos | ✅ 0 rotos de 14 destinos |
| Códigos de WhatsApp con `?codigo=` | ✅ persisten al navegar |
| Despliegue en Vercel desde la rama | ✅ Astro detectado solo |
| Auditoría contra el sitio desplegado | ✅ — encontró un fallo real, ver §12 |
| Panel en modo local: editar y guardar | ✅ por el usuario |
| Panel en modo local: subir foto | ✅ por el usuario |
| Portero: acepta dominio autorizado | ✅ 302 a GitHub |
| Portero: rechaza dominio no autorizado | ✅ |
| **Flujo completo online** | ✅ **panel → commit → build → sitio** |

La última se demostró con el commit `400d938`, escrito por el propio panel.

---

## 12. Problemas encontrados y corregidos

Estos son los que costaron tiempo. **Están resueltos; se documentan para que no
se repitan.**

### Dirección truncada por YAML

`zona: Cra. 9 #10-32, Zipaquira` se leía como `"Cra. 9"`. En YAML, una
almohadilla precedida de espacio empieza un comentario. **No fallaba nada**: la
dirección quedaba a medias en la página y en el `streetAddress` que lee Google.

Solo se detectó comparando el texto publicado contra el sitio antiguo.

**Corregido** con comillas, y **protegido**: `scripts/comprueba-contenido.mjs`
detiene la publicación y señala la línea exacta.

### Guardar desde el panel rompía la publicación

Al dejar campos vacíos, el panel escribe `latitud: null` y `actualizado: ''`.
El `.optional()` de Zod significa "el campo puede no estar", **no** "puede
estar vacío". Editar un texto y guardar tumbaba el build.

**Corregido**: los nueve campos opcionales tratan `null` y cadena vacía como
"no hay dato". Ver `textoOpcionalPanel` y compañía en `src/content.config.ts`.

### Dos plantillas publicadas con canónica rota

`plantilla-hospedaje` y `plantilla-articulo` estaban **vivas, sin `noindex`**,
con la canónica apuntando a `/blog/[[ARCHIVO]]`, y **enlazadas** desde la
portada y la guía de Zipaquirá.

**Corregido**: retiradas del sitio, con redirección 308 en `vercel.json`.

### Fotos de 1,1 MB

La primera foto subida desde el panel era una captura de 1.095 KB.
Multiplicada por 5 de galería y 7 hospedajes: 38 MB.

**Corregido**: `npm run foto` (1.095 KB → 102 KB, −91%), avisos en el panel, y
la publicación se detiene por encima de 1 MB.

### El botón "Desplegar" de Cloudflare no respondía

No estaba roto: el formulario tenía una barra de desplazamiento **interna** y
el campo obligatorio `Deploy command` quedaba fuera de la vista.

### El worker desplegado sin dirección pública

Cloudflare crea el worker con la dirección `.workers.dev` **desactivada**.
Hay que encenderla en la pestaña `Domains`. Decía *"No URLs enabled"*.

---

## 13. Pendientes

La lista completa está en **[pendientes.md](pendientes.md)**. Lo esencial:

### Fuera del código, y es lo que más mueve la aguja

**El pendiente 28: el perfil de Google sitúa el negocio en Cogua, no en
Zipaquirá.** Mientras eso siga así, nada de lo construido aparece en las
búsquedas del municipio. **No depende del sitio web.** Procedimiento paso a
paso en [corregir-perfil-google.md](corregir-perfil-google.md).

Lo que hay que saber: **está mal el pin del mapa, no la dirección.** Tocar el
texto de la dirección puede disparar una reverificación.

### Antes de producción

Ver §15.

### Después de producción

| # | Qué |
|---|---|
| 55 | Optimización automática de imágenes al subirlas: compresión y conversión a WebP/AVIF |
| 56 | Migrar los artículos del blog a colección, para editarlos desde el panel |
| 57 | Ajustes generales editables: WhatsApp, correo, textos del pie |
| 58 | Colores y tipografías editables desde el panel |
| 59 | Decidir si las fichas en obra deben perder el enlace "Ver ficha" |
| 62 | Vercel: el plan gratuito es para uso **no comercial** |

---

## 14. Qué NO debe tocar una sesión nueva

| ❌ No hacer | Por qué |
|---|---|
| **Merge a `main` sin seguir §16** | Hay un paso previo que, si se olvida, rompe el panel en silencio |
| **Cambiar el dominio o migrar a `www`** | Decisión tomada y ya coherente en todo el sitio |
| **Tocar DNS o Cloudflare** más allá de las variables | No hace falta para nada |
| **Cambiar `build.format`** en `astro.config.mjs` | Mueve las 14 direcciones del sitio |
| **Sustituir el sitemap propio por `@astrojs/sitemap`** | Cambiaría `/sitemap.xml` a `/sitemap-index.xml` |
| **Pedir o aceptar secretos por el chat** | Ya causó una rotación de credenciales |
| **Añadir menú a las landings** | Decisión de conversión deliberada |
| **Publicar la dirección de un hospedaje aliado** | `direccionPublica: false` no es cosmético |
| **Quitar el `noindex` de una ficha vacía** | Contenido delgado; castiga a todo el dominio |
| **Integrar el logo, rediseñar, o auditar CRO** | Explícitamente aplazado por el usuario |

---

## 15. Siguiente paso exacto

**Lo primero de la próxima sesión es el merge a `main`.** Antes hay que cerrar
esta lista corta:

| # | Tarea | Quién | Estado |
|---|---|---|---|
| 1 | **Cambiar `public/admin/config.yml` línea 45: `branch: astro` → `branch: main`** | Claude | ⬜ Pendiente |
| 2 | Rotar el Client Secret | Usuario | ✅ **Hecho el 21/08/2026** — rotado, actualizado en Cloudflare, probado de punta a punta y el antiguo eliminado |
| 3 | Quitar el texto de prueba `ZIPAQUIRA` del nombre del hospedaje 01 | Claude, en el repositorio | ✅ **Hecho el 21/08/2026** |
| 4 | Activar verificación en dos pasos en GitHub | Usuario | ✅ **Hecho el 21/08/2026** — aplicación de autenticación (TOTP) |
| 5 | Decidir sobre el plan de Vercel | Usuario | ⬜ Pendiente |

### Sobre el punto 1 — el más importante

```yaml
# public/admin/config.yml, línea 45
  branch: astro     ← AHORA
  branch: main      ← DESPUÉS DEL MERGE
```

**Si se olvida, el panel seguirá guardando en `astro`, que ya no se publica.
El administrador verá "guardado" y el sitio no cambiará nunca. Sin ningún
error visible.** Es el peor tipo de fallo posible en este montaje.

El archivo lleva un comentario en mayúsculas justo encima de esa línea.

---

## 16. Procedimiento seguro para hacer merge a `main`

> **Nada de esto es urgente. Se hace con la cabeza descansada.**

```bash
# 1. Cerrar la lista de §15. El punto 1 es obligatorio.

# 2. Traer lo que el panel haya escrito mientras tanto
git checkout astro
git pull origin astro

# 3. Comprobar que construye
npm run build          # debe decir "Contenido comprobado" y "14 page(s) built"

# 4. Merge
git checkout main
git merge astro
git push origin main

# 5. Vercel republica solo. Esperar 1 minuto.
```

### Verificar inmediatamente después

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hotelesatheron.com/
curl -s https://hotelesatheron.com/ | grep -o 'rel="canonical" href="[^"]*"'
curl -s https://hotelesatheron.com/sitemap.xml | grep -c '<loc>'      # debe dar 8
curl -s -o /dev/null -w '%{http_code}\n' https://hotelesatheron.com/hospedajes/plantilla-hospedaje   # debe dar 308
```

Y en el navegador: entrar en `hotelesatheron.com/admin`, iniciar sesión,
**guardar un cambio pequeño y confirmar que aparece en el sitio real.**

### Después del merge

- Enviar el sitemap a Google Search Console (pendiente 35)
- Retirar la dirección de Vercel de `ALLOWED_DOMAINS` (opcional)

---

## 17. Procedimiento para volver atrás

Tres redes, de la más rápida a la más profunda.

### 1. Vercel — un clic, medio minuto

Vercel → proyecto `atheron-suite` → **Deployments** → elegir el despliegue
anterior → **Promote to Production**.

Es lo primero que hay que intentar. **No requiere saber nada técnico** y
devuelve el sitio al estado exacto anterior.

### 2. Git — el historial completo

```bash
git log --oneline           # ver el historial
git revert <commit>         # deshacer un cambio concreto
git push origin main
```

Cada guardado del panel es un commit con fecha y detalle de qué cambió.

### 3. Deshacer el merge entero

```bash
git checkout main
git reset --hard 1524122    # último commit de main antes del merge
git push --force origin main
```

> ⚠️ **`--force` descarta trabajo.** Solo si el merge salió mal de verdad y las
> dos opciones anteriores no bastan. Y hay que avisar de que el panel podría
> haber escrito commits en `main` que se perderían.

### La red que actúa sola

**Si un cambio rompe el sitio, no llega a publicarse.**
`scripts/comprueba-contenido.mjs` detiene la construcción y **el sitio anterior
sigue en pie**. Un error grave no tumba la web: solo impide que el cambio
aparezca.

---

## 18. Cómo verificar el estado sin preguntar a nadie

```bash
git branch --show-current      # debe decir: astro
git status --short             # debe estar limpio
npm run build                  # 14 páginas, sin errores
npm run comprueba              # revisa contenido y fotos
grep -n "branch:" public/admin/config.yml    # línea 45
```

Desde fuera, sin credenciales:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hotelesatheron.com/
curl -s -o /dev/null -w '%{http_code}\n' https://sveltia-cms-auth.comercialgsc001.workers.dev/auth
```

---

## 19. Notas del entorno (para una sesión nueva de Claude)

Dos trampas que costaron varios intentos en la sesión original:

**1. Node está instalado pero no en el PATH de las terminales nuevas.**
Se instaló con `winget` durante la sesión, en `C:\Program Files\nodejs`. Las
terminales que abre el sistema **no lo encuentran**. Hay que refrescar el PATH
al principio de cada comando:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
npm run build
```

**2. `.claude/launch.json` está en `.gitignore`.** Lleva la ruta absoluta de
`node.exe` de esta máquina, así que no es portable. Si hace falta levantar el
servidor de desarrollo desde el navegador integrado, hay que recrearlo:

```json
{
  "version": "0.0.1",
  "configurations": [{
    "name": "atheron-dev",
    "runtimeExecutable": "C:/Program Files/nodejs/node.exe",
    "runtimeArgs": ["node_modules/astro/bin/astro.mjs", "dev"],
    "port": 4321
  }]
}
```

**3. Los heredocs largos fallan** en el shell de este entorno. Para archivos
grandes, usar la herramienta de escritura directa en vez de `cat > archivo <<EOF`.

**4. Se puede verificar mucho sin credenciales.** La API pública de GitHub da el
estado de los despliegues de Vercel y las direcciones de vista previa, porque el
repositorio es público:

```bash
curl -s "https://api.github.com/repos/marlonproyectos07-beep/atheron-suite/deployments?per_page=3"
curl -s "https://api.github.com/repos/marlonproyectos07-beep/atheron-suite/commits/<sha>/status"
```

Las vistas previas de Vercel están protegidas: devuelven 302 a su pantalla de
acceso. **No se pueden leer sin la sesión del usuario**, y no hay que pedirle
que la desactive salvo que haga falta una auditoría automática completa.

---

## 20. Documentos del proyecto

| Documento | Para qué |
|---|---|
| [../README.md](../README.md) | Estructura, comandos, convenciones |
| [panel-de-edicion.md](panel-de-edicion.md) | **Cómo administrar el sitio sin tocar código** |
| [pendientes.md](pendientes.md) | Lista maestra numerada |
| [corregir-perfil-google.md](corregir-perfil-google.md) | El pendiente 28, el de máxima prioridad |
| [estrategia-seo.md](estrategia-seo.md) | Plan de posicionamiento |
| [propuesta-multiidioma-y-video.md](propuesta-multiidioma-y-video.md) | **Decisiones estratégicas del 21/08/2026**: idiomas ES/EN/ZH, video por hospedaje, marca. Análisis, sin implementar |
| [dominio-y-arquitectura.md](dominio-y-arquitectura.md) | Por qué este dominio, e integración futura con Odoo |
| [perfiles-y-flujo-de-trabajo.md](perfiles-y-flujo-de-trabajo.md) | Diagnóstico de perfiles y consistencia de nombre |

---

## 21. Actualización del 21 de agosto de 2026

Sesión posterior al traspaso. **Sigue sin fusionarse a `main`.**

### 21.1 Seguridad — cerrada

Ver §10 y §15. Resumen: Client Secret rotado y el antiguo eliminado, verificación
en dos pasos activada con aplicación de autenticación, códigos de recuperación en
poder del usuario. Se descubrió además que la cuenta de GitHub **no tiene
contraseña propia** y se entra por Google: la nota está en §10.

### 21.2 Limpieza de textos internos visibles

Se encontraron **116 fragmentos marcados en amarillo** repartidos por las 8
páginas indexadas, y varios textos internos que llegaban al visitante. **Ya
estaban publicados en producción**: no los introdujo la migración.

Eliminados (14 textos):

| Texto | Dónde |
|---|---|
| *"Nota tecnica: este formulario todavia no envia datos a ningun servidor"* | 4 páginas |
| *"PENDIENTE: completar esta tabla… Nunca los inventes"* y 3 bloques más | Guía de Zipaquirá |
| *"PENDIENTE: definir la promesa diferencial definitiva de la marca"* | Portada |
| *"PENDIENTE 8: centrar el mapa en las coordenadas exactas"* | Ficha La Magia |
| *"Faltan los datos exactos… Los cargamos en cuanto me los pases"* | Ficha La Magia |
| *"Mapa provisional: falta ubicar cada hospedaje"* | Landing hospedaje |
| *"PENDIENTE: confirmar capacidad y si hay espacio cubierto"* | Landing grupos |
| *"(pendiente 41)"* — referencia interna de ticket | Guía de Zipaquirá |

De paso: `mapaNota` pasó a ser **opcional** en el esquema y en el panel. Antes era
obligatoria y no se podía vaciar desde el CMS.

### 21.3 Formularios de contacto — desactivados a propósito

**El problema:** los cuatro formularios respondían *"Gracias, recibimos tu
mensaje"* y **no enviaban nada a ningún servidor**. Un cliente se iba creyendo que
había escrito, y nunca llegaba nada.

**La solución, reversible:** un interruptor en `src/data/ajustes.ts`.

```ts
export const formularioContactoActivo = false;
```

- El marcado del formulario **no se ha borrado**: sigue en cada página dentro de
  la rama `true` de la condición.
- En su lugar aparece `src/components/ContactoWhatsApp.astro`, con el mensaje ya
  escrito, igual que el resto de botones del sitio.
- Para volver a encenderlo: `true` en esa línea. **Y antes**, corregir el mensaje
  de confirmación de `public/assets/js/main.js`, que sigue diciendo que el mensaje
  fue recibido.

Cierra parcialmente el pendiente 50, que queda como "construir el formulario real
conectado al flujo comercial".

### 21.4 Mínimo publicable de un hospedaje

**La casilla `publicado` es la puerta de salida.** Al encenderla, la ficha aparece
en portada, listado, sitemap y Google. Sin control, se puede encender una ficha
que aún dice "Hospedaje 02", "$ ---" y "N huéspedes".

Una ficha cumple el mínimo publicable cuando tiene:

| # | Requisito |
|---|---|
| 1 | **Nombre real** — no vale `Hospedaje 02` |
| 2 | **Precio real** — ni `$ ---` ni marcado como pendiente |
| 3 | **Al menos una habitación con datos reales** (una con `pendiente: false`) |
| 4 | **Foto de tarjeta** — es la que se ve en portada y listado |
| 5 | **Presentación escrita** — no el texto de ejemplo |
| 6 | **Sector real en el listado** — no `Barrio / sector` |
| 7 | **Descripción para buscadores** de 80 caracteres o más |

Verificado automáticamente en `scripts/comprueba-contenido.mjs`.

> **Hoy solo AVISA, todavía no detiene la publicación.** La Magia de Zipaquirá aún
> no cumple los puntos 2 y 3. Cuando el aviso salga vacío, poner
> `MINIMO_BLOQUEA = true` en ese script y a partir de ahí ninguna ficha incompleta
> podrá publicarse por descuido.

### 21.5 Los hospedajes 02–07, fuera de las superficies públicas

Con `publicado: false`, una ficha ahora queda fuera de:

| Superficie | Cómo |
|---|---|
| Portada | `.filter((f) => f.data.publicado)` en `src/pages/index.astro` |
| Listado público | mismo filtro en `src/pages/hospedajes/index.astro` |
| Sitemap | ya filtraba desde antes |
| Enlaces internos | consecuencia de los dos filtros: no queda ningún enlace |
| Indexación | `noindex`, como ya ocurría |

**Se siguen editando con normalidad en el panel**, y sus páginas se siguen
construyendo.

> **Por qué se siguen construyendo y no se retiran del todo:**
> `hotelesatheron.com/hospedajes/hospedaje-02` y `-03` **responden 200 hoy en
> producción**. Dejar de generarlas convertiría dos direcciones vivas en 404 al
> fusionar. Con `noindex` y sin ningún enlace que apunte a ellas, quedan fuera del
> alcance práctico de un visitante. Si más adelante se quieren retirar, hay que
> añadir su redirección 308 en `vercel.json`, como ya se hizo con las plantillas.

### 21.6 Textos que quedaron desmentidos al ocultar seis fichas

Corregidos, porque eran mecánicos:

- Botón de la portada: *"Ver los 7 hospedajes"* → *"Ver los hospedajes"*
- `<h1>` del listado: *"Nuestros 7 hospedajes"* → *"Nuestros hospedajes"*
- Se retiró el texto de la portada *"Los nombres y datos que ves ahora son
  provisionales"*, que ya no es cierto: la única ficha visible es real.

**Sin corregir, a la espera de decisión editorial** — siguen diciendo 7 mientras
se ve 1:

| Dónde | Texto |
|---|---|
| Portada, título de sección | *"Siete formas de quedarse en Zipaquira"* |
| Portada, cierre | *"…cuál de los siete hospedajes"* |
| Listado, `descripcion` | *"Conoce los 7 hospedajes de Atheron Suite…"* |
| Listado, `ogTitulo` | *"Nuestros 7 hospedajes en Zipaquira…"* |
| Listado, `ogDescripcion` | *"Siete hospedajes seleccionados…"* |
| Listado, `avisoBorrador` | *"…Faltan los datos reales de los 7 hospedajes"* |

No se tocaron porque son afirmaciones sobre el negocio —que sí tiene siete
hospedajes— y no sobre lo que se muestra. La decisión es del usuario.

### 21.7 Decisiones estratégicas registradas

Multiidioma (ES / EN / ZH), video por hospedaje y trabajo de marca. **Aprobadas en
concepto, sin implementar.** Análisis completo en
[propuesta-multiidioma-y-video.md](propuesta-multiidioma-y-video.md).

El logo **lo entrega el usuario**. No se diseña ni se modifica.


### 21.8 Segunda pasada: se ocultan todos los bloques sin dato real

Decisión del usuario: **ningún placeholder técnico visible en una página
comercial. Si el dato no existe, se oculta el bloque entero.** Nada se inventa.

**Marcas amarillas visibles: 116 → 13.** Las 13 que quedan son los enlaces a
artículos futuros de `/blog` y de la guía, que se conservan a propósito.

| Página | Qué se hizo |
|---|---|
| **Portada** | Teléfono real visible. Correo oculto. Tarjeta de la tercera experiencia oculta. Tres filas de distancias sin minutos ocultas. Precio oculto mientras esté pendiente |
| **Pie** | Correo oculto, teléfono real visible, enlace de política de privacidad oculto hasta que exista |
| **Listado** | Metadatos y `<h1>` sin cifra. Precio oculto mientras esté pendiente |
| **Landing hospedaje** | Sección de habitaciones de ejemplo **eliminada** (y con ella el botón "Ver habitaciones" del hero, que quedaba huérfano). Tres preguntas frecuentes sin respuesta eliminadas. Tarjeta "Estancias flexibles" sin política eliminada. Lista de distancias sin datos eliminada. Tercera experiencia eliminada. Paréntesis internos retirados de cocina y parqueadero; "calefacción (confirmar)" eliminado |
| **Guía de Zipaquirá** | Tabla de transporte eliminada: sus seis celdas de duración y costo decían *"verificar"*. Se conserva el párrafo introductorio, que sí es cierto. `Actualizado: fecha al publicar` eliminado |
| **Ficha de hospedaje** | Habitaciones, galería y experiencias se muestran **solo si tienen datos reales**. El menú de celular filtra sus anclas para no dejar enlaces muertos |

**El teléfono** `+57 318 898 3167` pasa a ser visible en portada y pie. No es un
dato nuevo: es el número que `public/assets/js/main.js` ya usaba en todos los
botones de WhatsApp del sitio.

**Redacción sin cifras.** Los textos que decían "7 hospedajes" o "siete" se
reescribieron en neutro, no a "1": el negocio sí administra varios, pero no se
debe afirmar una cantidad que no se está mostrando.

**Banda de "Versión de trabajo" de La Magia: retirada.** Tras ocultar los bloques
sin dato, la ficha no muestra ni un solo placeholder, que era la condición fijada
por el usuario. La del listado se mantiene. Es un campo del panel: se restaura
escribiendo en él.

> **Lo que sigue faltando no ha desaparecido, solo dejó de mostrarse:** precio,
> habitaciones, galería y tercera experiencia de La Magia. El aviso del mínimo
> publicable en `comprueba-contenido.mjs` los sigue señalando en cada build.

### 21.9 Estado al cerrar

- Build: **14 páginas**, comprobación de contenido en verde, código de salida 0
- Único hospedaje público: **La Magia de Zipaquirá**, sin placeholders visibles
- Marcas amarillas visibles: **13**, todas enlaces a artículos futuros
- Sitemap: **8 direcciones**, sin cambios
- Sin commit en `main`. Sin publicar. Sin tocar DNS ni dominio
- `public/admin/config.yml` sigue en `branch: astro`. **Es el paso previo obligatorio al merge**
