# Matriz de URLs de Odoo (atheron1.odoo.com) — PROPUESTA, nada ejecutado

Estado: solo lectura. No se ha tocado Odoo, ni redirecciones, ni indexación.
Estados HTTP medidos desde el navegador el 23-nov-2026 (`fetch` sin seguir redirecciones).

## Dos dominios, dos mecanismos

| Dominio | Quién lo controla | Cómo se redirige |
|---|---|---|
| `hotelesatheron.com` (sitio oficial, Vercel) | Este repositorio | `vercel.json` (PR #121) |
| `atheron1.odoo.com` (sitio de Odoo) | Odoo > Sitio web > Configuración > URL y redirecciones | Dentro de Odoo, no desde este repositorio |

Importante: las reglas de `vercel.json` (`/shop`, `/contactus`, `/website/social`)
solo actúan sobre `hotelesatheron.com`. En ese dominio esas rutas hoy dan 404 y
nadie enlaza a ellas. **No cierran la competencia de las páginas de Odoo**, que
viven en otro dominio y tienen canónica propia (`https://www.atheron1.odoo.com/...`).

## Matriz

| # | URL de origen (Odoo) | HTTP | Título actual | Finalidad | Clase | Destino propuesto | Dónde se hace | Impacto en Hotels | Impacto en Security |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | 200 | Hospedaje La Magia de Zipaquirá | Portada de Odoo, antigua del hotel | General | **Sin cambio** (decisión de dirección) | — | Compite con la web oficial por «Atheron» | Ninguno |
| 2 | `/atheron-security` | 200 | Atheron_Security \| Atheron_Suite | Línea de seguridad electrónica | Security | Conservar | — | Ninguno | Es la página de la línea Security |
| 3 | `/atheron-security-colombia` | 200 | Atheron Security Colombia | Línea de seguridad electrónica | Security | Conservar | — | Ninguno | Es la página de la línea Security |
| 4 | `/cocina-oculta-1` | 200 | cocina oculta | Página suelta, sin relación visible con el hotel | Obsoleta (por verificar) | Redirección individual a `/` de Odoo, o a una página de Odoo vigente | Odoo | Ninguno | Verificar que no sea de Security |
| 5 | `/que-hacer-en-zipaquira` | 200 | Que hacer en Zipaquirá | Contenido turístico; compite con `/guia-zipaquira` de la web oficial | Hotels / compite | Redirección 301 a `https://hotelesatheron.com/guia-zipaquira` | Odoo (redirección entre dominios) | Concentra autoridad en la web oficial | Ninguno |
| 6 | `/wa-link/ic0sx2` | 200 | La Magia de Zipaquirá | Enlace corto de WhatsApp | Hotels | **Conservar**: puede estar en materiales ya impresos o publicados | — | Romperlo corta reservas | Ninguno |
| 7 | `/appointment` | redirige | → portada | Módulo de citas de Odoo | Administración | Conservar | — | Ninguno | Verificar si Security agenda por aquí |
| 8 | `/calendar` | redirige | → portada | Módulo de calendario | Administración | Conservar | — | Ninguno | Ninguno |
| 9 | `/shop` | 200 | Products | Tienda de Odoo (módulo activo) | Obsoleta (por verificar) | Redirección a `/` de Odoo solo si no se vende nada por aquí | Odoo | Ninguno | **Verificar**: Security podría usarla |
| 10 | `/website/info` | 200 | Odoo Information | Página técnica de Odoo | Administración | Conservar; no es contenido comercial | — | Ninguno | Ninguno |
| 11 | `/events` | 200 | Events | Módulo de eventos de Odoo | Obsoleta (por verificar) | Decidir según uso | Odoo | Ninguno | Ninguno |
| — | `/contactus` | 404 | — | No existe en Odoo | — | Ya cubierta en `vercel.json` para el dominio oficial | Vercel | Ninguno | Ninguno |
| — | `/hotel` | 404 | — | No existe en Odoo | — | Nada | — | Ninguno | Ninguno |

## Lo que NO se propone

- Tocar la portada de Odoo (fila 1).
- `noindex` masivo.
- Desactivar páginas o cambiar `robots.txt` de Odoo.

## Decisiones que necesito de dirección

1. Fila 5: ¿aprueba redirigir `que-hacer-en-zipaquira` a la guía oficial?
2. Filas 4, 9 y 11: ¿se usan hoy para algo (tienda, eventos, cocina oculta)?
3. Filas 7 y 9: ¿Security usa citas o tienda?
