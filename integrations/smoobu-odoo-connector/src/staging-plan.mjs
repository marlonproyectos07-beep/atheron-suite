/**
 * Lista de NEUTRALIZACION de una base staging nueva (ATH-DEV-016). Derivada de la auditoria de solo lectura de produccion.
 * `autoCheck` = comprobacion automatica de solo lectura en `runIsolationCheck`; `manual` = debe atestiguarla una persona.
 * Mientras exista un item `blocksWrites` sin cumplir, NO se habilitan escrituras sinteticas.
 */
export const NEUTRALIZATION_CHECKLIST = Object.freeze([
  { id: 'N01', category: 'database', what: 'Base distinta de produccion, con host propio y nombre autorizado en staging-guard', autoCheck: 'database-is-staging', blocksWrites: true },
  { id: 'N02', category: 'mail', what: 'Ningun servidor de correo saliente activo (alertas 150, message_post de 171, facturas/informes 26/42)', autoCheck: 'outgoing-mail-servers-inactive', blocksWrites: true },
  { id: 'N03', category: 'crons', what: 'Todos los crons apagados salvo el recalculo del Booking Engine (147 iCal, 150 alerta, 143/32 bancos, 58 Google, 70 marketing, 75 IAP, 26/42 envios)', autoCheck: 'active-crons-only-booking-engine', blocksWrites: true },
  { id: 'N04', category: 'ical-ota', what: 'Cron 147 apagado y ningun NOBEDS/Worker/OTA/Smoobu apunta al host de staging; los .ics de staging no se consumen', autoCheck: 'active-crons-only-booking-engine', manual: 'confirmar en NOBEDS, Cloudflare Worker, Booking, Airbnb y Smoobu que ninguna URL de iCal/webhook es la de staging', blocksWrites: true },
  { id: 'N05', category: 'webhooks', what: 'Automatizaciones on_webhook inactivas (51 NOBEDS) y webhooks de servidor sin uso', autoCheck: 'no-active-webhook-automations', blocksWrites: true },
  { id: 'N06', category: 'webhooks', what: 'Ninguna accion de servidor de tipo webhook', autoCheck: 'no-webhook-server-actions', blocksWrites: true },
  { id: 'N07', category: 'payments', what: 'Proveedores de pago desactivados (el id 14 esta activo en produccion)', autoCheck: 'payment-providers-disabled', blocksWrites: true },
  { id: 'N08', category: 'nobeds-config', what: 'Parametros nobeds.* sin alertas ni correos (nobeds.health_enabled apagado, sin nobeds.health_alert_email real)', autoCheck: 'nobeds-health-alerts-off', manual: 'revisar a mano valores de ir.config_parameter nobeds.* y claves del Worker', blocksWrites: true },
  { id: 'N09', category: 'automations', what: 'Automatizaciones con nombres de canales externos inactivas', autoCheck: 'no-external-names-in-automations', blocksWrites: true },
  { id: 'N10', category: 'website', what: 'Sitio web/motor de reservas publico despublicado y sin indexar', manual: 'despublicar el sitio web y confirmar que el Booking Engine no es accesible publicamente', blocksWrites: true },
  { id: 'N11', category: 'credentials', what: 'Credencial de staging distinta de la de produccion, minimo privilegio, guardada solo como secreto de GitHub Environment', manual: 'crear usuario tecnico y API key nuevos en la base de staging', blocksWrites: true },
  { id: 'N12', category: 'data', what: 'Datos personales: huespedes y contactos reales anonimizados o ausentes en la copia', manual: 'verificar/anonimizar res.partner antes de abrir acceso', blocksWrites: true },
  { id: 'N13', category: 'smoobu', what: 'Ninguna conexion con Smoobu/OTAs desde staging; el conector solo ejecuta contra datos sinteticos', manual: 'confirmar que SMOOBU_* no existen en el entorno de staging', blocksWrites: true },
]);

/** Categorias de efecto externo que la auditoria encontro; cada una debe tener un control en la lista. */
export const EXTERNAL_EFFECT_CATEGORIES = Object.freeze(['mail', 'crons', 'ical-ota', 'webhooks', 'payments', 'website']);
