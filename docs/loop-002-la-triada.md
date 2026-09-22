# ATH-LOOP-002 — Atheron × La Triada: flujo comercial real

> Construido el 22 de septiembre de 2026 en `loop/atheron-la-triada-002`, sobre
> `pilot/atheron-la-triada-001`. Orden e historia: Issue #52. El piloto técnico previo
> (Issue #48, PR #51) sigue como está: ver [piloto-la-triada.md](piloto-la-triada.md).
> Documento interno: **no se publica**.
>
> **Corregido dos veces el 22 de septiembre de 2026**, tras dos auditorías independientes
> adversariales (las dos con veredicto C). Lo que encontraron y lo que se hizo está en
> §«Después de la auditoría» y §«Después de la reauditoría», al final.

## Qué cambia respecto al piloto técnico

| | ATH-PILOT-001 | ATH-LOOP-002 |
|---|---|---|
| Condición comercial | No constaba | **10% de comisión**, confirmada por el CEO |
| Naturaleza | Se suponía descuento al cliente | **Comisión del aliado a Atheron.** El cliente paga la cuenta entera |
| Quién pone el porcentaje | Lo tecleaba el local | Lo aplica el sistema |
| Dónde vive la verdad | El navegador | **El servidor** |
| Unicidad del código | «Prácticamente segura» | Comprobada contra el almacén |
| Doble redención | Nada lo impedía | Imposible: idempotente, con compare-and-set atómico |
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
| `/api/operador` | GET | ¿Sirve esta credencial? Para decirlo al teclearla, no al cobrar |

Redimir y cerrar exigen **credencial de operador**; el informe, token de administración. Los
demás son públicos y llevan límite de abuso.

La lógica no vive en los endpoints: está en `api/_servicio.ts`, y por eso se prueba entera
sin levantar un servidor.

### Autorización: quién puede declarar una venta

Declarar un consumo genera una comisión y un crédito: es mover dinero. Por eso
`/api/redimir` exige **credencial de operador del aliado**, y no basta con conocer el código
del cliente —que es público para cualquiera que vea su móvil—.

| Papel | Qué prueba | Qué puede |
|---|---|---|
| Cliente | Tiene un código | Consultar **su** visita y dejar su opinión |
| Operador | Credencial del local | Declarar consumo y cerrar sin consumo |
| Atheron | Token de administración | Ver el informe semanal |

El servidor guarda sólo el **SHA-256** de cada credencial, y la compara en tiempo constante.
Si alguien lee las variables del despliegue no se lleva nada que pueda teclear —por eso la
credencial tiene que ser larga y aleatoria: un PIN corto se descubre desde su hash en
segundos—. **El QR no lleva ningún secreto**: se fotografía, se reenvía y se pega en una
mesa.

**Cómo crece a varios aliados.** Hoy, una variable por aliado derivada de su slug
(`ATHERON_OPERADOR_LA_TRIADA`); añadir el segundo es añadir su variable, sin tocar código.
Eso aguanta hasta unos diez. A partir de ahí, los operadores pasan a ser registros del propio
almacén (namespace `op`) con su alta y su baja, y la función busca ahí en vez de en el
entorno; lo que no cambia nunca es que el servidor guarde el hash y que el QR no lleve
secretos. Lo que este piloto **no** hace: la credencial es del local, no de la persona que
atiende. No hay usuarios ni turnos. Para un aliado es suficiente; para pagar comisiones a
varios, no.

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
2. Cada registro lleva **versión**, y cambiarlo es un **compare-and-set ejecutado dentro del
   servidor**: se manda la versión leída y la nueva, Redis compara y escribe en la misma
   operación. No hay ventana entre leer y escribir, porque no hay dos viajes.
3. Redimir una transacción ya redimida **no es un error**: devuelve la primera respuesta con
   `yaRedimida: true`. Eso es lo que hace seguro reintentar.

**El cerrojo se quitó, no se arregló.** Un cerrojo distribuido bien hecho necesita
propietario, renovación y liberación segura, y aun así deja huecos si el proceso se para
entre el vencimiento y la escritura. El compare-and-set es más simple y estrictamente más
fuerte para lo que hace falta aquí. Cierre y redención usan **la misma** transición, así que
un cierre concurrente no puede borrar una venta confirmada.

Toda escritura es **un solo `EVAL`**: un script Lua que Redis ejecuta entero, sin que ninguna
otra orden se meta en medio. El registro y sus índices se crean juntos o no se crean, y un
conflicto no ensucia los índices. La atomicidad es del proveedor; no se simula ninguna que
Redis no ofrezca.

### Otras variables

| Variable | Para qué | Si falta |
|---|---|---|
| `ATHERON_OPERADOR_LA_TRIADA` | SHA-256 de la credencial del local | **Nadie puede declarar ventas.** Nunca «abierto mientras tanto» |
| `ATHERON_TOKEN_ADMIN` | SHA-256 del token del informe semanal | El informe **no se sirve** |
| `ATHERON_WEBHOOK_EVENTOS` | Avisar a Atheron de activaciones y redenciones | No se manda nada. El registro no se pierde |

Las dos primeras se generan así, y **el valor en claro no se guarda en el repositorio**:

```bash
openssl rand -base64 33          # la credencial que se teclea en el local
printf %s "<esa credencial>" | sha256sum   # lo que va en la variable de entorno
```

### Límite de abuso

Los endpoints públicos son puertas abiertas a internet: activar crea registros, consultar
permite probar códigos, y seguimiento escribe texto. Cada uno lleva un contador por ventana,
guardado en el mismo almacén y sumado con una operación atómica, y los intentos de credencial
equivocada tienen su propio contador, mucho más corto. No es un anti-abuso sofisticado: corta
el bucle tonto, que es el que va a llegar. La identidad del que llama se guarda **hasheada**:
para contar peticiones basta con distinguir, no con saber de quién es la IP.

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

### El Crédito Atheron es un libro, no una cifra

Al confirmar el consumo se emite un crédito en su propio registro
(`src/data/credito-ledger.ts`), separado de la transacción del aliado —porque el crédito
sobrevive a la visita y se gasta en otro sitio—, con identificador estable, importe, saldo,
vencimiento, referencia a su origen y **movimientos que sólo crecen**.

El saldo no se edita: se anota un movimiento y el saldo se deriva. Así, si dentro de tres
meses alguien pregunta por qué un crédito vale 2.000 y no 5.000, la respuesta está escrita,
con su fecha y su referencia.

| Estado | Cuándo |
|---|---|
| `GENERADO` | Emitido, **sin titular**: todavía no se puede gastar |
| `DISPONIBLE` / `PARCIAL` | Con titular, entero o empezado |
| `AGOTADO` | Saldo cero |
| `REVERSADO` | La venta que lo originó se cayó |
| `VENCIDO` | Pasó su fecha, sin depender de que nadie lo marque |

El doble gasto lo impide la misma protección que la redención: el compare-and-set sobre la
versión. Dos gastos calculados sobre la misma copia dan la misma versión, y el almacén sólo
deja pasar uno. La reversión de un crédito **ya gastado a medias** no se decide en el código:
quién asume esa pérdida es una decisión comercial, y la función lo dice
(`REVERSION_PARCIAL_REQUIERE_POLITICA`).

**El titular no se inventa, y eso cambia lo que ve el cliente.** Atheron no tiene cuentas de
cliente: nadie inicia sesión, y el único identificador que existe es el código de la visita.
Decidir que «el que tenga el código es el dueño» es una decisión de identidad con
consecuencias —quien vea ese código se lleva el dinero— y no es de las que se toman dentro de
un archivo de código. Así que el crédito nace **sin titular** y la pantalla dice exactamente
eso: *generado, pendiente de vinculación*. Ya no dice «te lo aplicamos cuando reserves»,
porque hoy no hay forma de saber que quien reserva es quien consumió.

Cuando dirección decida el mecanismo de vinculación —cuenta, enlace firmado, verificación por
WhatsApp—, `vincula()` le pone titular y pasa a `DISPONIBLE`. La estructura ya está; lo que
falta es la decisión, y es un gate.

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

**Es atribución PARCIAL, y conviene decirlo.** Registra el origen de la visita, no la venta
que venga después: cerrar el circuito La Triada → venta Atheron exige poder reconocer a la
misma persona semanas más tarde, y eso es la misma decisión de identidad que tiene pendiente
el Crédito Atheron. No es bloqueante para el piloto Atheron → La Triada.

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
npm run prueba-reauditoria    136 · prueba de oro + una regresión por hallazgo de la 2ª y la 3ª auditoría
npm run prueba-adversarial    108 · una por cada hallazgo de la 1ª auditoría, por HTTP real
npm run prueba-almacen         24 · el almacén contra un Redis DE VERDAD
npm run prueba-loop002         87 · economía, transacciones, backend, informe
npm run prueba-humo-loop002    recorrido completo en iPhone contra la API y Redis reales
npm run prueba-piloto          48 (ATH-PILOT-001, siguen pasando)
npm run prueba-qr              17
npm run prueba                 42
npm run prueba-jornadas        25
npm run build                  correcto — 43 páginas
```

**Nada se declara resuelto contra una imitación.** `prueba-almacen` levanta un `redis-server`
real y le pone delante un adaptador que habla el protocolo REST de Upstash: el código de
producción corre sin cambiar una línea y los scripts Lua los ejecuta Redis. `prueba-adversarial`
monta **los mismos archivos de `/api`** en un servidor HTTP y los ataca con peticiones de
verdad —el agujero de autorización estaba justo en la frontera, así que probar la función
interna no habría demostrado nada—. `prueba-humo-loop002` hace lo mismo con un navegador.

Si `redis-server` no está en la máquina, esas pruebas lo dicen y terminan sin fallar: no se
exige un servicio que el repositorio no declara.

Lighthouse móvil sobre el build comprimido: **100 / 100 / 100** en las pantallas del cliente,
del seguimiento y del informe, y **99 / 100 / 100** en la del local. El SEO marca 66 por el
`noindex`, que es justo lo buscado.

---

## Gates de dirección

1. **Provisionar el almacén** (Vercel KV o Upstash) y cargar `KV_REST_API_URL` y
   `KV_REST_API_TOKEN`. Tiene coste y credenciales: es decisión de dirección. **Sin esto, el
   flujo de ATH-LOOP-002 no funciona**, y lo dice en pantalla.
2. **Emitir la credencial del local** y cargar su hash en `ATHERON_OPERADOR_LA_TRIADA`, más
   el token de administración. Sin ellos nadie puede declarar ventas ni ver el informe, que
   es el comportamiento correcto.
3. **Vinculación del Crédito Atheron**: cómo se ata un crédito a una persona. Es una decisión
   de identidad, no de código, y hasta que exista el crédito se muestra como *pendiente de
   vinculación*.
4. **Confirmar o cambiar el reparto 5/5.** Hoy es una hipótesis declarada.
5. **Política de originadores** (Josué): modelado sí, pago no.
6. **Reversión de un crédito ya gastado a medias**: quién asume la pérdida.
7. **Comisión inversa** del QR de La Triada, si la hay.
8. **Dónde se sirve la prueba**: vista previa de Vercel accesible desde el móvil, o merge
   —prohibido sin orden expresa—.
9. **Enviar mensajes al cliente** (WhatsApp/correo): necesita base legal y decisión.
10. **Conectar Odoo**, y decidir cómo se representa el Crédito Atheron.
11. **Publicar el beneficio en la ficha pública.** Hoy nada de esto se enlaza desde el sitio.

---

## Después de la auditoría

Una auditoría independiente adversarial sobre el commit `3152aaf` dio veredicto **C**. Los
ocho bloqueadores eran reales y se reprodujeron antes de corregirlos. Qué se hizo con cada
uno:

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | Cualquiera con un código podía declarar una venta o cerrarla | Credencial de operador por aliado, hasheada en el servidor y comparada en tiempo constante. El QR sigue sin secretos |
| 2 | Dos redenciones simultáneas pasaban las dos; el cerrojo no tenía propietario ni revalidación | Cerrojo eliminado. Compare-and-set sobre versión, ejecutado dentro de Redis en un solo `EVAL` |
| 3 | Un cierre concurrente borraba una venta confirmada | Cierre y redención comparten transición y protección. Probado 32 veces entre HTTP y Redis real |
| 4 | Registro, índice y TTL eran operaciones sueltas; un `200 {}` contaba como escritura correcta | Todo en un script atómico; validación estricta de la respuesta; los registros que falta leer se cuentan y bloquean la liquidación |
| 5 | La consulta exponía de más y el seguimiento podía borrar lo anterior | Vistas por lista blanca (cliente / operador); el seguimiento fusiona y una incidencia no se apaga desde fuera; errores redactados en el registro; límite de abuso |
| 6 | `Number()` aceptaba `true`, `[100000]`, `'1e3'`, `0.1` | Validación estricta en `src/data/validacion.ts`; pesos **enteros**; `Object.hasOwn` en los catálogos; fechas reconstruidas para comprobar que el día existe |
| 7 | El «Crédito Atheron» era una cifra, no un crédito | Libro mayor append-only con saldo, movimientos, vencimiento, reversión y prevención de doble gasto. Sin titular inventado, y la UX dice «pendiente de vinculación» |
| 8 | El informe no servía para liquidar | Bloques por regla histórica, cierres contados, estados `SIN_DATOS` / `INCOMPLETO` / `NO_CUADRA`, y detección de registros que faltan |

**Lo que no se resolvió, y por qué.** La vinculación del crédito a una persona necesita una
decisión de identidad que no se puede asumir (gate 3). La reversión parcial necesita política
(gate 6). Y el QR inverso sigue siendo **atribución parcial**: registra de dónde vino la
persona, pero no cierra el circuito La Triada → venta Atheron, porque para eso hace falta la
misma identidad que todavía no existe.

---

## Después de la reauditoría

La segunda auditoría confirmó como corregidos la autorización, la concurrencia, el cierre
frente a la redención, el compare-and-set, la filtración de texto libre y el seguimiento; y
encontró siete cosas más. Todas eran reales.

| # | Hallazgo | Corrección |
|---|---|---|
| B1 | Los créditos entraban en el índice de transacciones, y una venta normal salía INCOMPLETA | Cada entidad tiene su prefijo: `tx:act:`, `tx:red:`, `cr:gen:`. El informe no intenta cargar un `ATH-CR-*` como transacción, y si alguno aparece lo declara contaminación |
| B2 | `EVAL` aísla, pero **no deshace**: con un índice de tipo equivocado, el script escribía el objeto y reventaba después | Los scripts comprueban el tipo de **todas** las claves antes de tocar ninguna. Si algo no encaja devuelven −3 sin haber escrito. Y cualquier resultado que no sea OK deja de contarse como venta: ahí había un 200 sobre algo que no se guardó |
| B3 | `{"result":true}`, `["1"]` y `"1"` se convertían con `Number()` y pasaban por éxito | Sin conversiones: tipo exacto, entero, y dentro de los códigos que ese script puede devolver. Doce respuestas raras probadas, ninguna se acepta |
| B4 | Con las referencias de una venta borradas, el informe encontraba 200.000 de 300.000 y decía «cuadra» | Integridad en las dos direcciones: índice→objeto, **objeto→índice** (recorriendo el almacén, porque desde los índices eso es invisible), crédito referenciado, índices contradictorios, contaminación y TTL divergente. Cualquiera de ellas ⇒ INCOMPLETO |
| B5 | El contador de credenciales sumaba pero nadie miraba el resultado | Una sola política de autenticación: se mira el cupo **antes** de comprobar nada, y se aplica igual en `/redimir`, `/reporte`, `/operador` y `/transaccion`. Si el contador no responde, **fail-closed** |
| B6 | Se aceptaba `"100000"`, `personas: "3"`, y una fecha imposible se sustituía por la semana actual | Sin coerción: los enteros son `number`. Una fecha inválida es **400**, no la semana de hoy; un opcional inválido también, en vez de descartarse en silencio |
| B7 | Vencimiento movido al reparar, VENCIDO etiquetado como «usado», doble gasto con el mismo pedido, crédito cero con referencia falsa, y la regla la ponía la redención | Ver abajo |

### El crédito, en detalle

- **El vencimiento sale de la redención**, no de cuándo se escribe el registro. Reparar un
  crédito tres días después ya no regala tres días de vigencia.
- **VENCIDO no es AGOTADO.** Se distinguen leyendo el libro: si el saldo llegó a cero por un
  asiento de vencimiento, está vencido; si fue por un gasto, se usó.
- **Cada gasto exige una referencia** (el pedido, la reserva). Repetir la misma no vuelve a
  gastar: devuelve el crédito intacto marcado como repetido. El compare-and-set protege de
  dos escrituras a la vez; esto protege de reaplicar la misma dos veces, que es distinto.
- **Crédito cero no deja referencia** a un crédito que no existe.
- **La regla se fija en la activación.** Es el momento contractual de este piloto: si el
  cliente activa viendo un 5% y consume dos horas después, se le aplica el 5% aunque la
  configuración haya cambiado entremedias. Cambiarle el trato después de aceptarlo no es una
  opción, y ahora está probado con la configuración cambiada a 6/4 a mitad.

### El informe

Las filas reconstruyen **activaciones, cierres y redenciones**, no sólo lo que factura. La
satisfacción se cuenta como **evento de la semana** —por el sello del seguimiento—, así que
una opinión escrita hoy no cambia la media de una semana ya liquidada. Y la conversión es de
**cohorte**: de las activaciones de esta semana, cuántas acabaron consumiéndose. Mezclar
«redenciones de la semana» con «activaciones de la semana» daba porcentajes por encima de
100 en cuanto se consumía algo activado el domingo anterior.

El servicio devuelve el estado explícito —`CUADRA`, `NO_CUADRA`, `SIN_DATOS`, `INCOMPLETO`—
y la pantalla lo pinta; no lo deduce por su cuenta.

### Privacidad, ajustes de esta ronda

- La vista del cliente ya no dice si dejó consentimiento, ni el identificador, ni el saldo
  del crédito: conocer un código no puede dar acceso a un saldo que todavía no es de nadie.
  Sólo cuánto generó y que está pendiente de vinculación.
- Una cabecera `Authorization` repetida o sin `Bearer` es **400**, nunca 500.
- La credencial del local sigue en `sessionStorage`, con su riesgo escrito en
  `src/data/api-red.ts`: cualquier JavaScript que llegara a ejecutarse en la página podría
  leerla mientras la pestaña esté abierta. Se asume porque estas páginas no cargan nada de
  terceros y la pestaña dura un turno. Cerrarlo del todo es una cookie `HttpOnly` emitida por
  el servidor, y eso son sesiones: siguiente fase.

### La prueba de oro

`npm run prueba-reauditoria` empieza por el recorrido entero contra Redis real y los
endpoints reales: activar → redimir $100.000 → crédito $5.000 en su libro → informe. Termina
en **CUADRA**, con comisión 10.000, margen 5.000, el cliente pagando 100.000 y sin un solo id
que no se pueda demostrar. Si eso falla, lo demás da igual.

## Después de la tercera auditoría

La tercera revisión independiente cerró con **«no apto todavía para provisionar almacén»**, y
el bloqueo estaba concentrado en un sitio: **el índice de créditos `cr:gen` se recorría de
ida y nunca de vuelta**. Todo lo que se había construido para las transacciones —las dos
direcciones, la contaminación, la retención— no existía para el libro de créditos. Un crédito
escrito sin llegar a entrar en su índice era invisible, y el informe declaraba `CUADRA` sin
haber mirado la mitad de lo que estaba liquidando.

Esta ronda no rediseña nada de lo anterior. Cierra eso.

| Caso | Qué pasaba | Qué se comprueba ahora |
|---|---|---|
| Crédito fantasma | `cr:gen` nombraba un crédito cuyo objeto no existía y nadie lo miraba | `creditosSinObjeto`: se lee cada id del índice y el que no esté se declara |
| Crédito huérfano | El crédito existía y ningún `cr:gen` lo nombraba: **desde el índice eso no se ve nunca** | `creditosSinIndice`: se recorre el almacén de créditos y se pregunta, de cada uno, si alguien lo nombra |
| `cr:gen` contaminado | Un id de transacción, un id mal formado, otra entidad o una referencia rota dentro del índice de créditos | `creditosContaminados`: lo que no tiene forma de crédito **no se intenta leer como crédito**, se declara basura del índice |
| Retención | Sólo se comparaba el TTL del registro contra `tx:act` | Ahora también objeto crédito contra `cr:gen`, y transacción contra `tx:red` |
| Alcance | Un `SCAN` truncado se colaba como un id falso dentro de «transacciones sin índice» | `recuentoIncompleto`, lista propia, que **tumba el `CUADRA` por sí sola** aunque las demás salgan vacías |

### Por qué el alcance va primero

Es la diferencia entre «he mirado y falta esto» y «no he podido mirar entero». La segunda no
es un hallazgo: es la ausencia de prueba. Si el recorrido queda corto, que las listas salgan
vacías no demuestra nada sobre lo que no se miró, así que el informe no puede afirmar que el
universo inspeccionado esté completo. Por eso `recuentoIncompleto` se evalúa antes que
cualquier descuadre aritmético, y por eso `INCOMPLETO` no se confunde con `NO_CUADRA`,
`SIN_DATOS` ni `CUADRA`.

### Las pruebas

`npm run prueba-reauditoria` añade el bloque **B8**, contra el Redis de verdad que levanta el
propio archivo. Cada caso rompe el almacén a mano —`SADD`, `SET`, `EXPIRE`— comprueba que el
informe lo ve y **deja el día como estaba**; el último vuelve a hacer el recorrido completo
—activar → redimir $100.000 → crédito $5.000— y exige `CUADRA` con todas las listas de
integridad vacías. No hay ningún doble que reproduzca la lógica esperada: el único punto
donde se envuelve el almacén es para decirle que el recorrido quedó corto, y hasta ahí los
datos, los índices y el cálculo siguen siendo reales.

De paso, el bloque B4 —que rompía el día a propósito— ahora **deshace su destrozo**. Lo que
no se restaura lo arrastran los bloques siguientes y acaba tapando un fallo de verdad con un
resto de una prueba anterior.

### Textos: lo que se dejó de prometer

El Crédito Atheron **se registra**; no se aplica solo, porque no hay mecanismo de vinculación
ni de aplicación automática. Los textos reutilizables decían «se usa en hospedajes Atheron» y
«vale 90 días», que se leen como una promesa de algo que hoy no se puede cumplir. Ahora dicen
«está previsto para» y «se registra con 90 días de vigencia», y el aviso de pendiente dice
explícitamente que **no se aplica solo**.

## Lo que deliberadamente no se hizo

- **No se tocó la ficha pública de La Triada.** Sigue exactamente igual.
- **No se borró el piloto técnico.** Es el plan B sin backend.
- **No se añadió ninguna dependencia**, ni de servidor ni de navegador.
- **No se mandó ningún mensaje** a ningún cliente, ni se dejó preparado que se mande solo.
- **No se tocó Odoo**, ni se supuso ninguna credencial.
- **No se fijó ninguna condición que el CEO no haya confirmado**, y lo que es hipótesis se
  llama hipótesis en el código, en la pantalla de control y en el informe.
