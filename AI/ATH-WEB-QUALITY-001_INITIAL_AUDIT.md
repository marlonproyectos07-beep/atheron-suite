# ATH-WEB-QUALITY-001 — Auditoría pública inicial

Fecha: 2026-10-01
URL auditada: https://hotelesatheron.com/hospedajes/hotel-atheron-suite
Modo: solo lectura / sin cambios en Production

## Hallazgos visibles inmediatos

### Bloqueo / alto
1. Texto técnico residual "banos" aparece repetido junto a varias habitaciones. Debe eliminarse del DOM/copy visible.
2. Hay múltiples tildes omitidas en contenido comercial visible:
   - "mas" -> "más"
   - "estas" -> "estás" cuando corresponde
   - "dias" -> "días"
   - "caracteristicas" -> "características"
   - "musica" -> "música"
   - "opcion" -> "opción"
   - "numero" -> "número"
   - "direccion" -> "dirección"
   - "esta" -> "está"
   - "operacion" -> "operación"
   - "consultalo" -> "consúltalo"
   - "estadias" -> "estadías"
   - "periodico" -> "periódico"
   - "renovacion" -> "renovación"
   - "sabanas" -> "sábanas"
   - "electronica" -> "electrónica"
   - "solicitala" -> "solicítala"
   - "cuentanos" -> "cuéntanos"
3. Copy principal actual: "Pensado para quedarse mas de una noche sin sentir que estas en un hotel de paso." requiere corrección ortográfica y revisión de tono premium.
4. "1,4 km A la Catedral de Sal" debe corregirse a "1,4 km a la Catedral de Sal".
5. Se muestra "Hasta 22 huéspedes" para Casa Completa; esta capacidad debe seguir alineada con Odoo/Booking para evitar divergencia comercial.

### Medio
6. Algunas frases usan "casa completa" aunque el activo se presenta como hotel/suite; revisar consistencia semántica y SEO por intención.
7. En Suite 301 aparece capacidad tarifada hasta 7 personas y texto "ideal para cuatro a seis"; revisar consistencia entre capacidad comercial, extraordinaria y capacidad maestra.
8. La sección de ubicación mezcla atracciones muy lejanas de Bogotá (Andino/El Campín/Corferias); evaluar si aportan SEO o distraen la intención local Zipaquirá.
9. El CTA depende fuertemente de WhatsApp; cuando el flujo de reserva directa esté listo, agregar CTA de reserva directa sin retirar WhatsApp.
10. La mención "Antes se llamaba Hospedaje La Magia de Zipaquirá" puede ser útil para continuidad de marca, pero debe revisarse su valor SEO/reputacional y no dominar el nuevo branding.

### Bien resuelto
11. Hay una estructura H1/H2/H3 comprensible.
12. La página tiene contenido específico por habitación.
13. Alt text descriptivo existe para muchas imágenes.
14. Hay información de check-in/check-out, ubicación, parqueadero, equipaje, aseo y facturación.
15. CTAs de WhatsApp están presentes en múltiples puntos.
16. La dirección y el teléfono son visibles.
17. Se explican claramente baño privado/compartido y amenidades.

## Próxima revisión técnica

Pendiente:
- title/meta description/canonical
- schema.org Hotel/LodgingBusiness
- sitemap
- robots
- Open Graph
- performance/Lighthouse
- peso y dimensiones de imágenes
- lazy loading
- CLS/LCP
- enlaces rotos
- contraste/accesibilidad
- revisión móvil
- inventario completo de fotos faltantes o repetidas

## Regla de ejecución

No publicar correcciones directamente. Primero preparar cambios en rama/PR, validar build y Preview, y solo después pedir aprobación de publicación.
