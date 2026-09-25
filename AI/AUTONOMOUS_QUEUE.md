# ATHERON — Cola autónoma de ejecución

> Fuente operativa para el puente ChatGPT → GitHub → Claude Code.
> Este archivo organiza trabajo; no concede permisos adicionales ni sustituye aprobaciones humanas.

## Estado del sistema

- Dispatcher: **ATH-AI-ORCH-001 — EN IMPLEMENTACIÓN**
- Workflow previsto: `.github/workflows/claude.yml`
- Trigger: comentario de Marlon que contenga `@claude`
- Orquestador: ChatGPT
- Ejecutor cloud: Claude Code
- Coordinación multiagente: Ruflo, solo cuando esté disponible y sin auto-escalado
- GitHub: memoria, cola y evidencia
- Producción: **BLOQUEADA por defecto**

## RUNNING

### ATH-AI-ORCH-001 — Autonomous Execution Bridge
Objetivo: eliminar el copiado manual de prompts entre ChatGPT y Claude Code.

Criterios:
- workflow oficial de Claude Code preparado;
- autenticación fuera del repo mediante GitHub Secret;
- solo Marlon puede disparar el workflow inicial;
- máximo 45 minutos por job;
- sin merge automático;
- sin producción;
- sin force-push;
- sin secretos;
- cola persistente en GitHub;
- reporte final en el issue/PR que disparó el trabajo.

## NEXT

### ATH-ODOO-HOTEL-007P — Promotion Rehearsal
Demostrar portabilidad de HOTEL-002..007 sobre una copia nueva de producción, sin tocar producción real.

### ATH-ODOO-HOTEL-008A — Odoo ↔ Web
Consumir disponibilidad/cotización determinista desde Odoo en la web.

### ATH-ODOO-HOTEL-008B — Odoo ↔ WhatsApp/Sofía
Disponibilidad, cotización y HOLD desde el canal asistido.

### ATH-ODOO-HOTEL-008C — Inventario unificado
Sincronizar efectos de Web/WhatsApp sobre la fuente única Odoo.

### ATH-ODOO-HOTEL-008D — Booking/Airbnb / channel layer
Diseñar e integrar la capa OTA sin usar iCal como solución definitiva.

### ATH-ODOO-HOTEL-008E — Domino multicanal
Prueba staging de precio + inventario a través de los canales conectados.

## BLOCKED_HUMAN

1. Instalar/autorizar Claude GitHub App, si aún no está instalada.
2. Crear en GitHub Actions Secret **uno** de los métodos oficiales de autenticación. Este workflow está preparado inicialmente para `CLAUDE_CODE_OAUTH_TOKEN`.
3. Incorporar el workflow a la rama por defecto antes de esperar que un comentario `@claude` lo dispare.
4. Todo merge, producción, pagos, credenciales externas, dominios/DNS y acciones irreversibles.

## DONE

- ORQ-001 — base de orquestación.
- HOTEL-002..006 — aprobados en staging.
- PR #60 — stack Ruflo/Graphify técnicamente validado, pendiente integración.
- HOTEL-007 — gateway técnico probado; cierre documental en curso.

## Contrato de una orden autónoma

ChatGPT publicará la orden directamente en un issue/PR con esta forma lógica:

```text
@claude
ATHERON AUTONOMOUS WORK ORDER
TASK_ID: ...
SCOPE: ...
SOURCE_OF_TRUTH: ...
ALLOWED: ...
FORBIDDEN: ...
ACCEPTANCE_TESTS: ...
STOP_CONDITIONS: ...
REPORT_BACK: ...
```

Marlon no debe copiar ese bloque. ChatGPT lo publica mediante el conector GitHub.

## Regla anti-bloqueo

Si una orden contiene varias tareas seguras y una queda bloqueada por una aprobación humana, Claude:
1. documenta `BLOCKED_HUMAN`;
2. no intenta saltarse el bloqueo;
3. continúa solo con otra tarea que esté explícitamente incluida en la misma orden;
4. deja 0 agentes activos al finalizar.

## Regla de evidencia

Nunca sustituir evidencia del sistema fuente por una etiqueta del middleware.
Para Odoo, conservar de forma saneada los campos reales relevantes de JSON-RPC cuando existan.

## Regla de cierre

Cada ejecución debe dejar:
- tarea;
- estado;
- cambios;
- rama/PR/commit;
- tests;
- riesgos;
- bloqueos humanos;
- producción tocada: NO, salvo autorización expresa;
- secretos expuestos: NO;
- agentes activos al final: 0.
