# HOTEL-017 — respaldo previo de la acción 1967 en Odoo STAGING

Fecha/hora del respaldo: 2026-10-02 09:02:52 America/Bogota (creación mostrada por Odoo).

| Dato | Valor verificado |
|---|---|
| Host | `atheron1-hotel-staging-20260923.odoo.com` |
| Acción original | `ir.actions.server/1967`, `HOTEL v1 — API GATEWAY Sofía (006)` |
| Modelo | `x_hotel_api_log` — Hotel v1 — Log de auditoría API |
| Grupos permitidos | Ajustes; Hotel v1 / API Sofía |
| Copia de rollback | `ir.actions.server/1974`, `HOTEL v1 — API GATEWAY Sofía (006) (copia)` |
| Código original | 12 285 caracteres, 168 líneas; comienza `# HOTEL v1 — API GATEWAY (Sofía) — ATH-ODOO-HOTEL-006` y termina con `action = {'type': 'ir.actions.client', 'tag': 'display_notification', ...}`. El texto completo reside en la pestaña Código de la acción 1974. |
| Comparación | Se seleccionó y copió el contenido íntegro del editor Ace de ambas acciones. Comparación exacta de cadenas: `true`; longitud 12 285 en ambas. |

Evidencia de solo lectura: [acción original](https://atheron1-hotel-staging-20260923.odoo.com/odoo/server-actions/1967?debug=1) y [copia íntegra](https://atheron1-hotel-staging-20260923.odoo.com/odoo/server-actions/1974?debug=1). La copia se creó antes de modificar la acción 1967; el registro original seguía sin cambios al verificarla.

Rollback: copiar el contenido completo de la pestaña Código de 1974 a la pestaña Código de 1967, guardar, recargar ambas y comprobar igualdad exacta. La copia 1974 permaneció intacta durante el piloto y sigue disponible para esa restauración.

Después de la escritura, 1967 conserva el mismo nombre, modelo y grupos; solo cambió la pestaña Código. El piloto usó únicamente la ventana sintética 2099-01-10/12 y se liberaron sus slots antes del cierre.
