# ATH-LOOP-002 — Atheron × La Triada: flujo comercial real

> Construido el 22 de septiembre de 2026 en `loop/atheron-la-triada-002`, sobre
> `pilot/atheron-la-triada-001`. Orden e historia: Issue #52. El piloto técnico previo
> (Issue #48, PR #51) sigue como está: ver [piloto-la-triada.md](piloto-la-triada.md).
> Documento interno: **no se publica**.

## Qué cambia respecto al piloto técnico

| | ATH-PILOT-001 | ATH-LOOP-002 |
|---|---|---|
| Condición comercial | No constaba | **10% de comisión**, confirmada por el CEO |
| Naturaleza | Se suponía descuento al cliente | **Comisión del aliado a Atheron.** El cliente paga la cuenta entera |
| Quién pone el porcentaje | Lo tecleaba el local | Lo aplica el sistema |
| Dónde vive la verdad | El navegador | **El servidor** |
| Unicidad del código | «Prácticamente segura» | Comprobada contra el almacén |
| Doble redención | Nada lo impedía | Imposible: idempotente y con cerrojo |
| Registro | Copiar y pegar por WhatsApp | Automático. WhatsApp pasa a ser aviso |
| Pantallas | Una, técnica, para las dos partes | Cliente / local / control, separadas |

**El piloto técnico no se borra.** Sigue en `/piloto/la-triada` y es lo único que funciona
sin backend, así que es el plan B si el miércoles llega sin almacén provisionado. Dice lo
que es en cada pantalla.

---

## La economía: 10% de comisión, no de descuento

No es un matiz. Con descuento, el cliente paga 90.000 de una cuenta de 100.000. Con
comisión, el cliente paga 100.000 y La Triada le debe 10.000 a Atheron. Confundirlos
produce un descuadre que nadie detecta hasta la conciliación.

Sobre una cuenta de **$100.000**:

| Concepto | Importe | Estado |
|---|---|---|
| Consumo (lo que paga el cliente) | $100.000 | — |
| Comisión de La Triada a Atheron | $10.000 | **Confirmada por el CEO** |
| Crédito Atheron para el cliente | $5.000 | **Hipótesis del piloto** |
| Margen bruto de Atheron | $5.000 | **Hipótesis del piloto** |

Todo vive en `src/data/economia-red.ts`, parametrizado. Cambiar el reparto es tocar una
línea, no buscar cinco por el repositorio.

**El 5/5 no es política**, y la orden lo dice expresamente. Mientras `estadoReparto` no sea
`CONFIRMADA POR CEO`, las pantallas siguen siendo internas y sin enlazar, y el informe lo
avisa en cada corte. Un **guardián** rompe la construcción si crédito + margen dejan de
sumar exactamente la comisión: si no cuadraran, Atheron estaría regalando más de lo que
cobra —o quedándose de más— y el error viviría en silencio dentro de cada transacción.

### El Crédito Atheron no es crédito de hotel

Nace del consumo en un aliado, así que amarrarlo a hospedaje lo haría inservible para quien
ya vive en Zipaquirá. Se modela desde el primer día como crédito del **ecosistema**:
hospedajes, Atheron Security, experiencias y aliados de la red. Ampliar el ámbito después
obligaría a reescribir créditos ya emitidos, que son promesas hechas.

Vigencia de partida: **90 días** (`VIGENCIA_CREDITO_DIAS`). Un crédito sin caducidad es un
pasivo abierto para siempre; uno de una semana no le da a nadie tiempo de volver. Es un
parámetro, no una política.

---

## Las cinco pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| `/red/la-triada` | Cliente | **Una pulsación.** Activa, y ve su código, su QR y lo que gana |
| `/red/la-triada/validar` | La Triada | Escanea, escribe el valor de la cuenta, confirma |
| `/red/la-triada/seguimiento` | Cliente | «¿Cómo te fue?»: cinco caras y una casilla de incidencia |
| `/red/la-triada/informe` | Atheron | Informe semanal y conciliación. Pide token |
| `/red/la-triada/desde` | Cliente en el local | **QR inverso**: La Triada → Atheron |

Las cinco: `noindex, nofollow`, fuera del sitemap y **sin un solo enlace desde el sitio
público**. Una prueba automática recorre `src/` y falla si alguna página de fuera las
enlaza: que sea interno no puede depender de que nadie se despiste un martes.

### Cliente: una acción, y lo que gana primero

La cifra del crédito es lo más grande de la pantalla, antes que nada. Personas, WhatsApp y
consentimiento están **debajo del botón y plegados**: quien quiera darlos los da; quien no,
activa igual. Un campo obligatorio de más, en una pantalla que se abre de pie en la calle,
es gente que no activa.

No ve la comisión, ni el margen, ni el reparto. No es opacidad: el cliente no tiene ninguna
razón para entender cómo se reparte por dentro un acuerdo entre dos empresas, y contárselo
sólo le quita sitio a lo que sí le importa.

### La Triada: escanear, valor, confirmar

Nada más. No teclea porcentajes, no calcula, no copia registros, no manda WhatsApp. Si el
cliente dijo cuántos venían al activar, el campo de personas **llega relleno**: preguntar
dos veces el mismo dato es la definición de fricción.

Si la conexión se cae después de confirmar, volver a pulsar **no cobra dos veces**.

---

## El backend

Funciones serverless en `/api`, que es lo que Vercel ejecuta para cualquier framework que no
sea Next. **El sitio sigue siendo estático**: no se ha añadido ningún adaptador de Astro ni
se ha cambiado el modo de construcción, y las páginas se siguen generando igual.

| Endpoint | Método | Qué hace |
|---|---|---|
| `/api/activar` | POST | Crea la transacción y devuelve el código. Cuerpo opcional |
| `/api/transaccion?c=` | GET | Estado de un código. **Nunca devuelve el contacto** |
| `/api/redimir` | POST | Confirma el consumo. Idempotente. Con `cerrar: true`, cierra sin consumo |
| `/api/seguimiento` | POST | Satisfacción e incidencia de una visita redimida |
| `/api/reporte?fecha=` | GET | Informe semanal. Exige token de administración |

La lógica no vive en los endpoints: está en `api/_servicio.ts`, y por eso se prueba entera
sin levantar un servidor.

### Almacén

Redis por HTTP (Vercel KV o Upstash, mismo protocolo), con dos variables de entorno:

```
KV_REST_API_URL
KV_REST_API_TOKEN
```

**Si no están, la API responde 503 y lo dice.** No hay modo «memoria» en producción, y es
deliberado: en serverless cada petición puede tocar una instancia distinta, así que un
almacén en memoria daría la impresión de guardar y perdería una redención de cada dos. Un
backend que pierde datos en silencio es peor que no tener backend, porque nadie deja de
confiar en él a tiempo.

Las pantallas también lo dicen y **no dejan seguir**. Caer al navegador «mientras tanto»
sería repetir, con más pasos, justo el problema que este trabajo viene a resolver.

### Cómo se impide la doble redención

1. El código se escribe con «sólo si no existe»: la unicidad está **comprobada**, no
   estimada.
2. Antes de redimir se toma un **cerrojo de 30 segundos** por código: dos aparatos
   confirmando a la vez, un solo registro.
3. Redimir una transacción ya redimida **no es un error**: devuelve la primera respuesta con
   `yaRedimida: true`. Eso es lo que hace seguro reintentar.

### Otras variables

| Variable | Para qué | Si falta |
|---|---|---|
| `ATHERON_TOKEN_ADMIN` | Ver el informe semanal | El informe **no se sirve**. Nunca «abierto mientras tanto» |
| `ATHERON_WEBHOOK_EVENTOS` | Avisar a Atheron de activaciones y redenciones | No se manda nada. El registro no se pierde |

---

## Notificaciones: avisos, no base de datos

Cuando hay webhook configurado, Atheron recibe un evento por activación, por redención y por
seguimiento, con el código, la fuente, las personas y los importes. **Nunca el contacto del
cliente.**

Es una notificación, no el registro: el webhook puede fallar sin que se pierda ninguna
transacción, y por eso su error se traga —un aviso caído no puede tumbar una redención ya
guardada—.

**No se envía ningún mensaje a ningún cliente desde aquí.** Hacerlo necesita consentimiento
y una decisión de dirección. Lo que sí está montado: el consentimiento se pide de forma
expresa, se guarda con su fecha, y sin él el teléfono **no se guarda**.

---

## Trazabilidad y minimización

Se registra: código, aliado, fuente, originador, activación, redención, personas, consumo,
comisión, crédito, margen, estado, satisfacción e incidencia.

No se registra: nombre, correo, documento, mesa ni nada que identifique a una persona,
**salvo** un WhatsApp dado a propósito para que le escriban. Sin consentimiento el campo no
existe: no se guarda «por si acaso». Un piloto que empieza guardando teléfonos «para luego»
acaba con una lista que nadie sabe de dónde salió.

La fila de conciliación **no lleva el contacto**: la conciliación es de dinero, y una hoja
que circula entre dos empresas es el último sitio donde debe acabar un dato personal.

### El originador: Josué

La relación con La Triada la originó Josué. Se **registra** con su nombre desde la primera
transacción: si se empezara a registrar después, las primeras ventas —justo las que
demuestran que la relación valía— se quedarían sin atribuir para siempre.

Lo que **no** se hace es asignarle porcentaje ni calcular pago. No hay política de
originadores, y el guardián de `economia-red.ts` rompe el build si alguien escribe un
porcentaje sin política detrás. **Registrar no es pagar.**

---

## Informe semanal y conciliación

Lunes a domingo, hora de Colombia. Una transacción cuenta en la semana en que **se redimió**,
no en la que se activó: lo que se factura es consumo. La conversión se calcula sobre las
activaciones de la semana —al revés daría 100% siempre, que es el tipo de cifra que queda
muy bien y no significa nada—.

Trae: activaciones, personas previstas, redenciones, conversión, personas atendidas, consumo
atribuido, comisión, crédito generado, margen, reparto por fuente, satisfacción media,
incidencias, y la lista fila a fila para cuadrar cualquier número.

Arriba del todo, **antes que las cifras**, la comprobación de conciliación: recalcula los
totales desde cero y dice si cuadran. Un informe descuadrado que parece correcto es peor que
uno que no se genera.

---

## QR inverso: La Triada → Atheron

Un QR en la mesa, para quien ya está comiendo allí y no conoce Atheron
(`/red/la-triada/desde`). Lleva a una página que **guarda de dónde vino** (fuente
`qr-local`) antes de mandar a nadie a ninguna parte: si llevara directo a `/hospedajes`, esa
visita entraría como tráfico directo y, si reserva tres semanas después, nadie podría
decirle a La Triada que ese huésped salió de su mesa.

**No fija ninguna comisión inversa.** Cuánto —si algo— cobra La Triada por un huésped que
llegue así es una decisión de dirección que no se ha tomado. Lo que se deja montado es la
atribución, que es la parte que no se puede reconstruir a posteriori.

---

## Odoo

Sigue sin integración, sin credenciales y sin campos inventados. El mapeo campo a campo está
en [piloto-la-triada.md](piloto-la-triada.md) y ahora hay un dato más que mapear:

| Columna nueva | Modelo | Campo |
|---|---|---|
| `comision_cop` | `sale.order.line` | `discount` sobre la línea de comisión, o una línea propia de servicio |
| `credito_cop` | — | **No tiene campo estándar.** Es un pasivo hacia el cliente: cuenta contable o campo de Studio, y lo decide dirección |
| `originador` | `crm.lead` | `referred` (campo estándar, «Referido por») |
| `fuente` | `utm.source` | `name` |

El crédito es lo único que Odoo no sabe representar de fábrica, y **no se inventa un campo**:
queda anotado como decisión pendiente.

---

## Pruebas

```bash
npm run prueba-loop002        82 pruebas: economía, transacciones, backend, informe
npm run prueba-humo-loop002   recorrido completo en iPhone contra la API real
npm run prueba-piloto         48 (ATH-PILOT-001, siguen pasando)
npm run prueba-qr             17
npm run prueba                42
npm run prueba-jornadas       25
npm run build                 correcto — 43 páginas
```

`prueba-humo-loop002` no simula la API: **levanta los endpoints reales** contra un almacén en
memoria y los recorre con un navegador de verdad. Si el cliente activa, es el servicio real
el que genera el código; si el local confirma dos veces, es la idempotencia real la que lo
evita.

Lighthouse móvil sobre el build comprimido: las tres pantallas del recorrido, **100 / 100 /
100**. El SEO marca 66 por el `noindex`, que es justo lo buscado.

---

## Gates de dirección

1. **Provisionar el almacén** (Vercel KV o Upstash) y cargar `KV_REST_API_URL` y
   `KV_REST_API_TOKEN`. Tiene coste y credenciales: es decisión de dirección. **Sin esto, el
   flujo de ATH-LOOP-002 no funciona**, y lo dice en pantalla.
2. **Confirmar o cambiar el reparto 5/5.** Hoy es una hipótesis declarada.
3. **Política de originadores** (Josué): modelado sí, pago no.
4. **Comisión inversa** del QR de La Triada, si la hay.
5. **Dónde se sirve la prueba**: vista previa de Vercel accesible desde el móvil, o merge
   —prohibido sin orden expresa—.
6. **Enviar mensajes al cliente** (WhatsApp/correo): necesita base legal y decisión.
7. **Conectar Odoo**, y decidir cómo se representa el Crédito Atheron.
8. **Publicar el beneficio en la ficha pública.** Hoy nada de esto se enlaza desde el sitio.

## Lo que deliberadamente no se hizo

- **No se tocó la ficha pública de La Triada.** Sigue exactamente igual.
- **No se borró el piloto técnico.** Es el plan B sin backend.
- **No se añadió ninguna dependencia**, ni de servidor ni de navegador.
- **No se mandó ningún mensaje** a ningún cliente, ni se dejó preparado que se mande solo.
- **No se tocó Odoo**, ni se supuso ninguna credencial.
- **No se fijó ninguna condición que el CEO no haya confirmado**, y lo que es hipótesis se
  llama hipótesis en el código, en la pantalla de control y en el informe.
