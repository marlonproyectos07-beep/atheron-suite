# Dominio y arquitectura futura

> 18 de agosto de 2026.

---

## 1. Dónde está el dominio `hotelesatheron.com`

Lo rastreé por WHOIS y DNS. Estos son los datos reales:

| Dato | Valor |
|---|---|
| **Registrador** | **Namecheap** |
| Fecha de registro | 23 de marzo de 2026 |
| **Fecha de expiración** | **23 de marzo de 2027** |
| DNS | Cloudflare (`lee.ns.cloudflare.com`, `sloan.ns.cloudflare.com`) |
| Estado | `clientTransferProhibited` (bloqueo normal antirrobo) |
| Contenido actual | No sirve un sitio; responde 403 desde Cloudflare |

### Cómo recuperar el acceso

Tienes **dos** cuentas involucradas, no una:

1. **Namecheap** (`namecheap.com`) — es el dueño del dominio. Entra a *Forgot Password* y prueba con tus correos habituales. Ahí está la propiedad real.
2. **Cloudflare** (`cloudflare.com`) — es donde apuntan los DNS. Aquí se configura a dónde resuelve el dominio. Mismo procedimiento de recuperación.

Para conectar el dominio a Vercel necesitas **Cloudflare**, que es donde se cambian los registros. Namecheap lo necesitas para renovar y para no perder la propiedad.

### Urgente

**El dominio vence el 23 de marzo de 2027.** Si para entonces no tienes acceso a la cuenta de Namecheap, lo pierdes — y los dominios que expiran los capturan servicios automáticos en segundos. Recuperarlo después es caro o imposible.

Recupera el acceso ahora aunque no lo vayamos a conectar todavía, y activa la renovación automática.

---

## 2. ¿Es buen dominio?

**Sí, úsalo.** Y hay un motivo que cierra la discusión: **`atheronsuite.com` ya está registrado por otra persona** (Squarespace, desde agosto de 2025). Así que la alternativa "de marca" no está disponible.

### A favor

- **`.com`** es el dominio de mayor confianza y sirve internacionalmente. Coherente con la visión de crecer fuera de Zipaquirá.
- Contiene la marca: *atheron*
- Se lee y se dicta fácil
- Ya tiene cinco meses de antigüedad, y la antigüedad cuenta
- No está atado a una ciudad, que era el riesgo de algo como `hospedajeszipaquira.com`

### En contra — y conviene saberlo

1. **"Hoteles" no describe lo que mejor vendes.** Tu producto más rentable son casas completas para grupos y apartamentos con cocina. Quien busca *"casa para grupo en Zipaquirá"* no quiere un hotel — a veces quiere justo lo contrario. La palabra puede trabajar en contra del posicionamiento que acabamos de construir.

2. **La palabra clave en el dominio ya casi no aporta al posicionamiento.** Era importante hace diez años; hoy es un factor mínimo. Así que "hoteles" cuesta claridad de marca sin comprar casi nada de SEO.

3. **"Hoteles" es español.** Para la ambición internacional, limita.

### Conclusión

Úsalo igual. Un dominio imperfecto que acumula toda la autoridad vale mucho más que cambiar de dominio dentro de un año. **Lo peor que puedes hacer es dudar y repartir el esfuerzo entre varios.**

Trátalo como el **dominio corporativo paraguas**: `hotelesatheron.com` es la casa matriz, y "Atheron Suite" sigue siendo el nombre comercial.

---

## 3. El problema que sí es grave: cinco nombres

Este es el tercer documento donde aparece lo mismo, así que lo pongo junto:

| Dónde | Nombre |
|---|---|
| Nombre comercial | Atheron Suite |
| Perfil de Google | Atheronsas |
| Dominio | Hoteles Atheron |
| Booking / Trivago | Hospedaje la Magia de Zipaquirá |
| Instagram | atheron_suite |
| Sitio antiguo en Odoo | Hospedaje La Magia de Zipaquirá |

**Seis, contando el sitio de Odoo.**

Esto importa mucho más que la elección del dominio. Google reparte las señales entre entidades que no reconoce como la misma, y ninguna acumula suficiente peso.

La decisión ya está tomada — **Atheron Suite** — pero hay que propagarla a todas partes.

---

## 4. Sobre `atheron1.odoo.com`

Tu sitio anterior en Odoo sigue vivo e indexado con el título *"Hospedaje La Magia de Zipaquirá"*. Aparece en las búsquedas de "atheron suite".

**Estás compitiendo contigo mismo.** Dos sitios distintos, con la misma propiedad, disputándose los mismos resultados. Google tiene que elegir uno y reparte la autoridad entre los dos.

Cuando conectemos el dominio: ese sitio debe **redirigir** al nuevo (redirección 301, que traspasa la autoridad acumulada) o bajarse. No dejarlo ahí.

---

## 5. ¿Se puede integrar con Odoo más adelante sin romper nada?

**Sí. Y la forma en que lo construimos lo hace más fácil, no más difícil.**

### Por qué no hay riesgo

- **No hay dependencias.** Es HTML, CSS y JavaScript puros. No usamos ningún framework que haya que desmontar.
- **No hay base de datos** que migrar.
- **El JSON-LD que ya escribimos es prácticamente un modelo de datos.** Nombre, dirección, teléfono, comodidades, horarios de entrada y salida: eso mapea casi uno a uno con los campos de una propiedad en Odoo.
- **Lo valioso es portable.** El contenido, los textos, la estructura de conversión y el trabajo de SEO no dependen de la tecnología. Eso se conserva pase lo que pase.

### La recomendación importante

**No metas el sitio web dentro de Odoo. Conéctalos.**

Es la diferencia entre una arquitectura que aguanta y una que se estorba:

```
   VISITANTE
       │
       ▼
┌──────────────────┐        ┌──────────────────┐
│  SITIO PÚBLICO   │        │      ODOO        │
│  (Vercel)        │───────▶│  Reservas        │
│                  │        │  Facturación     │
│  Rápido          │        │  CRM             │
│  Posicionado     │        │  Operación       │
│  Siempre en pie  │        │                  │
└──────────────────┘        └──────────────────┘
   Lo que Google ve          Lo que tú operas
```

Motivos:

1. **Velocidad.** Un sitio estático en Vercel carga desde una red global de servidores. El módulo de sitio web de Odoo es mucho más pesado, y la velocidad de carga sí afecta al posicionamiento.
2. **Independencia.** Si Odoo está en mantenimiento, actualización o caído, tu activo de SEO sigue en pie. Si están acoplados, cada problema del ERP te tumba el posicionamiento.
3. **No tirar trabajo.** El sitio web de Odoo usa su propio sistema de plantillas. Migrar hacia dentro obligaría a rehacer todo el maquetado que ya tenemos.

### Cómo sería la conexión cuando llegue el momento

- El sitio se queda donde está
- El botón de reservar lleva al portal de reservas de Odoo, o abre un formulario que crea la reserva allí
- Odoo se encarga de lo que sabe hacer: reservas, factura electrónica, clientes, seguimiento
- Más adelante, si hace falta, el sitio puede leer disponibilidad y precios desde Odoo por API

Nada de esto obliga a tocar lo que llevamos construido. Se añade encima.

### Cuándo hacerlo

No ahora. Odoo tiene sentido cuando el volumen de reservas haga que llevarlas por WhatsApp y a mano empiece a fallar. Antes de eso es complejidad sin beneficio.
