/**
 * ATH-HOTELS-SIRE-TRA-001 · Incremento 1: estructura vacia (sin datos, sin vistas, sin automatizaciones).
 * LISTA EXPLICITA de lo unico que el script puede crear. Cualquier otra cosa se rechaza.
 * Sin valores predeterminados de negocio (p. ej. el codigo SIRE se deja vacio: va por establecimiento).
 */
export const INC1_NEW_MODELS = Object.freeze([
  { model: 'x_establishment', name: 'Establecimiento (SIRE/TRA)' },
]);

const sel = (...pairs) => pairs.map(([value, name], i) => ({ value, name, sequence: i + 1 }));

/** [modelo, nombre_campo, ttype, etiqueta, extra] */
export const INC1_FIELDS = Object.freeze([
  // --- x_establishment (modelo nuevo; PROPERTY_ID independiente del PMS) ---
  ['x_establishment', 'x_name', 'char', 'Nombre', { required: true }],
  ['x_establishment', 'x_code', 'char', 'Codigo de propiedad (PROPERTY_ID)', { required: true }],
  ['x_establishment', 'x_address_partner_id', 'many2one', 'Direccion (contacto)', { relation: 'res.partner' }],
  ['x_establishment', 'x_rnt_number', 'char', 'Numero RNT', {}],
  ['x_establishment', 'x_rnt_holder_id', 'many2one', 'Titular del RNT', { relation: 'res.partner' }],
  ['x_establishment', 'x_rnt_category', 'char', 'Categoria RNT', {}],
  ['x_establishment', 'x_rnt_expiry', 'date', 'Vencimiento RNT', {}],
  ['x_establishment', 'x_operator_company_id', 'many2one', 'Operador (compania)', { relation: 'res.company' }],
  ['x_establishment', 'x_sire_reporter_id', 'many2one', 'Quien reporta a SIRE', { relation: 'res.partner' }],
  ['x_establishment', 'x_sire_company_code', 'char', 'Codigo SIRE del establecimiento', {}],
  ['x_establishment', 'x_sire_city_code', 'char', 'Codigo SIRE de ciudad', {}],
  ['x_establishment', 'x_sire_verified_on', 'date', 'Datos SIRE verificados el', {}],
  ['x_establishment', 'x_tra_mode', 'selection', 'Modo TRA', { selection: sel(['manual', 'Manual'], ['api', 'API'], ['no_aplica', 'No aplica']) }],
  ['x_establishment', 'x_analytic_account_id', 'many2one', 'Cuenta analitica', { relation: 'account.analytic.account' }],
  ['x_establishment', 'x_active', 'boolean', 'Activo', {}],
  // --- resource.resource (unidades; Casa Completa = derivada, no sexta habitacion) ---
  ['resource.resource', 'x_establishment_id', 'many2one', 'Establecimiento', { relation: 'x_establishment' }],
  ['resource.resource', 'x_unit_kind', 'selection', 'Tipo de unidad', { selection: sel(['fisica', 'Fisica'], ['derivada', 'Derivada']) }],
  ['resource.resource', 'x_component_ids', 'many2many', 'Unidades componentes', {
    relation: 'resource.resource', relation_table: 'x_resource_component_rel', column1: 'x_parent_id', column2: 'x_component_id' }],
  // --- x_guests_line (participacion de cada huesped; ya existe, viene de booking_engine) ---
  ['x_guests_line', 'x_doc_type_id', 'many2one', 'Tipo de documento', { relation: 'l10n_latam.identification.type' }],
  ['x_guests_line', 'x_given_names', 'char', 'Nombres', {}],
  ['x_guests_line', 'x_surname_1', 'char', 'Primer apellido', {}],
  ['x_guests_line', 'x_surname_2', 'char', 'Segundo apellido', {}],
  ['x_guests_line', 'x_residence_city_id', 'many2one', 'Ciudad de residencia', { relation: 'res.city' }],
  ['x_guests_line', 'x_residence_text', 'char', 'Residencia (texto, extranjero)', {}],
  ['x_guests_line', 'x_residence_country_id', 'many2one', 'Pais de residencia', { relation: 'res.country' }],
  ['x_guests_line', 'x_origin_city_id', 'many2one', 'Ciudad de procedencia', { relation: 'res.city' }],
  ['x_guests_line', 'x_origin_text', 'char', 'Procedencia (texto, extranjero)', {}],
  ['x_guests_line', 'x_origin_country_id', 'many2one', 'Pais de procedencia', { relation: 'res.country' }],
  ['x_guests_line', 'x_is_main', 'boolean', 'Huesped principal', {}],
  ['x_guests_line', 'x_consent', 'boolean', 'Consentimiento de tratamiento de datos', {}],
  ['x_guests_line', 'x_consent_at', 'datetime', 'Fecha del consentimiento', {}],
  ['x_guests_line', 'x_data_state', 'selection', 'Estado de los datos', { selection: sel(['borrador', 'Borrador'], ['recibido', 'Recibido'], ['validado', 'Validado'], ['no_valido', 'No valido']) }],
  ['x_guests_line', 'x_data_source', 'selection', 'Origen de los datos', { selection: sel(['formulario', 'Formulario'], ['recepcion', 'Recepcion'], ['contingencia_smoobu', 'Contingencia Smoobu']) }],
  ['x_guests_line', 'x_validated_at', 'datetime', 'Validado el', {}],
]);

/** Modelos existentes que el script lee (precheck) y/o a los que agrega campos. */
export const INC1_EXISTING_MODELS = Object.freeze(['resource.resource', 'x_guests_line', 'res.partner', 'res.company', 'res.city', 'res.country', 'l10n_latam.identification.type', 'account.analytic.account']);

/** Lo UNICO que se escribe: create en estos dos modelos tecnicos. Nada de write/unlink. */
export const INC1_ALLOWED_WRITES = Object.freeze([['ir.model', 'create'], ['ir.model.fields', 'create']]);
