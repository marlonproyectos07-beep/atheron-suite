# atheron-media-pipeline

Sistema de producción audiovisual de Atheron Suite sobre **Higgsfield AI**.
Mismo repositorio que la web, carpeta independiente: **no interviene en el sitio
Astro ni en el despliegue de Vercel** (los scripts de `npm run comprueba` y
`npm run build` solo recorren `src/content` y `public/`).

## Para qué sirve

Producir y conservar imágenes y vídeo comercial para los 7 hospedajes, con dos
agentes que se relevan sin repetir trabajo ni gastar créditos dos veces. Ver
[AGENTS.md](AGENTS.md).

## Estructura

```
atheron-media-pipeline/
├── README.md                     este archivo
├── AGENTS.md                     reparto Agente A / Agente B
├── projects/     <hospedaje>-<pieza>/  una carpeta por producción
├── inputs/       material original que entra (fotos, vídeo de cámara)
├── outputs/      resultados descargados de Higgsfield  (NO se versionan)
├── prompts/      prompts exactos usados, uno por archivo
├── handoffs/     HANDOFF-<proyecto>-<fecha>.md  estado real de cada producción
└── templates/    HANDOFF_TEMPLATE.md
```

`outputs/` está excluido de Git (ver `.gitignore` de esta carpeta): un vídeo de
Higgsfield pesa decenas de MB y **una foto de 2,4 MB ya tumbó un despliegue**.
Lo que se conserva en Git es el registro —prompts, decisiones, handoffs—, no los
binarios.

### Material original que ya existe

No se ha movido nada. El material fotográfico original sigue donde estaba:

- `docs/media-originales/hotel-colonial-confort/` (raíz del repo)

Cuando una producción lo use, se referencia por ruta en su HANDOFF. **No se
copia ni se duplica.**

## Requisitos

| Pieza | Estado en este contenedor | Necesario en el PC de Marlon |
|---|---|---|
| Node.js ≥ 14 | v22.22.2 | sí |
| `@higgsfield/cli` | 1.1.24 instalado | sí |
| Skills oficiales `higgsfield-ai/skills` | 8 instaladas | sí |
| Sesión Higgsfield (OAuth) | **no, imposible aquí** | sí |
| FFmpeg | **no instalado** | sí, para cortar/unir/comprobar |

### Por qué la sesión de Higgsfield no puede abrirse desde la nube

`higgsfield auth login` usa **OAuth 2.0 PKCE con callback en loopback**
(`--port` es su única opción). Abre el navegador de la máquina donde corre y
espera la respuesta en `localhost` de esa misma máquina. Esta sesión de Claude
Code corre en un contenedor Linux remoto, sin navegador y sin acceso al
navegador de Marlon; y el contenedor se recicla, así que el token se perdería.
**El login se hace una vez en el PC de Marlon y queda guardado localmente.**

El CLI no acepta clave de API por variable de entorno (las que expone son
`HIGGSFIELD_CREDENTIALS_PATH`, `HIGGSFIELD_CONFIG_PATH`, `HIGGSFIELD_WORKSPACE_ID`
y ajustes de OAuth; ninguna es un `HF_API_KEY`). Existe un paquete oficial
hermano, `@higgsfield/cloud-cli`, descrito como *"CLI para agentes, con
autenticación por clave de API"*: es la única vía para que un agente en la nube
genere sin navegador. **No se ha instalado ni configurado: requiere emitir una
clave y eso lo decide Marlon.**

## Instalación en el PC de Marlon (Windows, PowerShell)

```powershell
npm install -g @higgsfield/cli
higgsfield --version
npx skills add higgsfield-ai/skills
higgsfield auth login      # abre el navegador; autorizar ahí
higgsfield workspace set <workspace_id>
higgsfield account          # confirma cuenta y créditos
```

Node está en `C:\Program Files\nodejs` y no siempre en el PATH; `npx` hay que
lanzarlo desde PowerShell, no desde un shell tipo Unix.

## Control de créditos — obligatorio antes de generar

El CLI estima coste **sin generar**. Nunca se lanza una generación sin haber
pasado por aquí y sin aprobación de Marlon:

```bash
higgsfield generate cost <modelo> --prompt "..." --duration 5 --resolution 720p
higgsfield generate cost workflow reframe --duration 7.1 --resolution 1080p
higgsfield account            # créditos disponibles
```

Se le presenta a Marlon: **modelo, duración, formato, resolución, número de
variaciones y coste estimado.** Una sola variación por defecto.

## Comandos de trabajo

```bash
higgsfield model list --video            # catálogo de vídeo
higgsfield model get seedance_2_5        # parámetros exactos de un modelo
higgsfield workflow list                 # reframe, draw_to_video
higgsfield workflow get reframe --json   # aspectos y resoluciones admitidos
higgsfield upload <archivo>              # sube material original, devuelve id
higgsfield generate create <modelo> --prompt "..." --image <upload_id>
higgsfield generate workflow reframe --video ./x.mp4 --aspect-ratio 9:16 --wait
higgsfield generate wait <job_id>
higgsfield generate list                 # historial: evita repetir generaciones
```

`higgsfield generate list` es lo que impide que el Agente B pague dos veces por
lo mismo: antes de generar, se consulta.

## Reglas heredadas del proyecto que aplican aquí

- **Nada generado por IA se presenta como fotografía real.** Todo lo que salga
  de Higgsfield se marca como generado en el HANDOFF de su producción.
  (Excepción ya registrada y autorizada: las 7 imágenes de la Suite 301.)
- **No inventar datos.** Un vídeo no enseña precios, capacidades ni servicios
  que no estén confirmados.
- **Ninguna clave ni token se pega en el chat ni entra en el repositorio.**
- Toda foto que acabe en la web pasa por `npm run foto` antes de entrar.
- Rendimiento mínimo 95/100 en las cuatro categorías: si una pieza entra en la
  web, hay que **volver a medir** después.
