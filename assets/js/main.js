/* ============================================================
   MAIN.JS — JavaScript compartido por todas las paginas
   Objetivo: el sitio debe funcionar aunque el JS falle.
   Por eso aqui solo hay MEJORAS, nunca contenido esencial.
   ============================================================ */

/* ============================================================
   CONFIGURACION — cambia estos valores en UN solo lugar
   ============================================================ */

// Numero de WhatsApp en formato internacional, SIN el signo + y sin espacios.
// 57 = Colombia. Corresponde a +57 318 898 3167.
var WHATSAPP_NUMERO = "573188983167";

// Mensaje por defecto cuando el enlace no trae uno propio.
var WHATSAPP_MENSAJE_BASE = "Hola, quiero informacion sobre los hospedajes de Atheron Suite en Zipaquira.";

// Dibujo del icono de WhatsApp (SVG). Se escribe una sola vez aqui
// y el codigo lo inserta en cada boton.
var ICONO_WHATSAPP =
  '<svg class="boton__icono" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M20.5 3.4A11.8 11.8 0 0 0 12.05 0C5.5 0 .15 5.35.15 11.9c0 2.1.55 4.15 1.6 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.7 1.45c6.55 0 11.9-5.35 11.9-11.9 0-3.2-1.25-6.2-3.4-8.5m-8.45 18.3c-1.75 0-3.5-.5-5-1.4l-.35-.2-3.75 1 1-3.65-.25-.4a9.85 9.85 0 0 1-1.5-5.25c0-5.45 4.45-9.9 9.9-9.9 2.65 0 5.15 1.05 7 2.9a9.83 9.83 0 0 1 2.9 7c0 5.45-4.45 9.9-9.95 9.9m5.45-7.42c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.63-.93-2.23-.24-.58-.49-.5-.67-.51h-.58c-.2 0-.53.07-.8.38-.28.3-1.05 1.02-1.05 2.5s1.07 2.9 1.22 3.1c.15.2 2.11 3.22 5.11 4.52.71.3 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35"/>' +
  '</svg>';


// Esperamos a que el HTML este listo antes de tocar elementos.
document.addEventListener("DOMContentLoaded", function () {

  /* ----------------------------------------------------------
     1. MENU MOVIL
     El boton hamburguesa abre y cierra el menu.
     Usamos aria-expanded para que los lectores de pantalla
     sepan si esta abierto (accesibilidad).
     ---------------------------------------------------------- */
  var botonMenu = document.querySelector("[data-boton-menu]");
  var menuMovil = document.querySelector("[data-menu-movil]");

  if (botonMenu && menuMovil) {
    botonMenu.addEventListener("click", function () {
      var abierto = botonMenu.getAttribute("aria-expanded") === "true";
      botonMenu.setAttribute("aria-expanded", String(!abierto));
      menuMovil.setAttribute("data-abierto", String(!abierto));
    });

    // Al hacer clic en un enlace del menu, lo cerramos.
    menuMovil.addEventListener("click", function (evento) {
      if (evento.target.closest("a")) {
        botonMenu.setAttribute("aria-expanded", "false");
        menuMovil.setAttribute("data-abierto", "false");
      }
    });
  }

  /* ----------------------------------------------------------
     2. ENLACES DE WHATSAPP
     Cada boton lleva data-whatsapp="mensaje". Aqui construimos
     la direccion wa.me con el mensaje ya escrito, para que el
     cliente solo tenga que pulsar "enviar".

     Por que asi y no escribiendo el enlace en cada HTML:
     el numero queda en UN solo sitio (arriba de este archivo).
     Si cambia el numero, se cambia una vez y listo.

     Ademas, cada boton trae en su href un destino de respaldo
     (#contacto). Si el JavaScript falla, el boton sigue
     llevando a algun lado en vez de quedar muerto.
     ---------------------------------------------------------- */
  document.querySelectorAll("[data-whatsapp]").forEach(function (enlace) {
    var mensaje = enlace.getAttribute("data-whatsapp") || WHATSAPP_MENSAJE_BASE;

    // encodeURIComponent convierte espacios y tildes en algo que
    // se puede poner dentro de una direccion web.
    enlace.href = "https://wa.me/" + WHATSAPP_NUMERO +
                  "?text=" + encodeURIComponent(mensaje);

    enlace.target = "_blank";       // abre en pestana nueva
    enlace.rel = "noopener";        // buena practica de seguridad

    // Insertamos el icono de WhatsApp al inicio del boton.
    // Lo hacemos aqui para no repetir el dibujo SVG en cada HTML.
    if (!enlace.querySelector(".boton__icono")) {
      enlace.insertAdjacentHTML("afterbegin", ICONO_WHATSAPP);
    }
  });

  /* ----------------------------------------------------------
     3. ANO ACTUAL EN EL FOOTER
     Asi no hay que editar el ano a mano cada enero.
     ---------------------------------------------------------- */
  document.querySelectorAll("[data-ano]").forEach(function (elemento) {
    elemento.textContent = new Date().getFullYear();
  });

  /* ----------------------------------------------------------
     4. APARICION AL HACER SCROLL
     IntersectionObserver avisa cuando un elemento entra en
     pantalla; ahi le anadimos la clase .visible y el CSS
     se encarga de la animacion.
     ---------------------------------------------------------- */
  var elementosAnimados = document.querySelectorAll(".aparecer");

  if ("IntersectionObserver" in window && elementosAnimados.length) {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("visible");
          observador.unobserve(entrada.target); // solo se anima una vez
        }
      });
    }, { threshold: 0.12 });

    elementosAnimados.forEach(function (el) { observador.observe(el); });
  } else {
    // Si el navegador no lo soporta, mostramos todo sin animacion.
    elementosAnimados.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ----------------------------------------------------------
     5. FORMULARIO DE CONTACTO (demo)
     Todavia NO enviamos datos a ningun lado: no hay servidor.
     Por ahora mostramos un mensaje de confirmacion para poder
     probar el diseno. Mas adelante se conectara a un servicio.
     ---------------------------------------------------------- */
  var formulario = document.querySelector("[data-formulario-contacto]");
  var aviso = document.querySelector("[data-aviso-formulario]");

  if (formulario && aviso) {
    formulario.addEventListener("submit", function (evento) {
      evento.preventDefault(); // evita que la pagina se recargue
      aviso.setAttribute("data-visible", "true");
      aviso.textContent =
        "Gracias, recibimos tu mensaje. (Demostracion: todavia no se envia a ningun servidor.)";
      formulario.reset();
    });
  }

});
