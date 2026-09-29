# HOTEL-008A relevo Codex - 2026-09-27

## Estado reconstruido sin red

- Rama: feature/ath-odoo-hotel-008a-live.
- HEAD: 38c3bec948b5b318f4949674aa26ea8775b75ee2.
- AI/ATH-ODOO-HOTEL-008A_HANDOFF.md existe, sin commit.
- AI/ODOO_HOTEL_STATE.md, PROJECT_STATE.md, TASKS.md y HANDOFF.md no
  existen en este checkout. Se leyeron sus versiones de la referencia local
  origin/chore/ai-orchestration-foundation, sin fetch ni cambio de rama.
- El runner vive en integrations/odoo-hotel-gateway/scripts, no en scripts
  de la raiz del repositorio.
- Suite inicial reproducida: 87 PASS / 0 FAIL (71 es un dato anterior).
- La decision mas reciente del usuario indica regla 31
  RATE-AHS-CASA-BASE10-ADD, base_plus_extra, VALIDATED. No se consulto Odoo
  en este relevo: el estado actual no se afirma como verificado LIVE.
- La afirmacion antigua de que solo per_occupancy puede representar esta
  tarifa queda superada por la configuracion informada por el CEO.

## Trabajo preservado

Se conservaron los cambios sin commit de Claude en bootstrap, gateway,
adapter y tests: actionId explicito e idempotencia sin correlation_id.
No se cambio de rama, hizo merge, commit, push ni modifico Master Data.

## Defectos encontrados y corregidos offline

- El runner leia units/available y precio_total en la raiz, mientras Odoo
  devuelve opciones/estado y el precio de cada opcion. Ahora selecciona
  unidad y propiedad exactas, sin busqueda parcial por nombre.
- La expectativa comercial se compara por numero de noches; nunca se manda
  como precio a Odoo ni se cambia el tratamiento fiscal.
- Antes all continuaba tras fallar precios y usaba una sola ventana para
  HOLD de casa y habitacion. Ahora exige precios y baselines limpios, usa
  tres ventanas separadas y verifica status/precio de cada HOLD.
- El CLI pasa por HotelGateway; antes llamaba directamente al adapter.
- Se exige origen HTTPS exacto de staging y accion 1967 explicita.
- Antes de acciones HOTEL se lee exclusivamente x_hotel_rate 31 y se exige
  approved, codigo/modelo/importes/capacidad/relaciones correctos. Sin acceso
  de lectura o sin aprobacion, se detiene. Nunca escribe ni aprueba tarifas.
- El mapeo se descubre por availability dentro de la propiedad de la regla.
- SKIPPED, CREATED, datos ausentes y lista vacia no equivalen a PASS.
- El CLI ya no crea controles simultaneos esperando que sobrevivan al sujeto:
  ambos tienen el mismo TTL. Verifica expiracion real hold_expired y baseline
  completo de TODOS los HOLD propios, incluyendo Casa Completa y GATE 6.
- El diario guarda IDs, ventanas, expiraciones y claves de idempotencia antes
  de continuar. Un fallo parcial conserva la peticion pendiente. Se bloquea
  una nueva ejecucion mientras exista una corrida sin limpieza verificada.
- Escritura atomica y lock local evitan solapamiento de runners. Un lock
  residual tras terminar el proceso abruptamente requiere revision local;
  no se elimina automaticamente ni se vuelve a crear HOLD a ciegas.

## Verificacion

Suite final: 95 PASS / 0 FAIL. Incluye simulacion de respuestas con forma
real, tres HOLD en ventanas independientes, persistencia y restauracion;
rechazo de VALIDATED, configuracion incorrecta, datos incompletos y peticion
incierta. Ninguna prueba usa credenciales reales ni conecta a Odoo.

## Siguiente paso

Pendiente humano conocido: aprobar id31 por el flujo comercial existente.
No se afirma que los gates LIVE hayan pasado ni que la API sea accesible hoy.
Con el entorno tecnico cargado y ODOO_ACTION_ID=1967 explicito, ejecutar desde
este gateway: node scripts/live-hotel-008a-runner.mjs all.
Despues del vencimiento observado: mismo entorno y verify-expiration.
El runner no carga .env implicitamente; Node admite --env-file con el archivo
externo autorizado. No copiarlo al repositorio.
