# Copia de pruebas neutralizada de atheron1 (ATH-HOTELS-SIRE-TRA-001)

**Estado: EJECUTADO el 2026-11-08** sobre `atheron1-pruebas-20261108` (copia creada por Claude con autorizacion de gerencia).

## 1. Crear (odoo.com, sin costo mostrado)
1. atheron1 > Mi suscripcion > Base de datos > **Duplicar**.
2. Nombre `atheron1-pruebas-AAAAMMDD` (unico patron que aceptan los scripts).
3. Dejar marcada **"Propositos de prueba: deshabilitar integraciones externas, correos salientes y acciones programadas"**.
4. Entrar con odoo.com > Mis bases de datos > **Conectar** (inicio de sesion unico; no hace falta contrasena).

## 2. Lo que Odoo hizo solo (verificado en la copia)
| Control | Resultado |
|---|---|
| `database.is_neutralized` | `true`; franja "SE NEUTRALIZO" |
| Correo saliente | unico servidor activo: "neutralization - disable emails" con host `invalid` |
| Crons | 117 de 120 inactivos; quedan internos (auto-vacuum, certificados, aviso a odoo.com) |
| Pagos | 0 proveedores habilitados |
| **Vencimiento** | `database.expiration_date` = **dia siguiente** (motivo `trial`), no 15 dias |

## 3. Lo que Odoo NO neutralizo (y aplicamos solo en la copia)
| Salida | Hallazgo | Accion en la copia |
|---|---|---|
| WhatsApp | 5 cuentas activas con sus credenciales copiadas | desactivadas (`whatsapp.account` 1,2,5,6,7) |
| Webhooks entrantes | automatizaciones 51, 52, 63 activas | desactivadas |
| Cron 48 "Automation Rules: check and execute" | **se reactiva solo** cada vez que se escribe una automatizacion (Odoo recalcula el cron) | desactivar despues de cada cambio de automatizaciones y volver a comprobar |
| Claves de API | **7 claves copiadas** (solo se contaron filas) | no se tocaron; el conector productivo apunta por URL a atheron1, no a la copia |

## 4. Comprobar el aislamiento (antes de cualquier dato sintetico)
`checkIsolation` (src/sire-tra/applier.mjs), solo lecturas. Automatico de Odoo: E1 base neutralizada.
Adicionales nuestros: A1 sin crons no internos activos, A2 correo solo `invalid`, A3 sin webhooks entrantes,
A4 sin automatizaciones con salida webhook/WhatsApp/SMS, A5 sin cuentas WhatsApp activas, A6 sin pagos, A7 sin correo entrante.
Cualquier fallo o dato ilegible = STOP. Resultado el 2026-11-08: 8/8 en verde (tras apagar el cron 48).

## 5. Aplicar
- Node (JSON-2): `node scripts/sire-tra-apply.mjs` simula; `--apply` escribe. Variables `ODOO_TEST_BASE_URL`, `ODOO_TEST_DATABASE`, `ODOO_TEST_API_KEY` (clave propia de la copia).
- Navegador (sesion de la copia, sin credenciales): `node scripts/sire-tra-bundle.mjs` y ejecutar el paquete en la consola de la copia. Solo arranca en hosts `atheron1-pruebas-AAAAMMDD.odoo.com`.

## 6. Reversion
Descartar la copia (vence sola) o `rollbackManifest` (borra solo registros con xmlid `__ath_sire_tra__`). Nunca en produccion sin decision expresa.
