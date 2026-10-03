# Recomendación técnica: RULES_ONLY vs HYBRID_LLM_RULES

Estado: **recomendación, sin implementar.** Implementar un LLM requiere autorización separada.

## Evidencia (primeras pasadas ciegas, mismo motor)

| Medición | Casos | Primera pasada | HIGH_RISK |
|---|---|---|---|
| Held-out/ciegos V1 | 30–15 | 53–77 % | n/m |
| CANONICAL-20 | 20 | 35 % | n/m |
| BLIND V2 | 50 | 56 % | 4 |
| BLIND V3 | 100 | **71 %** | **4 (3 reales)** |

Cada set nuevo destapa familias de frases nuevas; tras corregirlas el set sube a ~100 % pero el siguiente vuelve a caer.
En V3, 15 de 29 fallos fueron léxicos y 12 de esos se salvaron solo por el fallback seguro: el motor no hace daño, pero **deriva a humano lo que debería entender**, así que en SUPERVISED/AUTO no ahorraría trabajo.

## RULES_ONLY_ASSESSMENT

- **Fortalezas reales:** política comercial exacta (anticipo por canal, cancelación 48 h, horarios), seguridad (pagos, descuentos, OTA, grupos, Security), kill switch, Odoo solo lectura, determinismo y auditoría.
- **Debilidad estructural:** la comprensión de lenguaje (coloquial, errores, abreviaturas, audios, contexto) depende de listas de palabras. No converge: la cobertura crece con cada set pero nunca se cierra, y cada regla nueva puede romper otra (ya pasó: «para dos?» rompió T12).
- **Conclusión:** como motor completo, RULES_ONLY no es una vía creíble hacia ≥90 % ciego sostenido. Como capa de reglas de negocio y seguridad, es lo correcto y debe conservarse.

## HYBRID_LLM_RULES_RECOMMENDATION: **recomendado**

Reparto de responsabilidades:

| Capa | Responsable | Decide |
|---|---|---|
| Comprensión | **LLM** (salida JSON con esquema fijo: intención, entidades, confianza) | Solo *qué dijo* el cliente. Nunca precios, políticas, cupos ni dinero |
| Guardarraíles de seguridad | **Reglas** (sobre el texto crudo, antes y después del LLM) | Pago/comprobante, descuento, OTA, grupos ≥11/30/100, Security, cancelación. **Solo pueden escalar más, nunca menos**: el LLM no puede degradar una escalación |
| Reglas de negocio | **Reglas deterministas** | Anticipo por canal, cancelación 48 h, horarios, DATA_GAP, qué consultar a Odoo |
| Texto al cliente | **Plantillas aprobadas** (o LLM validado por `lintReply` con montos permitidos) | Redacción; sin cifras que no vengan de Odoo/política |
| Salida | Kill switch + modo shadow | Nada sale sin humano |

Reglas de diseño:
- Confianza < 0.6, esquema inválido, timeout o proveedor caído → `ESCALATE_HUMAN` (o motor actual de reglas como degradación).
- El LLM corre primero **en SHADOW paralelo**: se compara su intención con la del motor de reglas sobre los sets congelados (V2, V3) y sobre tráfico real, sin enviar nada.
- Defensa contra inyección de instrucciones en el mensaje del cliente: el LLM solo clasifica, no ejecuta ni redacta políticas.
- Privacidad: anonimizar nombres, teléfonos y cuentas antes de enviar a un proveedor; revisar tratamiento de datos.
- Modelo pequeño y rápido (clase Haiku) suficiente para clasificar; coste y latencia bajos. Los sets V1–V3 y el Playbook se reutilizan como batería de regresión.

Criterio para considerar SUPERVISED (nuevo set ciego, no visto): **≥ 90 % en primera pasada y 0 HIGH_RISK**, más un set adversarial (inyección, mensajes contradictorios) y revisión humana de una muestra de tráfico real en SHADOW.

## Decisiones que necesita Control Maestro

1. Autorizar o no un piloto SHADOW del híbrido (proveedor, presupuesto, tratamiento de datos).
2. Proveer **mensajes reales anonimizados** (el repo no tiene corpus crudo; V3 es 61 % variante / 39 % sintético, 0 % literal real).
3. Confirmar el umbral de entrada a SUPERVISED.
