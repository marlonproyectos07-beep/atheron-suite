# Ensayo del despliegue minimo TRA Grupo 1 en copia neutralizada (25/11/2026)

Autorizado por Marlon el 25/11/2026 (16:07 Bogota). Repositorio publico: solo ids y codigos. Produccion sin cambios.
TRA apagado; Smoobu -> Odoo y SIRE sin cambios.

## 1. Copia
- No habia copia vigente. `atheron1-pruebas-20261108` sigue listada en odoo.com, pero su URL responde "does not
  exist (anymore?)".
- Creada `atheron1-pruebas-20261125` desde atheron1 > Mi suscripcion > Duplicar, con "Propositos de prueba" marcado.
  No se mostro ningun costo y no se contrato nada.
- Vence: `database.expiration_date = 2026-11-27 01:10:00` UTC (26/11 20:10 Bogota), motivo `trial`.
- Aislamiento, `checkIsolation` del paquete:
  - estado inicial: 6/8. Fallaban A3 (3 webhooks entrantes) y A5 (5 cuentas WhatsApp), igual que en la copia del 08/11;
  - medidas, solo en la copia y segun PROCEDIMIENTO-COPIA-PRUEBAS.md §3: `whatsapp.account` 1, 2, 5, 6 y 7
    desactivadas; automatizaciones 51, 52 y 63 desactivadas; cron 48 apagado (se reactiva al escribir automatizaciones);
  - resultado: **8/8**.

## 2. Codigo ejecutado
- Paquete de la copia (`scripts/sire-tra-bundle.mjs`) armado en la pagina con los archivos de `src/` del commit
  `4584d2bbeef34640b46552169f9bc92f778bcd1d`, leidos de raw.githubusercontent.com.
- sha256 del paquete (146 748 bytes), igual al generado en local: `a6e45cb784f538cfcb96613f16abcfec38d6cd94720040d3661464c8e9f59486`.

## 3. Resultado
| Paso | Resultado |
|---|---|
| `planDelta` | 5 cambios y 0 bloqueos; accion 2040, vistas 6872 y 6873, modelo 2534 (mismos ids que produccion); respaldo de 2 991 bytes |
| `applyDelta` | campos 49415 (`x_excludes_taxes`) y 49417 (`x_covers_all_guests`); accion 2040 y vistas 6872 y 6873 reescritas; 6,3 s |
| `verifyDelta` | `ok: true`; 5 de 5 hechos |
| Automatizaciones (id, activa, fecha de escritura) | identicas antes y despues |
| Cron 48 | apagado antes y despues |
| Vistas (`get_views`) | formulario y lista cargan con los dos campos y el aviso |
| Accion "Confirmar con evidencia" (datos sinteticos, pedido 22117 de la copia) | sin salida: rechazada; sin constancia de impuestos: rechazada; sin constancia de alcance: rechazada; corte anterior a la salida: rechazada; completo: **confirmado** con quien y cuando |
| `revertDelta(respaldo)` | vistas y accion vueltas al respaldo; sha256 = base de produccion (`481f7409e659`, `84f7e14ebeac`, `9df237346854`) |
| Despues de revertir | `planDelta`: 0 bloqueos y 3 cambios (accion y vistas); los 2 campos se conservan; automatizaciones identicas; las vistas cargan |

Datos sinteticos que quedan en la copia (vence sola):
- `x_tra_amount` 1 a 4 ("PRUEBA SINTETICA delta 2026-11-25"). Nadie puede borrarlos: los permisos no lo admiten.
- `x_departed_at` escrito en la ficha 1 de la copia.

## 4. Diferencias exactas para produccion
Lectura de produccion del 24/11 y de nuevo del 25/11:
- la accion 2040 y las vistas 6872 y 6873 son identicas a la base (`delta-base-2026-11-24.mjs`, de e93ea57);
- `x_excludes_taxes` y `x_covers_all_guests` no existen;
- 0 importes, 0 intentos.

El despliegue hace exactamente lo ensayado: 2 creaciones, 1 accion y 2 vistas. El procedimiento esta en
`tra-grupo1-manual-y-respuesta-2026-11-24.md` §11. No se ha aplicado.
