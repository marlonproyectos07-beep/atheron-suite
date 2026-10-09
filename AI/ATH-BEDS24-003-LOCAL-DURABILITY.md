# ATH-BEDS24-003 — Persistencia y puerto Odoo locales

Estado: implementación sintética local. No conecta Beds24, Odoo ni canales reales.

## Decisión de almacenamiento

`FileBeds24EventStore` usa un archivo JSON versionado con SHA-256, reemplazo
atómico en el mismo directorio, `fsync` del archivo temporal y locks exclusivos
por archivo. Funciona con el Node mínimo del gateway, sin introducir SQLite ni
un proveedor externo. El directorio se inyecta y debe estar **fuera de Git**,
en un disco local de un solo host. La implementación en memoria permanece solo
para pruebas. El estado inicial es incierto hasta completar una línea base.

El almacén guarda únicamente identificadores técnicos, unidad, fechas, revisión,
estado de proceso, clase de error y tiempos. El procesador descarta cualquier
campo adicional del evento antes de persistirlo. No guarda datos de huéspedes,
URLs de feeds, credenciales ni payloads completos de Beds24.

Un evento se registra como pendiente antes de llamar al puerto Odoo. El acuse
`PROCESSED` y el nuevo estado de reserva se escriben juntos en un reemplazo
atómico. Si Odoo aplicó un comando pero se perdió el acuse, el reintento usa la
misma clave de reserva y revisión. El fake demuestra el replay; un puerto Odoo
real deberá imponer esa unicidad de forma transaccional en Odoo. No existe una
transacción distribuida entre el archivo local y Odoo.

El archivo dañado o con checksum inválido se rechaza sin reinicialización. Un
lock abandonado bloquea el procesamiento hasta revisión operativa; no se roba
automáticamente. Una escritura fallida conserva el último estado confirmado.
Este diseño no sirve por sí solo para varias instancias, discos compartidos o
un despliegue sin volumen persistente. Allí se sustituirá la implementación
del mismo contrato por almacenamiento transaccional compartido.

## Puerto Odoo y permisos

`OdooHotelPort` declara lectura de disponibilidad, reserva y mapeo; alta,
modificación y cancelación de reserva; aplicación y liberación de HOLD; salud.
`FakeOdooHotelPort` implementa esos métodos en memoria con la regla de Casa
Completa. El puerto real reutilizará el transporte Odoo existente tras un gate
de permisos. El adapter durable impide `applyEvent` directo: exige
`processEvent`, almacén durable y puerto Odoo.

| Acción | Scope mínimo |
|---|---|
| Disponibilidad | `beds24:availability:read` |
| Reserva | `beds24:reservation:read` |
| Mapeo | `beds24:mapping:read` |
| Alta | `beds24:reservation:create` |
| Modificación | `beds24:reservation:update` |
| Cancelación | `beds24:reservation:cancel` |
| HOLD | `beds24:hold:apply` |
| Liberación HOLD | `beds24:hold:release` |

Las identidades existentes conservan por defecto sus cuatro scopes previos.
No se concede `admin` ni se expone una ruta Beds24 pública en esta fase.

## Gate siguiente del adaptador local (estado histórico)

Antes de una lectura real: confirmar IDs y scopes Beds24, implementar transporte
API v2 de solo lectura, decidir alojamiento persistente y verificar el mapeo.
Antes de cualquier escritura real: puerto Odoo transaccional con unicidad de
comando, reconciliación completa Odoo/Beds24 y autorización de despliegue.

## Estado de la integración real (ATH-BEDS24-031, 2026-10-09)

Este checkpoint registra las pruebas API realizadas fuera del adaptador
sintético descrito arriba. No habilita producción ni sincronización con Odoo.

- Autenticación: PASS. Permisos efectivos `read:bookings`, `read:inventory`,
  `read:properties` y `write:inventory`, limitados a la propiedad 359051.
- Propiedad: 359051, Suite Atheron. Moneda: COP. Enlaces de canales
  habilitados en la última verificación: 0.
- Mapeo Beds24: 201 = 740215; 202 = 740217; 203 = 740218; 301 = 740219;
  302 = 740220; Casa Completa = 740221. `maxPeople` de Casa: 22.
- Escritura de inventario y precio de habitación física: PASS. Escritura
  de las cinco habitaciones en una fecha: PASS. Rollback: PASS.
- Dependencias Casa ↔ habitaciones físicas: configuración coincidente.
  Disponibilidad calculada de Casa: BLOQUEADA. Aun con las cinco habitaciones
  disponibles temporalmente, `calculatedAvailable=false`. El POST de
  `numAvail=1` para Casa devolvió `success=true`, sin objeto `modified`, y
  `numAvail` permaneció en 0. El estado original fue restaurado.
- Soporte Beds24: según el estado comunicado por dirección, se envió un
  correo técnico y está pendiente la respuesta oficial.

Gate: no repetir escrituras sobre Casa Completa hasta recibir la respuesta
de Beds24 Support y definir el siguiente ensayo controlado.
