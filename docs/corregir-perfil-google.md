# Corregir la ubicación del perfil de Google — pendiente 28

> 20 de agosto de 2026.
> Es el pendiente de máxima prioridad del proyecto. Mientras Google crea que
> estás en Cogua, nada de lo construido en el sitio sale en las búsquedas de
> "hospedaje en Zipaquirá".

---

## 1. El diagnóstico: la dirección está bien, el pin está mal

Esto es lo primero que hay que entender, porque cambia el procedimiento:

| Dato | Estado |
|---|---|
| Texto de la dirección de la ficha | ✅ Correcto — `Cra. 9 #10-32, Zipaquirá` |
| Marcador del mapa (el "pin") | ❌ Cae en **Cogua** |

En Google son **dos datos distintos**. Se pueden editar por separado, y eso es
justo lo que nos conviene:

> **Cambiar el texto de la dirección puede disparar una reverificación**
> (postal, vídeo o llamada) y dejar la ficha en revisión mientras tanto.
> **Mover solo el marcador normalmente no la dispara.**

**Regla: no toques la dirección. Mueve únicamente el marcador.**

---

## 2. Los pasos

1. Entra en `business.google.com` con la cuenta que es **dueña** del perfil.
2. **Editar perfil** → **Ubicación**.
3. Junto a **Establecimiento**, pulsa el icono de editar.
4. Pulsa **Ajustar**. Es el control del mapa, no el de la dirección.
5. Mueve el mapa hasta que el marcador quede sobre el edificio real en Zipaquirá.
6. **Hecho** → **Guardar**.

> Los nombres de los botones cambian de vez en cuando. Si no coinciden
> exactamente, busca el control que abre el **mapa** dentro de Ubicación:
> ese es el correcto. El que pide escribir calle y número, no.

---

## 3. Las tres trampas

### 3.1 No hagas varios cambios a la vez

Cambiar en la misma sesión el pin, el nombre (`Atheronsas` → `Atheron Suite`)
y la categoría es un patrón clásico de **suspensión de ficha**.

El orden correcto es:

1. **Hoy:** mover el pin. Nada más.
2. **Una semana después:** renombrar a "Atheron Suite" (pendiente 29).
3. **Después:** completar categoría, horarios, teléfono y atributos (pendiente 30).

Recuperar una ficha suspendida cuesta semanas. No merece la pena ahorrarse dos visitas.

### 3.2 Google puede revertir el cambio

Si otras fuentes dicen que estás en Cogua, el sistema puede restaurar el dato
anterior por su cuenta. Y sabemos que ocurre: **Trivago te lista bajo Cogua**
(está documentado en `perfiles-y-flujo-de-trabajo.md`).

Si el pin se revierte a los pocos días, la causa es esa — no que lo hayas hecho
mal. La solución es corregir también las plataformas (pendiente 32).

### 3.3 Los tiempos

Suele verse en unos **10 minutos**, pero Google admite que puede tardar hasta
**30 días**. No repitas la edición si no aparece enseguida: editar varias veces
seguidas es otra señal que Google mira con lupa.

---

## 4. Aprovecha el viaje: cierra también el pendiente 8

Ya vas a tener el mapa abierto sobre la ubicación real. Antes de salir:

**Clic derecho sobre el punto exacto → copiar las coordenadas.**

Eso cierra el **pendiente 8**, que es el que hoy bloquea dos cosas en el sitio:

- El mapa real de la ficha de La Magia de Zipaquirá (hoy hay uno provisional
  centrado en el municipio).
- El campo `geo` del JSON-LD de esa ficha.

Un solo viaje, dos pendientes.

---

## 5. Cómo comprobar que funcionó

1. Abre una ventana de incógnito (sin tu sesión de Google).
2. Busca **`hospedaje en Zipaquira`** y **`Atheron Suite`**.
3. Mira que el resultado diga **Zipaquirá**, no Cogua.

Anota la fecha en que lo hiciste. El posicionamiento local tarda de 3 a 6 meses
en moverse, así que conviene saber desde cuándo cuenta el reloj.

---

## 6. Qué NO hace falta

- No hace falta crear un perfil nuevo. El actual tiene antigüedad y una reseña
  real, y eso vale más que uno nuevo perfecto.
- No hace falta esperar a que el sitio web esté terminado. Son cosas
  independientes y van en paralelo.

---

## Fuentes

- [Gestionar la dirección de tu empresa — Ayuda de Perfil de Empresa de Google](https://support.google.com/business/answer/2853879?hl=es)
- [Fix Wrong Google Maps Address or Pin Without Suspension — Reinstate Labs](https://www.reinstatelabs.com/blogs/wrong-google-maps-pin-address-fix-without-suspension)
