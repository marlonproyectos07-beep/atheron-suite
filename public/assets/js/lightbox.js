/* ============================================================
   VISOR DE FOTOS (lightbox)

   Amplia las fotos de la galeria de una habitacion. Se apoya en
   <dialog>, que el navegador ya sabe abrir en modal: pinta el
   fondo oscuro, cierra con ESC y atrapa el foco dentro. Por eso
   este archivo es corto y no hay ninguna libreria detras.

   POR QUE ASI Y NO CON UNA LIBRERIA:
   las de galerias pesan entre 30 y 90 KB y cargan CSS aparte. Esto
   son unos 2 KB, va con "defer" y solo lo pide la ficha que tiene
   galeria. En movil con datos, esa diferencia se nota.

   COMO SE ENGANCHA:
   cada galeria lleva data-galeria y cada foto va dentro de un
   <button class="galeria__abrir">. Si este archivo no llega o
   falla, los botones no hacen nada y las fotos se siguen viendo
   igual: la pagina nunca depende de este guion para mostrarse.

   VARIAS HABITACIONES EN LA MISMA FICHA:
   antes se cogia una sola galeria -querySelector, en singular- y
   con dos habitaciones las fotos de la segunda no abrian. Ahora se
   recorren todas: cada galeria tiene su propia lista de fotos y su
   propio contador, y el <dialog> es uno solo, compartido. Al pulsar
   una miniatura, esa lista pasa a ser la activa; asi "3 / 7" cuenta
   dentro de la habitacion que estas mirando y las flechas no se
   escapan a las fotos de otra. Una ficha con una sola habitacion se
   comporta exactamente igual que antes.

   La foto grande se pide al abrir el visor, no al cargar la
   pagina, y se reutiliza el mismo <img> al pasar de una a otra.
   ============================================================ */
(function () {
  'use strict';

  var galerias = Array.prototype.slice.call(document.querySelectorAll('[data-galeria]'));
  var visor = document.getElementById('visor');
  if (!galerias.length || !visor || typeof visor.showModal !== 'function') return;

  var foto = visor.querySelector('#visor-foto');
  var cuenta = visor.querySelector('[data-visor-cuenta]');
  var pieAlt = visor.querySelector('[data-visor-alt]');

  var fotos = [];
  var actual = 0;
  var abridor = null;

  function pinta(i) {
    if (!fotos.length) return;
    actual = (i + fotos.length) % fotos.length;
    foto.src = fotos[actual].src;
    foto.alt = fotos[actual].alt;
    cuenta.textContent = actual + 1 + ' / ' + fotos.length;
    pieAlt.textContent = fotos[actual].alt;
  }

  function abre(lista, i, boton) {
    fotos = lista;
    abridor = boton || null;
    pinta(i);
    visor.showModal();
  }

  galerias.forEach(function (galeria) {
    var botones = Array.prototype.slice.call(galeria.querySelectorAll('.galeria__abrir'));
    if (!botones.length) return;

    var lista = botones.map(function (b) {
      var img = b.querySelector('img');
      return { src: img.getAttribute('src'), alt: img.getAttribute('alt') };
    });

    botones.forEach(function (b, i) {
      b.addEventListener('click', function () { abre(lista, i, b); });
    });

    if (galeria.id) {
      var atajos = document.querySelectorAll('[data-abrir-galeria="' + galeria.id + '"]');
      Array.prototype.forEach.call(atajos, function (atajo) {
        atajo.addEventListener('click', function () { abre(lista, 0, atajo); });
      });
    }
  });

  visor.querySelector('[data-visor-antes]').addEventListener('click', function () { pinta(actual - 1); });
  visor.querySelector('[data-visor-despues]').addEventListener('click', function () { pinta(actual + 1); });
  visor.querySelector('[data-visor-cerrar]').addEventListener('click', function () { visor.close(); });

  visor.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); pinta(actual - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pinta(actual + 1); }
  });

  visor.addEventListener('click', function (e) {
    if (e.target === visor) visor.close();
  });

  var x0 = null, y0 = null;
  visor.addEventListener('touchstart', function (e) {
    x0 = e.changedTouches[0].clientX;
    y0 = e.changedTouches[0].clientY;
  }, { passive: true });

  visor.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) pinta(actual + (dx < 0 ? 1 : -1));
    x0 = y0 = null;
  }, { passive: true });

  visor.addEventListener('close', function () {
    if (abridor) abridor.focus();
    abridor = null;
  });
})();
