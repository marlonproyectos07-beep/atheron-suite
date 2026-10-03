/**
 * Pruebas minimas de las reglas CEO (GOAL-WHATSAPP-AGENT-001).
 * Formato declarativo: ver test/support.mjs#check. Mismo formato que debe
 * tener el contrato del Playbook (cases/playbook-cases.json).
 */
const noPrice = [/\$\s?\d/, /descuento de/i, /\d+\s?%\s?(de )?(descuento|menos)/i];

export const CEO_CORE = [
  { id: 'CEO-01', title: '¿Me haces descuento? -> ESCALATE_HUMAN, jamas bajar precio', turns: [
    { say: '¿Me haces descuento?', expect: { classification: 'GUEST_LEAD', escalation: 'DISCOUNT_REQUEST', actions_include: ['ESCALATE_HUMAN', 'ALERTA_HUMANO'], text_excludes: noPrice, odoo_called: false } },
  ] },
  { id: 'CEO-01b', title: 'descuento tras cotizar: no cambia precio, conserva contexto en el resumen', turns: [
    { say: 'Hola, somos 2 del 20 al 22 de octubre', expect: { escalation: null, odoo_called: true, context: { fecha_in: '2026-10-20', fecha_out: '2026-10-22', total_personas: 2 } } },
    { say: 'Si es por 2 noches, ¿me hace un precio especial?', expect: { escalation: 'DISCOUNT_REQUEST', text_excludes: noPrice, custom: (r) => { if (r.escalation.summary.precio_cotizado == null) throw new Error('el resumen no trae el precio cotizado'); if (r.context.precio_cotizado !== r.escalation.summary.precio_cotizado) throw new Error('precio alterado'); } } },
  ] },
  { id: 'CEO-02', title: '¿Cuánto debo abonar? -> 50% del total vigente (de Odoo)', turns: [
    { say: 'Hola, somos 2 del 20 al 22 de octubre', expect: { odoo_called: true } },
    { say: '¿Cuánto debo abonar?', expect: { intents_include: ['DEPOSIT'], escalation: null, odoo_called: true, text_includes: [/50%/], custom: (r) => {
      const { precio_cotizado: total, anticipo } = r.context;
      if (!total || anticipo !== Math.round(total / 2)) throw new Error(`anticipo ${anticipo} != 50% de ${total}`);
      const fmt = (n) => `$${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
      if (!r.text.includes(fmt(anticipo))) throw new Error('el texto no trae el anticipo');
      if (r.quote.source !== 'odoo_staging') throw new Error('el total no viene de Odoo');
    } } },
  ] },
  { id: 'CEO-03', title: 'Quiero cancelar, llego dentro de 5 dias -> politica 48h / saldo 6 meses', turns: [
    { say: 'Quiero cancelar, llego dentro de 5 días', expect: { classification: 'GUEST_RESERVED', escalation: 'CANCELLATION_TO_PROCESS', context: { fecha_in: '2026-10-08' }, text_includes: [/48 horas/, /6 meses/, /no se devuelve el dinero/i, /saldo a favor/], odoo_called: false } },
  ] },
  { id: 'CEO-04', title: 'Quiero cancelar, llego mañana -> escalar excepcion', turns: [
    { say: 'Quiero cancelar, llego mañana', expect: { classification: 'GUEST_RESERVED', escalation: 'CANCELLATION_EXCEPTION', actions_include: ['ESCALATE_HUMAN'], text_excludes: [/6 meses/, /saldo a favor/], odoo_called: false } },
  ] },
  { id: 'CEO-05', title: 'Booking me sale mas barato -> no discutir, escalar', turns: [
    { say: 'Booking me sale más barato', expect: { escalation: 'OTA_PRICE_COMPARISON', text_excludes: [...noPrice, /booking (tiene|cobra|es)/i, /igualar/i], odoo_called: false } },
  ] },
  { id: 'CEO-06', title: 'Somos cuatro para mañana -> no repite fecha/personas', turns: [
    { say: 'Somos cuatro para mañana', expect: { escalation: null, odoo_called: true, context: { total_personas: 4, fecha_in: '2026-10-04' }, text_includes: [/cuatro personas para mañana/i], text_excludes: [/para qué fecha/i, /cuántas personas/i, /qué fechas/i] } },
  ] },
  { id: 'CEO-07', title: 'Fragmentos Hola / somos dos / para mañana -> UNA respuesta contextual', turns: [
    { fragments: ['Hola', 'somos dos', 'para mañana'], expect: { escalation: null, odoo_called: true, context: { total_personas: 2, fecha_in: '2026-10-04' }, text_excludes: [/para qué fecha/i, /cuántas personas/i], custom: (r) => { if ((r.text.match(/Gracias por comunicarte/g) ?? []).length !== 1) throw new Error('saludo repetido o ausente'); } } },
  ] },
  { id: 'CEO-08', title: 'Ya no somos dos, somos tres -> actualiza contexto y re-consulta', turns: [
    { say: 'Somos dos para mañana', expect: { context: { total_personas: 2 }, odoo_called: true } },
    { say: 'Ya no somos dos, somos tres', expect: { context_before: { total_personas: 2 }, context: { total_personas: 3, fecha_in: '2026-10-04' }, odoo_called: true, text_includes: [/tres personas/i], text_excludes: [/Gracias por comunicarte/, /para qué fecha/i], custom: (r) => { if (r.context.precio_cotizado == null) throw new Error('no re-cotizo'); } } },
  ] },
  { id: 'CEO-09', title: 'Aliado pregunta disponibilidad -> B2B, no responde como huesped', turns: [
    { say: 'Hola, soy de una agencia, ¿tienes disponibilidad para un cliente mío el 14 de noviembre?', expect: { classification: 'ALLY_B2B', escalation: 'ALLY_B2B', text_null: true, odoo_called: false } },
  ] },
  { id: 'CEO-10', title: 'Mensaje de camaras/alarmas -> ATHERON_SECURITY, no flujo hotel', turns: [
    { say: 'Se activó la alarma y las cámaras de la sede muestran una falla', expect: { classification: 'ATHERON_SECURITY', escalation: 'ATHERON_SECURITY', text_null: true, odoo_called: false } },
  ] },
  { id: 'CEO-11', title: '150 personas -> STRATEGIC_GROUP_LEAD, multipropiedad, sin descuento inventado, aprobacion', inventory: 'big', turns: [
    { say: 'Necesito alojamiento para 150 personas', expect: { classification: 'GUEST_LEAD', escalation: 'STRATEGIC_GROUP_LEAD', actions_include: ['ALERTA_HUMANO'], odoo_called: false, context: { total_personas: 150, group_tier: 'STRATEGIC_GROUP_LEAD' }, text_includes: [/fecha de entrada y de salida/i], text_excludes: [/cuántas personas/i, /\$\s?\d/, /descuento de/i] } },
    { say: 'Del 20 al 23 de noviembre, vamos con 12 carros', expect: { odoo_called: true, escalation: 'STRATEGIC_GROUP_LEAD', actions_include: ['GROUP_PRICING_APPROVAL', 'ALERTA_HUMANO'], text_includes: [/tarifa especial/i, /equipo comercial/i, /sin descuentos/i], text_excludes: [/\d+\s?%/, /para qué fecha/i, /Gracias por comunicarte/],
      custom: (r) => {
        const g = r.group;
        if (!g.cubierto) throw new Error('no cubrio los 150');
        if (g.distribucion.length < 2) throw new Error('no es multipropiedad');
        if (g.distribucion.reduce((s, d) => s + d.huespedes, 0) !== 150) throw new Error('la suma no es 150');
        for (const d of g.distribucion) if (d.huespedes > d.capacidad_usada) throw new Error('excede capacidad real');
        if (g.descuento_aplicado !== 0 || r.group_pricing_approval.discount_applied !== 0 || r.group_pricing_approval.discount_authorized) throw new Error('descuento inventado');
        if (!r.group_pricing_approval.required) throw new Error('falta aprobacion');
        const base = g.distribucion.reduce((s, d) => s + d.base_total, 0);
        if (g.tarifa_base_odoo !== base || !base) throw new Error('tarifa base no viene de Odoo');
        const ex = r.escalation.summary.grupo && r.escalation.summary.resumen_ejecutivo;
        if (!ex) throw new Error('falta resumen ejecutivo');
        for (const k of ['fechas', 'noches', 'personas', 'capacidad_encontrada', 'propiedades_propuestas', 'tarifa_base_odoo', 'valor_total_preliminar', 'requerimientos', 'datos_faltantes']) if (!(k in ex)) throw new Error(`resumen ejecutivo sin ${k}`);
        if (r.context.noches !== 3) throw new Error('noches != 3');
      } } },
  ] },
];

/** Casos adicionales (no son las 11 pruebas CEO, refuerzan las reglas). */
export const CEO_SUPPLEMENT = [
  { id: 'SUP-01', title: 'Inventario total insuficiente para 150: no promete, informa capacidad, busca aliados', inventory: 'small', turns: [
    { say: 'Necesito alojamiento para 150 personas del 20 al 23 de noviembre', expect: { odoo_called: true, escalation: 'GROUP_CAPACITY_SHORTFALL', actions_include: ['ALLY_SEARCH', 'GROUP_PRICING_APPROVAL'], text_includes: [/aliados/i, /de las 150/], text_excludes: [/tenemos todo/i], custom: (r) => { if (r.group.cubierto) throw new Error('prometio cubrir'); if (r.group.faltan <= 0) throw new Error('faltan <= 0'); const used = r.group.distribucion.reduce((s, d) => s + d.huespedes, 0); if (used + r.group.faltan !== 150) throw new Error('cuentas no cierran'); } } },
  ] },
  { id: 'SUP-02', title: '35 personas (LARGE): alerta comercial siempre, aunque haya capacidad', turns: [
    { say: 'Somos 35 personas del 5 al 7 de diciembre', expect: { odoo_called: true, escalation: 'LARGE_GROUP_COMMERCIAL_ALERT', actions_include: ['ALERTA_HUMANO', 'GROUP_PRICING_APPROVAL'], text_includes: [/tarifa especial/i], text_excludes: [/\d+\s?%/], custom: (r) => { if (!r.group.cubierto) throw new Error('debia cubrir'); } } },
  ] },
  { id: 'SUP-03', title: '12 personas (GROUP_SALES): un solo hotel alcanza, precio base sin descuento', turns: [
    { say: 'Somos 12 personas del 5 al 7 de diciembre', expect: { odoo_called: true, escalation: 'GROUP_SALES_FLOW', actions_include: ['GROUP_PRICING_APPROVAL'], custom: (r) => { if (r.group.distribucion.length !== 1) throw new Error('debia ser una propiedad'); if (r.group.tier !== 'GROUP_SALES_FLOW') throw new Error('tier'); } } },
  ] },
  { id: 'SUP-04', title: '10 personas NO activa flujo de grupos', turns: [
    { say: 'Somos 10 personas del 5 al 7 de diciembre', expect: { odoo_called: true, context: { group_tier: null }, custom: (r) => { if (r.group) throw new Error('activo grupos'); } } },
  ] },
  { id: 'SUP-05', title: '"ya pague" nunca confirma reserva: humano valida', turns: [
    { say: 'Ya pagué, te envío el comprobante', expect: { classification: 'GUEST_RESERVED', escalation: 'PAYMENT_VALIDATION', text_excludes: [/reserva (esta|queda) confirmada\b(?! cuando)/i, /confirmad[oa]\./i], text_includes: [/valide/i], odoo_called: false } },
  ] },
  { id: 'SUP-06', title: 'Reserva de Booking: no se cancela automaticamente', turns: [
    { say: 'Quiero cancelar mi reserva de Booking, llego dentro de 10 días', expect: { escalation: 'OTA_RESERVATION_CHANGE', text_includes: [/plataforma/i], text_excludes: [/saldo a favor/i, /6 meses/], custom: (r) => { if (!r.escalation.summary.no_auto_change) throw new Error('permitio cambio automatico'); } } },
  ] },
  { id: 'SUP-07', title: 'Pregunta si es bot -> transparente, ofrece persona', turns: [
    { say: 'Hola, ¿eres un bot?', expect: { text_includes: [/asistente de atención de Hoteles Atero/i, /persona del equipo/i], text_excludes: [/Ángela|Angela|Marlon|soy una persona/i] } },
  ] },
  { id: 'SUP-08', title: 'Primer saludo con identidad Hoteles Atero, y no se repite', turns: [
    { say: 'Hola buenos días', expect: { classification: 'UNKNOWN', text_includes: [/Hola, buenos días\. Gracias por comunicarte con Hoteles Atero/], escalation: null, odoo_called: false } },
    { say: 'Somos tres', expect: { classification: 'GUEST_LEAD', text_excludes: [/Gracias por comunicarte/, /cuántas personas/i], text_includes: [/fecha/i], context: { total_personas: 3 } } },
  ] },
  { id: 'SUP-09', title: 'Memoria: no re-pregunta lo ya dicho aunque cambie de tema', turns: [
    { say: 'Somos 2 del 20 al 22 de octubre, queremos baño privado', expect: { context: { bano_preferencia: 'privado', total_personas: 2 } } },
    { say: '¿Cuánto cuesta?', expect: { text_excludes: [/para qué fecha/i, /cuántas personas/i, /Gracias por comunicarte/], odoo_called: true } },
  ] },
  { id: 'SUP-10', title: 'Error del Gateway: no inventa disponibilidad ni precio, escala', agent: { gatewayOpts: { fail: true } }, turns: [
    { say: 'Somos dos para mañana', expect: { escalation: 'GATEWAY_ERROR', text_excludes: [/\$\s?\d/, /te puedo ofrecer/i], odoo_called: true } },
  ] },
  { id: 'SUP-11', title: 'Odoo sin tarifa: no cotiza, escala', agent: { gatewayOpts: { noPrice: true } }, turns: [
    { say: 'Somos dos para mañana', expect: { escalation: 'QUOTE_UNAVAILABLE', text_excludes: [/\$\s?\d/] } },
  ] },
  { id: 'SUP-12', title: 'Confirmacion manual requerida por Odoo -> escalar', agent: { gatewayOpts: { manual: true } }, turns: [
    { say: 'Somos dos para mañana', expect: { escalation: 'MANUAL_CONFIRMATION_REQUIRED' } },
  ] },
  { id: 'SUP-13', title: 'Proveedor -> humano; spam -> ignorado', turns: [
    { say: 'Buenas, soy proveedor de lavandería, le ofrezco insumos', expect: { classification: 'SUPPLIER', text_null: true, escalation: 'SUPPLIER' } },
  ] },
  { id: 'SUP-14', title: 'Contacto de personal (registro) -> STAFF, humano', contacts: { role: 'STAFF' }, turns: [
    { say: 'Hola, ¿qué turno me toca?', expect: { classification: 'STAFF', text_null: true, escalation: 'STAFF' } },
  ] },
  { id: 'SUP-15', title: 'Spam: sin respuesta ni escalamiento', turns: [
    { say: 'Gana dinero rápido con bitcoin https://x.example', expect: { classification: 'SPAM_OTHER', text_null: true, escalation: null, odoo_called: false } },
  ] },
  { id: 'SUP-16', title: 'Cambio de fecha con 6 dias de aviso aplica la politica', turns: [
    { say: 'Quiero cambiar la fecha de mi reserva, llego dentro de 6 días', expect: { escalation: 'CANCELLATION_TO_PROCESS', text_includes: [/48 horas/, /se recalcula/i] } },
  ] },
  { id: 'SUP-17', title: 'Cancelar sin fecha: pregunta solo la fecha de llegada', turns: [
    { say: 'Necesito cancelar mi reserva', expect: { classification: 'GUEST_RESERVED', escalation: null, text_includes: [/fecha era tu llegada/i] } },
  ] },
  { id: 'SUP-18', title: 'Pide hablar con una persona -> escala', turns: [
    { say: 'Prefiero hablar con una persona', expect: { escalation: 'HUMAN_REQUESTED' } },
  ] },
  { id: 'SUP-19', title: 'Cotizacion estandar: un solo precio de Odoo + anticipo 50% + saldo', turns: [
    { say: 'Hola, somos 3 adultos del 20 al 23 de octubre', expect: { escalation: null, odoo_called: true, text_includes: [/50%/, /saldo/i], custom: (r) => { const t = r.context.precio_cotizado; if (r.context.anticipo + r.context.saldo !== t) throw new Error('anticipo+saldo != total'); if (r.context.noches !== 3) throw new Error('noches'); if (!/alternativa/i.test(r.text)) throw new Error('falta 1 alternativa'); } } },
  ] },
  { id: 'SUP-20', title: 'Sin disponibilidad: lo dice y ofrece otras fechas', agent: { gatewayOpts: { unavailable: () => true } }, turns: [
    { say: 'Somos 5 para el 20 de diciembre, 2 noches', expect: { odoo_called: true, escalation: null, text_includes: [/no veo disponibilidad/i], text_excludes: [/\$\s?\d/] } },
  ] },
];
