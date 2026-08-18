/* ============================================================
   MAIN.JS — JavaScript compartido por todas las paginas
   Objetivo: el sitio debe funcionar aunque el JS falle.
   Por eso aqui solo hay MEJORAS, nunca contenido esencial.
   ============================================================ */

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
     2. ANO ACTUAL EN EL FOOTER
     Asi no hay que editar el ano a mano cada enero.
     ---------------------------------------------------------- */
  document.querySelectorAll("[data-ano]").forEach(function (elemento) {
    elemento.textContent = new Date().getFullYear();
  });

  /* ----------------------------------------------------------
     3. APARICION AL HACER SCROLL
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
     4. FORMULARIO DE CONTACTO (demo)
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
