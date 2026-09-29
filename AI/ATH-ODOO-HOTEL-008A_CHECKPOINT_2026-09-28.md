# ATH-ODOO-HOTEL-008A — Checkpoint de relevo (2026-09-28)

> Recovery + auditoria ejecutada en modo autonomo (30 min, CEO ausente).
> No se repite investigacion ya hecha: ver tambien
> `AI/ATH-ODOO-HOTEL-008A_HANDOFF.md` (2026-09-27) y
> `integrations/odoo-hotel-gateway/scripts/HOTEL-008A-CODEX-AUDIT.md`.
> Este archivo es nuevo; no se borro ni se sobrescribio ninguno anterior.

```
TASK_ID: ATH-ODOO-HOTEL-008A
BRANCH: feature/ath-odoo-hotel-008a-live
HEAD: 38c3bec948b5b318f4949674aa26ea8775b75ee2
WORKTREE: sucio, sin commits nuevos desde la ultima sesion. Modificados:
  src/bootstrap.mjs, src/gateway.mjs, src/odoo-adapter.mjs,
  test/gateway.test.mjs, test/odoo-adapter.test.mjs,
  test/odoo-live-pipeline.test.mjs. Nuevos sin commit:
  scripts/live-hotel-008a-runner.mjs, scripts/live-runner-safety.mjs,
  scripts/HOTEL-008A-CODEX-AUDIT.md, scripts/live-runner-state.local.json
  (gitignored), test/live-runner.test.mjs, test/live-runner-safety.test.mjs,
  .gitignore.
OFFLINE_TESTS: 95/95 PASS (verificado ahora, 2026-09-28 ~14:45 UTC;
  node --test dentro de integrations/odoo-hotel-gateway). Sin fallos, no
  se necesito diagnosticar ni corregir nada.
LIVE_PHASES:
  - price-tiers: PASS. 10/11/12/22 huespedes -> Odoo devolvio
    500000/550000/600000/1100000 COP, coincide exacto con la expectativa
    comercial del CEO. tax_status PENDING_TAX_DEFINITION en todos (no
    bloquea el gate, es el pendiente ya conocido de impuestos).
  - gate4: PASS. HOLD Casa Completa (hold_id 22219) -> las 5 habitaciones
    quedan no_disponible.
  - inverse-gate: PASS. HOLD habitacion 302 (hold_id 22220) -> Casa
    Completa bloqueada, el resto de habitaciones intacto.
  - gate6 (creacion de holds para verificar expiracion): PASS. HOLD de
    control (hold_id 22221), misma ventana TTL que el sujeto.
  Evidencia capturada anoche (sesion previa, antes de agotar cuota),
  NO repetida ni duplicada en esta sesion.
VERIFY_EXPIRATION: NO EJECUTADO. BLOCKED_CREDENTIALS.
  Esta sesion no tiene variables ODOO_* en su entorno (verificado con
  `env | grep ODOO_`, 0 resultados). Por instruccion explicita, NO se
  buscaron credenciales en disco. Los 3 HOLD deberian haber expirado ya
  segun su timestamp registrado (~2026-09-27 23:00:10 a 23:00:22 UTC;
  hora actual del checkpoint ~2026-09-28 14:45 UTC, +15h45min despues),
  pero eso NO esta demostrado contra Odoo real todavia. No asumir PASS.
RUN_ID: f7f7b550-7b62-4b8f-874a-796e9c1afd32
HOLD_IDS: 22219 (Casa Completa / gate4), 22220 (302 / inverse-gate),
  22221 (control / gate6)
EVIDENCE: integrations/odoo-hotel-gateway/scripts/live-runner-state.local.json
  (gitignored, sin secretos, contiene los 4 payloads reales de Odoo)
FILES_CHANGED: ver WORKTREE arriba. Ningun archivo se movio ni se borro.
COMMITS_CREATED: NINGUNO. No hubo cambios de codigo en esta sesion
  (offline tests ya estaban en 95/95 PASS); no se inventa un commit vacio.
BLOCKERS:
  - BLOCKED_CREDENTIALS para verify-expiration (ver arriba).
  - Tarifa x_hotel_rate id 31 (RATE-AHS-CASA-BASE10-ADD): YA NO es
    bloqueante, Marlon confirmo APPROVED (aprobada por ORM y verificada
    en navegador autenticado) en la actualizacion del 2026-09-27.
PRODUCTION_TOUCHED: NO
ATHERON_SECURITY_TOUCHED: NO
NEXT_EXACT_ACTION: con el .env autorizado cargado como variable de
  entorno en una sesion que YA lo tenga (nunca pegado en chat ni
  commiteado), desde integrations/odoo-hotel-gateway ejecutar:
  node scripts/live-hotel-008a-runner.mjs verify-expiration
  Si PASS (el sujeto expiro y libero, el control no se vio afectado por
  la expiracion del sujeto): HOTEL-008A queda tecnicamente cerrado;
  falta decidir con Marlon si se hace commit del trabajo en la rama
  feature/ath-odoo-hotel-008a-live (sin merge a main sin su orden
  expresa, y sin olvidar public/admin/config.yml linea 45 si algun dia
  se prepara ese merge — aplica al repo del sitio, no a este gateway,
  pero es la misma regla de gobernanza del proyecto).
```
