# Piloto Atheron × La Triada — ATH-PILOT-001

> Construido el 22 de septiembre de 2026 en `pilot/atheron-la-triada-001`, sobre `main`.
> Orden e historia: Issue #48. Contexto de la red: [red-atheron-zipaquira.md](red-atheron-zipaquira.md).
> Documento interno: **no se publica**, y no contiene condiciones comerciales.

## Para qué existe

Que Marlon recorra con su móvil, en el local y como un cliente más, el circuito completo:

```
Atheron → ficha de La Triada → activar beneficio → ATH-TRI-XXXXX
        → validación en el restaurante → consumo → descuento real
        → REDIMIDO → trazabilidad
```

Prueba física prevista: **miércoles 23 de septiembre de 2026**.

---

## Lo primero: el 10% no está publicado, y no puede estarlo

La orden fija el 10% como **objetivo** del piloto. Objetivo no es acuerdo. En este
repositorio no consta evidencia verificable: ni quién lo acordó, ni cuándo, ni sobre qué
base se calcula, ni qué queda excluido, ni hasta cuándo vale.

Mientras eso siga así:

- `BENEFICIO.estado` vale `PENDIENTE DE VERIFICACIÓN CEO` en `src/data/piloto-la-triada.ts`;
- **no aparece ningún porcentaje** en ninguna página, ni en el código;
- el descuento que se aplique lo **teclea el local en el momento** y se registra tal cual,
  como lo que es: lo que se aplicó en esa mesa, no una condición anunciada por Atheron.

Anunciar un 10% que el local no ha aceptado es una promesa que acaba pagando el aliado, y
con ella se acaba el piloto. Por eso no depende de que nadie se acuerde: hay un **guardián**
que rompe la construcción si alguien escribe una condición sin verificarla.

**Para publicarla** hay que rellenar en `BENEFICIO` el porcentaje, la base, las exclusiones,
la vigencia y **dónde consta**, y poner `estado: 'VERIFICADO'`. El bloque público aparece
solo; ni la maqueta ni el CSS cambian.

---

## Lo segundo: esto no está publicado

Las tres páginas salen con `noindex, nofollow`, fuera del sitemap y **sin un solo enlace
desde el sitio público**. La ficha de La Triada no cambia ni una palabra.

El interruptor es `ENLAZADO_EN_FICHA` (hoy `false`). Ponerlo en `true` exige **las dos**
cosas: la condición verificada *y* la autorización expresa de Marlon. La primera la
comprueba el guardián; la segunda es una firma, no un campo.

Además, `npm run prueba-piloto` recorre `src/` y falla si alguna página fuera del piloto
enlaza a `/piloto/`: que sea interno no depende de que nadie se despiste.

---

## Las tres pantallas

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `/piloto/la-triada` | El huésped (Marlon en la prueba) | Genera `ATH-TRI-XXXXX`, lo pinta grande con su QR y su hora de caducidad |
| `/piloto/la-triada/validar` | La Triada | Comprueba el código, recoge consumo y porcentaje, cierra la redención |
| `/piloto/la-triada/registro` | Atheron | QR de papel, lo registrado en ese aparato, y el mapeo a Odoo |

Móvil primero, de verdad: una columna de 360 px, nada que tocar por debajo de 48 px de
alto, y campos de 16 px —por debajo, Safari en iPhone hace zoom solo al enfocar y descoloca
la pantalla entera—.

---

## El identificador

Formato `ATH-<ALIADO>-<5 caracteres>`, el mismo que ya usaba la captación de grupos. Lo que
cambia es que **el quinto carácter ya no es azar**: es un carácter de control calculado
sobre los otros cuatro (`src/data/codigos-referido.ts`).

El alfabeto tiene 31 caracteres —sin `O`, `I`, `L`, `0` ni `1`, que se confunden al
dictarlos— y 31 es primo. Con una suma ponderada módulo 31 eso basta para detectar:

- **cualquier** carácter mal copiado;
- **cualquier** intercambio de dos caracteres contiguos.

No son los errores teóricos: son los dos que ocurren de verdad cuando alguien dicta un
código por encima del ruido de un restaurante. `npm run prueba-piloto` los prueba **todos**,
no tres ejemplos: todas las sustituciones en todas las posiciones y todos los intercambios.

### Lo que el código NO es

- **No autentica.** El cálculo es público: quien lea el archivo puede fabricar uno que pase
  la comprobación. Distingue un código mal copiado de uno bien copiado, nada más.
- **No es único garantizado.** Son cuatro caracteres al azar entre 923.521 combinaciones,
  generados con `crypto.getRandomValues`. Sin servidor no hay registro que lo compruebe.
  Para un piloto de un día es despreciable; despreciable no es cero.
- **No prueba un convenio** ni registra comisión alguna.

---

## Estados

| Estado | Qué significa |
|---|---|
| `ACTIVADO` | El huésped lo pidió. No prueba que fuera al local |
| `VALIDADO` | El local comprobó el código. Está en la mesa |
| `REDIMIDO` | Hubo consumo y se aplicó descuento. **El único que vale como venta atribuida** |
| `NO_REDIMIDO` | Se cerró sin consumo, o el código caducó |

`NO_REDIMIDO` no es un fracaso que esconder: sin él, el piloto sólo sabría contar éxitos y
la tasa de conversión sería mentira.

**Vigencia:** hasta el final del día colombiano en que se activó. Colombia es UTC−5 todo el
año, así que el desfase es una constante y no hace falta ninguna librería. La trampa está
en que a las 22:00 de Colombia en UTC ya es el día siguiente: una resta ingenua caducaría
el código cinco horas antes de tiempo. Está probado en los dos bordes, al milisegundo.

---

## El registro

Una línea por movimiento, separada por `|` y no por comas —las observaciones llevan comas,
y un CSV con comas obliga a entrecomillar, que es justo lo que se rompe al pegar a mano en
una hoja—:

```
piloto|codigo|aliado|sello|estado|consumo_cop|descuento_pct|descuento_cop|total_cop|nota
ATH-PILOT-001|ATH-TRI-K7M2Q|la-triada|2026-09-23T13:40:05-05:00|REDIMIDO|120000|10|12000|108000|Mesa 4
```

### Dónde vive de verdad

**En la conversación de WhatsApp de Atheron.** El navegador guarda el estado por comodidad,
pero el `localStorage` es de cada dispositivo: lo que active el huésped en su móvil no se ve
en el del restaurante, y borrar los datos del navegador lo borra. Por eso la pantalla de
validación **no marca nada como registrado**: dice que lo estará cuando el mensaje se haya
enviado, y quien pulsa enviar es una persona.

Es la misma regla que ya rige el formulario de grupos, y viene de un formulario que
respondía «recibimos tu mensaje» sin enviar nada.

---

## Odoo: mapeo preparado, integración no

**Nada de esto escribe en Odoo.** No hay credenciales, no hay endpoint y no se ha supuesto
ninguno. Lo que hay es la correspondencia exacta, con **campos estándar**, para importar el
día que dirección lo autorice:

| Columna del registro | Modelo | Campo | Nota |
|---|---|---|---|
| `codigo` | `sale.order` | `client_order_ref` | Campo estándar de texto: la referencia del cliente |
| `piloto` | `utm.campaign` | `name` | Campaña «ATH-PILOT-001», enlazada en `sale.order.campaign_id` |
| `aliado` | `utm.source` | `name` | Origen «Atheron — Guía Zipaquirá», en `sale.order.source_id` |
| `sello` | `sale.order` | `date_order` | Lleva el desfase `−05:00` escrito; Odoo guarda en UTC y convierte |
| `consumo_cop` | `sale.order.line` | `price_unit` | O la suma de las líneas, si se desglosa por producto |
| `descuento_pct` | `sale.order.line` | `discount` | Porcentaje, que es lo que el campo espera |
| `descuento_cop` | — | — | Se deduce; no se importa |
| `total_cop` | `sale.order` | `amount_total` | Lo calcula Odoo. Sirve para cuadrar |
| `nota` | `sale.order` | `note` | Texto libre del pedido |

**El estado del referido no tiene campo estándar, y no se inventa uno.** Se lee del propio
pedido:

| Estado del piloto | `sale.order.state` |
|---|---|
| `VALIDADO` | `draft` / `sent` (presupuesto) |
| `REDIMIDO` | `sale` (pedido confirmado) |
| `NO_REDIMIDO` | `cancel` |

`ACTIVADO` no tiene equivalente en Odoo y no debe tenerlo: activar no es una operación
comercial. Si más adelante hace falta el estado como dato propio, es un campo de Studio
(`x_`) y una decisión de dirección, no un apaño del importador.

---

## Cómo hacer la prueba del 23

Hace falta **una dirección accesible desde el móvil**: ver los gates de abajo.

1. Abrir `/piloto/la-triada` en el móvil. Pulsar **Activar mi beneficio**.
2. Comprobar que aparece el código, el QR y la hora de caducidad.
3. En el local, escanear el QR con otro teléfono (abre `/validar?c=…` con el código puesto)
   o dictar los cinco caracteres del final y teclearlos.
4. Comprobar que un código mal dictado **se rechaza con una explicación**, no con un error.
5. Registrar el consumo real y el porcentaje que el local aplique. Comprobar la cuenta.
6. **Registrar redención** y **enviar el mensaje por WhatsApp**. Hasta que el mensaje no
   esté enviado, no hay registro.
7. Abrir `/piloto/la-triada/registro` y copiar la línea a la hoja de control.

Probar también lo que se rompe: cerrar sin consumo, un código de otro aliado, un código con
una letra cambiada, y recargar la pantalla a media faena.

---

## Pruebas que quedan en el repositorio

```bash
npm run prueba-piloto   # 48 pruebas: código, caducidad, dinero, registro, disciplina comercial
npm run prueba-qr       # el generador de QR, módulo a módulo contra la referencia
npm run prueba          # 42 pruebas de mínimo publicable (ya existían)
npm run comprueba       # contenido, fotos y calendario (ya existía)
```

`npm run prueba-qr` compara la matriz del generador propio con la del paquete `qrcode` de
npm para siete cadenas y cinco versiones distintas —incluidas las que llevan patrones de
alineación e información de versión—. La comparación es módulo a módulo: no se parece, es
idéntica. El paquete se instala sólo para eso (`npm install --no-save qrcode`) y **no entra
en el repositorio**: un QR mal generado no avisa, se dibuja igual de bonito y simplemente no
escanea.

---

## Gates humanos: lo que este piloto NO puede decidir

1. **Publicar cualquier condición comercial**, el 10% incluido. Hace falta evidencia
   verificable del acuerdo con La Triada: alcance, base, exclusiones, vigencia y dónde
   consta.
2. **Dónde se sirve la prueba.** Hoy el piloto sólo existe en su rama. Para recorrerlo desde
   un móvil hace falta una dirección accesible: una vista previa de Vercel abierta a ese
   dispositivo, o el merge a la rama que publica —que está prohibido sin orden expresa—.
   Esta es la decisión que bloquea la prueba del miércoles.
3. **Enlazar el piloto desde la ficha pública** (`ENLAZADO_EN_FICHA`).
4. **Conectar Odoo.** Credenciales, permisos y alcance son decisión de dirección.
5. **Imprimir el QR de papel.** El que genera `/registro` apunta al dominio oficial, así que
   sólo sirve después de publicar allí. Imprimirlo antes es repartir un papel que lleva a un
   404.

---

## Lo que deliberadamente no se hizo

- **No se tocó la ficha pública de La Triada.** Sigue exactamente como estaba.
- **No se inventó ningún dato del local**: ni dirección, ni horarios, ni carta, ni
  capacidad. Lo que falta confirmar sigue en [red-atheron-zipaquira.md](red-atheron-zipaquira.md).
- **No se añadió ninguna dependencia.** El generador de QR es propio, ~9 KB, y se usa en las
  dos mitades: al construir el QR de papel y en el navegador para el del código.
- **No se montó un backend falso.** Un endpoint que respondiera «registrado» sin registrar
  nada sería exactamente el error que este repositorio ya pagó una vez.
