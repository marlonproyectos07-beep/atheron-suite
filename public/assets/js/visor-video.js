/* ============================================================
   VISOR DE VIDEO

   Abre el video de una habitacion en un <dialog>, con los controles
   del propio navegador. Va aparte del visor de fotos a proposito:
   asi el lightbox de la galeria se queda intacto y cada uno puede
   cambiar sin romper al otro.

   Este archivo solo lo pide la ficha que tiene video. Una habitacion
   sin video no carga ni el visor ni este guion.

   VARIAS HABITACIONES EN LA MISMA FICHA:
   antes se cogia un solo boton y un solo dialogo -querySelector, en
   singular- asi que una segunda habitacion con video se quedaba sin
   abrir. Ahora cada habitacion con video trae su propio <dialog>, y
   su boton dice a cual apunta:

     <button data-abrir-video="visor-video-2">  ->  <dialog id="visor-video-2">

   Si el atributo viene vacio -como en el HTML escrito a mano de la
   rama main, de cuando solo habia un video- se usa #visor-video. Por
   eso el mismo archivo sirve en las dos ramas sin tocar su HTML.

   QUE NO HACE, Y ES DELIBERADO:
   - No reproduce solo al cargar la pagina. Nadie quiere que un video
     arranque sin pedirlo, y menos con datos moviles.
   - No descarga nada de entrada: ni el video -eso lo garantiza
     preload="none"- ni el poster, que va en data-poster y se asigna
     al abrir. Con el atributo poster puesto en el HTML, el navegador
     se baja esa imagen nada mas cargar la pagina.
   - No trae ninguna libreria. Son los controles nativos.

   Si este archivo no llega o falla, el boton no hace nada y la ficha
   se ve igual: la pagina nunca depende de el.
   ============================================================ */
(function () {
  'use strict';

  var botones = Array.prototype.slice.call(document.querySelectorAll('[data-abrir-video]'));
  if (!botones.length) return;

  botones.forEach(function (boton) {
    /* El boton nombra su dialogo. Sin nombre, el de siempre. */
    var id = boton.getAttribute('data-abrir-video');
    var visor = document.getElementById(id || 'visor-video');
    if (!visor || typeof visor.showModal !== 'function') return;

    var video = visor.querySelector('video');
    var cerrar = visor.querySelector('[data-video-cerrar]');

    boton.addEventListener('click', function () {
      /* El poster se pone aqui, no en el HTML. Con el atributo poster
         el navegador se baja la imagen al cargar la pagina, aunque el
         dialogo este cerrado, y compite con las hojas de estilo. Para
         cuando alguien pulsa, la imagen ya esta en cache: es la misma
         miniatura de la tarjeta. */
      if (video && !video.poster && video.dataset.poster) video.poster = video.dataset.poster;
      visor.showModal();
      /* El play va despues de abrir, y solo si el navegador lo permite
         sin gesto adicional. Si lo rechaza -algunos moviles lo hacen-
         no pasa nada: el visitante le da al play de los controles. */
      if (video && typeof video.play === 'function') {
        var intento = video.play();
        if (intento && typeof intento.catch === 'function') intento.catch(function () {});
      }
    });

    /* Al cerrar -con la X, con ESC o pulsando el fondo- se para el
       video. Si no, se queda sonando detras del dialogo cerrado. */
    function parar() {
      if (!video) return;
      video.pause();
      boton.focus(); // el foco vuelve a la tarjeta desde la que se abrio
    }

    if (cerrar) cerrar.addEventListener('click', function () { visor.close(); });
    visor.addEventListener('close', parar);

    /* Click en el fondo, fuera del marco del video. */
    visor.addEventListener('click', function (e) {
      if (e.target === visor) visor.close();
    });
  });
})();
