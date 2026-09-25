# Rollback y revocación — ATH-ODOO-HOTEL-007

Este gateway es una capa nueva delante de Odoo. Nada de lo que hace es
irreversible: no migra datos, no cambia esquema, no reemplaza el trabajo ya
aprobado en HOTEL-002 a HOTEL-006.

## 1. Desactivar el gateway externo

El gateway es un proceso HTTP independiente (`npm start` / `index.mjs`).

- **Si no se desplegó todavía**: no hay nada que apagar; este directorio
  sigue siendo solo código y tests locales.
- **Si se desplegó** (fuera del alcance de este gate — "NO producción"):
  detener el proceso/contenedor que lo sirve. Al no tener el proceso
  corriendo, ningún agente puede llamar a `availability/quote/hold/status`
  por esta vía. Odoo sigue intacto y accesible por los caminos ya existentes
  (UI web, automatizaciones de HOTEL-002/006).

## 2. Revocar la credencial técnica

Dos niveles de credencial, cada uno revocable de forma independiente:

- **Identidad del gateway** (`GATEWAY_TECHNICAL_IDENTITIES`): marcar
  `revoked: true` para el `agent_id` afectado (o quitarlo del arreglo) y
  reiniciar el proceso con la variable actualizada. Efecto inmediato:
  `UNAUTHORIZED` para ese agente, sin tocar código (ver
  `test/revocation.test.mjs`).
- **Usuario técnico de Odoo** (modo LIVE, `ODOO_TECHNICAL_USER` /
  `ODOO_TECHNICAL_SECRET`): desactivar o eliminar el usuario en Odoo, o
  rotar su contraseña/API key. El gateway empieza a fallar en el login
  (`UNAUTHORIZED` desde `#callOdooAction1967`) sin ningún cambio en este
  repositorio.

Ninguna revocación requiere desplegar código nuevo.

## 3. Volver al estado HOTEL-006

HOTEL-006 no depende de este gateway: la operación por navegador autenticado
y las automatizaciones ya aprobadas en Odoo (grupo 149, acción 1967,
cron 155, x_hotel_api_log) siguen funcionando exactamente igual si este
gateway se apaga o se revoca por completo. No hay dependencia inversa.

## 4. Preservar reservas y HOLD

- En **DRY_RUN** (el único modo probado en este repo), no existe ningún
  HOLD real: los HOLD viven solo en memoria del proceso del gateway y
  desaparecen al apagarlo. No hay nada que preservar ni limpiar en Odoo.
- En modo **LIVE** (no probado aquí), cualquier HOLD creado ya vive dentro
  de Odoo, gobernado por las mismas reglas de expiración/cron ya aprobadas
  en HOTEL-002/006 (cron 155, duración vigente de 2 h). Apagar o revocar el
  gateway no borra ni corrompe esos HOLD: Odoo sigue siendo la única fuente
  de verdad y los libera con su propio mecanismo, igual que si hubieran sido
  creados desde el navegador.

## 5. Preservar logs

- `AuditLog` (`src/audit-log.mjs`) es en memoria dentro de este scaffold; en
  un despliegue real debe escribirse a un sink durable (archivo/DB) antes de
  apagar el proceso si se necesita conservar el historial de esa sesión.
- La auditoría dentro de Odoo (`x_hotel_api_log`) es independiente de este
  gateway y no se ve afectada por apagarlo, revocarlo o hacer rollback de
  este repositorio.

## Resumen operativo

| Acción | Comando/paso | Reversible | Afecta a Odoo |
|---|---|---|---|
| Apagar el proceso del gateway | detener `npm start` / contenedor | Sí | No |
| Revocar identidad del gateway | `identityStore.revoke(agentId)` + reiniciar con env actualizado | Sí (se puede reactivar) | No |
| Revocar usuario técnico de Odoo | desactivar/rotar en Odoo | Sí | Solo ese usuario |
| Volver a HOTEL-006 | no hacer nada adicional: HOTEL-006 no depende de este gateway | N/A | N/A |
