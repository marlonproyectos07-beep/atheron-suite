# Manifiesto de promoción Odoo Hotel — staging → producción

> Creado durante el cierre de ATH-ODOO-HOTEL-007 (PR #57), a partir de:
> `AI/ODOO_HOTEL_STATE.md` (rama `chore/ai-orchestration-foundation`), las
> pruebas LIVE reales ejecutadas el 25/09/2026 contra
> `atheron1-hotel-staging-20260923`, y el código de este repositorio.
>
> **Este documento es de auditoría, no de ejecución.** No migra nada. No
> abre producción. No modifica Atheron Security.
>
> **Limitación honesta, léela primero:** ni esta sesión de Claude Code ni
> el usuario técnico Sofía API STAGING (a propósito, sin admin) tienen
> acceso a **Ajustes → Técnico → Personalizaciones de Studio** en Odoo. Todo
> lo marcado como **NO CONFIRMADO** en este documento requiere que alguien
> con acceso administrador a Odoo lo verifique directamente — no se inventó
> ningún ID, nombre de modelo o vista que nadie haya visto. Pedir ese acceso
> no es parte de esta tarea (violaría "sin admin, sin elevar privilegios").

## 1. Arquitectura actual

```
AGENTE (Claude/ChatGPT/Codex)
  → Gateway HTTP (integrations/odoo-hotel-gateway, este repo, en GitHub)
    → JSON-RPC (login + execute_kw) con usuario técnico de mínimo privilegio
      → Odoo: ir.actions.server id 1967 ("HOTEL API")
        → lo que sea que 1967 orqueste internamente (NO CONFIRMADO en detalle)
          → Master Data / reglas tarifarias / inventario / x_hotel_api_log
```

El gateway externo (este repositorio) **no** duplica tarifas, capacidad,
disponibilidad ni anti-overbooking: todo eso vive del lado de Odoo, detrás
de la acción 1967. Ver `integrations/odoo-hotel-gateway/README.md` para el
contrato completo ya probado contra staging real.

## 2. Qué vive en GitHub (Categoría A)

- Todo `integrations/odoo-hotel-gateway/` (contrato, adapter, auth, tests).
- `AI/*.md` (memoria de orquestación, en `chore/ai-orchestration-foundation`).
- Este manifiesto.

Esto se promueve como **código**: desplegar el mismo repositorio (misma
rama o un release de ella) apuntando, vía variables de entorno, a la Odoo
de producción — no requiere ningún paso especial de Odoo.

## 3. Qué vive SOLO en la base de datos de staging

Todo lo que sigue vive dentro de `atheron1-hotel-staging-20260923` y no
tiene ninguna copia en GitHub. Ver la tabla de inventario (sección de
abajo) para el detalle fila por fila.

## 4. Qué se exporta mediante Studio — **NO CONFIRMADO**

Odoo Studio permite exportar un paquete de personalizaciones
(`Ajustes → Técnico → Personalizaciones de Studio → Exportar`) que incluye
típicamente: modelos `x_*`, campos `x_*`, vistas creadas con Studio, y
algunas automatizaciones creadas ahí mismo. **No se pudo confirmar si la
acción 1967, el modelo `x_hotel_api_log`, o las reglas tarifarias fueron
construidos con Studio o con un módulo de código instalado.** Esa es la
pregunta que más cambia el método de promoción (ver sección 15).

## 5. Qué debe recrearse/configurarse (no migrarse tal cual)

- Usuario técnico (Categoría F) — nuevo login, nueva clave, en producción.
- Grupos 148/149 y sus reglas de acceso — recrear a mano siguiendo el
  mismo diseño de mínimo privilegio ya validado en HOTEL-006.
- Cron de expiración de HOLD (hoy id 155 en staging) — mismo intervalo.
- Automatización de `pricelist_id` inmutable (hoy id 199 en staging).

## 6. Qué NO debe migrarse (Categoría E)

- Cotizaciones 115/116 y HOLD 22215/22216 (todas de prueba).
- Cualquier contacto/cliente ficticio o email `@example.invalid` u otro
  dominio neutralizado.
- Los **valores** de precio vistos hoy (80000/120000/150000 COP): la propia
  respuesta de Odoo los marca `pricing_status: "quoted"` pero con
  `policy_governance: "SIN_ESTADO_DE_APROBACION"` y `tax_status:
  "PENDING_TAX_DEFINITION"` — son precios de prueba, no precios aprobados
  por el CEO para vender de verdad.
- Acción 1969 (QA, ya desactivada en el cierre de HOTEL-006) — no migrar
  activa bajo ninguna circunstancia.
- Cualquier configuración de neutralización de la base (no envío de
  correos, etc.) — producción SÍ debe enviar correos reales.

## 7. Orden exacto de despliegue (propuesto, sin ejecutar)

1. Grupos 148/149 con sus reglas de acceso.
2. Usuario técnico nuevo (producción), dentro del grupo 149.
3. Master Data real de las propiedades/unidades (mapeado a los IDs reales
   de producción, **nunca** copiando los IDs de staging 1-8).
4. Reglas tarifarias con precios **aprobados por el CEO**, no los de prueba.
5. Modelo/acción equivalente a la 1967, con el mismo contrato de
   `op`/`payload` ya validado (ver `src/odoo-adapter.mjs`).
6. Modelo de auditoría (`x_hotel_api_log` o equivalente).
7. Cron de expiración de HOLD y automatización de `pricelist_id` inmutable.
8. Gateway externo (este repo) apuntando a la Odoo de producción, con
   credenciales nuevas.
9. Repetir los Gates 1-7 de este PR contra la copia antes de ir a
   producción real (ver sección 12).

## 8. Dependencias

Master Data (paso 3) depende de que los grupos y el usuario existan (para
poder probarlo). Las reglas tarifarias (paso 4) dependen del Master Data.
La acción equivalente a 1967 (paso 5) depende de ambos. El gateway externo
(paso 8) depende de todo lo anterior.

## 9. Secretos que deben recrearse (nunca copiarse)

- `ODOO_TECHNICAL_USER` / `ODOO_TECHNICAL_SECRET`: nueva clave API generada
  en la Odoo de producción, para un usuario técnico nuevo — nunca la misma
  clave ni el mismo `uid` que en staging.
- `GATEWAY_TECHNICAL_IDENTITIES`: nuevo hash SHA-256 por cada agente
  autorizado en producción (ver `src/identity.mjs`).

## 10. Checklist rollback

- Antes de tocar la Odoo de producción: confirmar que existe un backup o
  checkpoint reciente de esa base (independiente de este proyecto).
- El gateway externo se puede apagar/revocar sin afectar Odoo (ver
  `ROLLBACK.md` de `integrations/odoo-hotel-gateway`).
- Ninguna automatización/cron nueva debe instalarse sin una forma
  documentada de desactivarla (no solo de crearla).

## 11. Checklist QA (antes de dar por lista la promoción)

- [ ] `availability`, `quote`, `hold`, `status` repiten los mismos PASS que
      hoy contra staging, pero contra la copia de producción.
- [ ] Anti-overbooking (CASA COMPLETA ↔ habitaciones) verificado en la
      copia, no asumido.
- [ ] Precios de las reglas tarifarias son los aprobados por el CEO, no
      los de prueba.
- [ ] Cron de expiración de HOLD probado con un HOLD de prueba (y ese HOLD
      de prueba se borra/expira antes de ir a producción real).
- [ ] Auditoría (`x_hotel_api_log` o equivalente) registrando correctamente.
- [ ] Gate 8 (lectura de auditoría por el usuario técnico) repetido en la
      copia con el mismo resultado que en staging.

## 12. Plan de promoción

```
Producción actual
  → copia NUEVA de producción (staging limpio, sin datos de prueba de HOTEL-007)
    → aplicar el paquete de promoción (pasos 1-8 de la sección 7)
      → ejecutar regresión HOTEL-002..007 sobre esa copia
        → comparar resultados contra lo ya documentado (HOTEL-002..006,
          y las pruebas LIVE de este PR)
          → aprobación explícita de Marlon
            → producción real
```

Ninguno de estos pasos se ejecuta en esta tarea. Este manifiesto solo lo
documenta.

## 13. Criterio de portabilidad

La arquitectura de HOTEL-007 solo se considera portable si puede instalarse
sobre una **copia nueva** de producción sin depender de ningún registro
accidental de la base de staging actual (IDs específicos de esa base,
usuario técnico de esa base, cron de esa base, etc.). Con la información
disponible hoy, esto es **PENDIENTE_PRUEBA** (ver sección 15) — no hay
evidencia de que dependa de staging de forma accidental, pero tampoco se ha
probado sobre una copia nueva.

---

## Inventario detallado

| # | Elemento | ID técnico (staging) | Modelo Odoo | Categoría | ¿Creado en staging? | ¿Existe ya en producción original? | Cómo promocionarlo | Dependencias | Orden | Prueba posterior | Riesgo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Gateway HTTP externo | — (este repo) | N/A | A | No (vive fuera de Odoo) | No aplica | Git (deploy de código) | Acción equivalente a 1967 en destino | 8 | Gates 1-7 repetidos | Bajo |
| 2 | Acción "HOTEL API" | 1967 | `ir.actions.server` (asumido) | B o C — **NO CONFIRMADO** | Sí | **NO CONFIRMADO** | Studio export si es B; módulo/config si es C — **NO CONFIRMADO cuál** | Modelo(s) de datos internos (NO CONFIRMADO) | 5 | Gates 4-6 repetidos | Alto (depende de la categoría real) |
| 3 | Grupo 149 "Hotel v1 / API Sofía" | 149 | `res.groups` | C | Sí | **NO CONFIRMADO** | Recrear a mano (reglas de acceso) | — | 1 | Fase 7 (bloqueos) repetida | Alto si las reglas no son exactas |
| 4 | Grupo 148 "Aprobador comercial" | 148 | `res.groups` | C | Sí | **NO CONFIRMADO** | Recrear a mano | — | 1 | Confirmar que Sofía sigue sin este grupo | Medio |
| 5 | Usuario técnico Sofía API STAGING | uid 27 (staging) | `res.users` | F — recrear, no copiar | Sí | No (específico del proyecto) | Usuario nuevo + clave nueva en producción | Grupo 149 | 2 | Login válido + revocación | Bajo si se sigue el proceso de HOTEL-006 |
| 6 | Modelo de auditoría `x_hotel_api_log` | — | `x_hotel_api_log` (nombre confirmado) | B — **NO CONFIRMADO si es Studio** | Sí | **NO CONFIRMADO** | Studio export si aplica | — | 6 | Una operación de prueba y confirmar registro | Medio (se pierde auditoría si no se migra) |
| 7 | Master Data: unidades piloto (201/202/203/301/302/CASA COMPLETA, Hotel Atheron Suite; CASA COMPLETA Casa Algarra; CASA COMPLETA Casa Neusa) | `property_id` 1-3, `unit_id` 1-8 (staging) | `resource.resource` + calendario + campos `x_*` (documentado en HOTEL-002) | D | Sí | **Probablemente sí, con OTROS IDs** — crítico | Import controlado con mapeo manual, **nunca copiar los IDs de staging** | Grupos + usuario | 3 | availability/quote deben devolver unidades reales de producción | **Alto** — el punto más delicado de toda la promoción |
| 8 | Reglas tarifarias (RATE-AHS-201-OCC, 202, 203, 301, 302, RATE-AHS-CASA-QUOTE) | ids de regla no expuestos por la API (solo el código `rate_rule_id`) | **NO CONFIRMADO** (posible extensión de `product.pricelist.item`, lista 20 según HOTEL-006) | D (valores) / C (estructura) | Sí (estructura); valores son de prueba | **NO CONFIRMADO** | Estructura sí se promueve; **valores de precio deben ser los aprobados por el CEO**, no los de staging | Master Data | 4 | quote debe devolver precios aprobados, no los de staging (80000/120000/150000 COP) | **Alto** |
| 9 | Listas de precios legacy 16/17 vs nueva 20 | 16, 17, 20 | `product.pricelist` (asumido) | G (16/17, probablemente ya existían) / C (20, nueva) | 20 sí; 16/17 probablemente ya existían | 16/17: **probable sí**; 20: no | Confirmar 16/17 antes de tocar nada; recrear/configurar 20 | — | 4 | Confirmar que el flujo nuevo no toca 16/17 | Medio |
| 10 | Automatización `pricelist_id` inmutable | 199 | `base.automation` (asumido) | C | Sí (endurecida en cierre HOTEL-006) | **NO CONFIRMADO** | Recrear/configurar | Reglas tarifarias | 7 | Intentar cambiar `pricelist_id` en una reserva y confirmar que se bloquea | Medio |
| 11 | Acción 1969 (QA, desactivada) | 1969 | `ir.actions.server` (asumido) | E | Sí | No aplica | **NO MIGRAR** (o migrar ya desactivada, nunca activa) | — | — | Confirmar que no existe o está desactivada en destino | Bajo si se documenta |
| 12 | Acción 1970 (worker de concurrencia, solo admin) | 1970 | `ir.actions.server` (asumido) | C | Sí | **NO CONFIRMADO** | Recrear con el mismo candado "solo admin" | — | 7 | Confirmar que un usuario no-admin no puede ejecutarla | Medio |
| 13 | Cron de expiración de HOLD | 155 | `ir.cron` (asumido) | C | Sí | **NO CONFIRMADO** | Recrear/configurar, mismo intervalo (2 h) | Modelo de HOLD | 7 | Crear un HOLD de prueba y confirmar expiración automática | **Alto si se omite** (HOLDs quedarían bloqueando inventario para siempre) |
| 14 | Automatizaciones S14 (71/132/135/137) | 71, 132, 135, 137 | `base.automation` (asumido) | C | Sí | **NO CONFIRMADO** | Recrear/configurar | Master Data (132/135/137 dependen de unidades aún incompletas, ver pendiente CEO) | 7 | Repetir S14 (41/41) en destino | Alto — depende de un pendiente CEO todavía sin cerrar en origen |
| 15 | Relación CASA COMPLETA ↔ habitaciones (anti-overbooking compartido) | — | **NO CONFIRMADO** (probable relación en `resource.resource` o calendario compartido) | D/C | Sí | **NO CONFIRMADO** | Recrear la misma relación | Master Data | 3 | Repetir Gate 6c (HOLD de una habitación bloquea CASA COMPLETA) | **Alto** si no se replica bien |
| 16 | Master Data 132/135/137 | — | — | Pendiente (ni completo en staging) | Parcial | No aplica | **No promocionar hasta que se resuelva en origen** (pendiente CEO ya documentado) | — | — | — | — |
| 17 | Cotizaciones/HOLD de prueba (115/116, 22215/22216) | 115, 116, 22215, 22216 | — | E | Sí | No | **NO MIGRAR** | — | — | — | Ninguno si no se migran |
| 18 | Contactos/emails neutralizados (`@example.invalid`, etc.) | — | `res.partner` (asumido) | E | Sí | No | **NO MIGRAR** | — | — | — | Ninguno si no se migran |

## 15. ¿Puede HOTEL-007 reproducirse sobre una copia nueva de producción?

**PENDIENTE_PRUEBA.** No hay evidencia de una dependencia accidental de
staging (el contrato HTTP externo, el adapter y los tests no referencian
ningún dato de staging por fuera de las pruebas mismas), pero la pregunta
central de la fila #2 y #4 del inventario (¿la acción 1967 y el modelo de
auditoría son Studio o módulo?) determina el método de promoción entero, y
**no se pudo confirmar sin acceso administrador a Odoo**. Recomendación:
que quien tenga ese acceso revise `Ajustes → Técnico → Personalizaciones de
Studio` y confirme si hay un paquete exportable ahí.

## Riesgos reales

1. Master Data de unidades (fila #7): mezclar IDs de staging con
   producción es el riesgo más alto de toda la promoción.
2. Reglas tarifarias con precios de prueba (fila #8): no deben llegar a
   producción sin aprobación explícita del CEO.
3. Cron de expiración de HOLD (fila #13): si se omite, un HOLD real
   bloquearía inventario indefinidamente.
4. La categoría Studio-vs-módulo de la acción 1967 y `x_hotel_api_log`
   sigue sin confirmar — cambia el método de promoción completo.
