# Flujo Smoobu -> registro de huespedes -> TRA: estado por tramo (2026-11-18)

Rama `feat/ath-sire-tra-inc1-estructura` (PR #112). Pruebas: 446/446 (Python real incluido).
"Rama" = programado y probado, **no instalado** en atheron1. "Produccion" = instalado y verificado.

| Tramo | Modo | Donde | Evidencia | Pendiente |
|---|---|---|---|---|
| Smoobu -> reserva Odoo (conector) | Automatico, con guardias | Produccion (GitHub Actions, rama `main`) | ejecuciones programadas correctas (ultima #72); desde el 8/11 bloquea las reservas nuevas por guardias de calidad (nombre, total, precio) y avisa sobreventa 301 (4/1/2027) | revisar las reservas bloqueadas; el conector no se modifico |
| Enlace de registro al confirmar / revocar al cancelar | Automatico | Produccion | reservas sinteticas 03899/03900; 4 reales con enlace | - |
| Enlace al INGRESAR la reserva (borrador), excepcion de contacto, mensaje preparado | Automatico | Rama | pruebas: un enlace por reserva, reprocesar sin duplicar, excepcion visible, mensaje no enviado, cancelar revoca | probar en la copia e instalar |
| Envio del mensaje al huesped | Manual (Recepcion) | - | por diseno: sin autorizacion del canal no se envia | autorizacion por canal |
| Formulario -> fichas vinculadas a la reserva | Automatico | Produccion | huesped anonimo sintetico (03901): 2 fichas *Recibido* | - |
| Validacion + habitacion fisica + establecimiento | Manual (Recepcion) | Produccion | fichas sinteticas validadas con habitacion 203 | - |
| Llegada / salida real con hora real y hora de captura, correccion auditada | Manual (Recepcion) | Rama | pruebas Python real (tardia con motivo, correccion con valor anterior, bloqueo si ya reportado) | probar en la copia e instalar; en produccion la version actual guarda la hora del clic |
| TRA: envio tras validacion y llegada real | Automatico preparado, **APAGADO** | Rama (`tra-emitter.yml` cada hora) | reclamo por linea (sin duplicados), incierto sin reenvio, solo validados con llegada | ver bloqueos TRA |
| SIRE | Manual (hoja guiada); exportador apagado | Produccion | cuenta SIRE de ATHERON SAS (119520/25899) registrada en Migracion | acceso y formato sin verificar: **no operativo** |

## Que impide activar TRA (exacto)
1. `tra-catalog.json` con `"verified": false` (tipo de identificacion, motivo, tipo de acomodacion sin lista oficial).
2. Establecimiento: `x_tra_mode = manual` y `x_tra_config_verified = false`; `x_tra_accommodation_type` y `x_tra_cost_basis` vacios.
3. Sin respuesta de fondo al radicado MinCIT 1-2026-041876 (solo acuse del 13/11).
4. Token TRA en el secreto `TRA_TOKEN`: no verificable desde esta sesion.
5. El flujo programado solo corre desde `main` (requiere fusion) y con `TRA_EMITTER_ENABLED=yes`, `TRA_AUTO_SEND=yes`, `TRA_ENABLED=yes-real`.
6. Ningun envio oficial sin que Marlon apruebe el primer registro real y el destino.

## Reversion
- Rama: revertir los commits; en Odoo, el aplicador de produccion vuelve a escribir la version anterior del manifiesto.
- Produccion: `disable({apply:true})` apaga automatizaciones y menus sin borrar datos; `setAutomation('au_invite', false)`.
