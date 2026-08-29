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

  var fotos = [];     // lista de la galeria que se esta viendo
  var actual = 0;
  var abridor = null; // a que boton devolver el foco al cerrar

  function pinta(i) {
    if (!fotos.length) return;
    actual = (i + fotos.length) % fotos.length; // da la vuelta en los extremos
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

    /* Las fuentes salen de las miniaturas: misma foto, sin una
       segunda lista que se pueda desincronizar con el HTML. */
    var lista = botones.map(function (b) {
      var img = b.querySelector('img');
      return { src: img.getAttribute('src'), alt: img.getAttribute('alt') };
    });

    botones.forEach(function (b, i) {
      b.addEventListener('click', function () { abre(lista, i, b); });
    });

    /* Atajos que abren esta galeria desde fuera de la rejilla: la foto
       grande de la tarjeta y el boton "Ver fotos". Apuntan a la galeria
       por su identificador -data-abrir-galeria="galeria-2"- y entran por
       la primera foto. Si el guion no llega, esos botones no hacen nada
       y las miniaturas de abajo siguen ahi: no se pierde el acceso. */
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

  /* Flechas del teclado. ESC ya lo hace <dialog> por su cuenta. */
  visor.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); pinta(actual - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pinta(actual + 1); }
  });

  /* Click en el fondo -fuera del marco de la foto- cierra. */
  visor.addEventListener('click', function (e) {
    if (e.target === visor) visor.close();
  });

  /* Deslizar en celular. Se exige un recorrido horizontal claro
     (60 px y mas horizontal que vertical) para no robarle el
     gesto al desplazamiento normal de la pagina. */
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

  /* Al cerrar, el foco vuelve a la miniatura desde la que se
     abrio: quien navega con teclado no acaba al principio. */
  visor.addEventListener('close', function () {
    if (abridor) abridor.focus();
    abridor = null;
  });

  /* ============================================================
     SELECTOR COMERCIAL — HOTEL ATHERON SUITE

     La ficha oficial conserva todo el HTML, SEO, JSON-LD, galerias,
     videos, mapa y contacto que ya tenia. Este bloque solo mejora la
     navegacion cuando estamos en el Hotel Atheron Suite: arriba se
     presentan la casa completa y las cinco habitaciones en tarjetas
     compactas. Al escoger una habitacion se muestra su ficha completa.

     Si JavaScript falla, no desaparece contenido: las cinco fichas
     originales siguen visibles una debajo de otra.
     ============================================================ */
  function montarSelectorHotel() {
    var ruta = window.location.pathname.replace(/\/$/, '');
    if (ruta !== '/hospedajes/hotel-atheron-suite') return;

    var seccion = document.getElementById('habitaciones');
    if (!seccion || seccion.getAttribute('data-selector-montado') === 'true') return;

    var grid = seccion.querySelector('.grid');
    if (!grid) return;

    var habitaciones = Array.prototype.slice.call(grid.children).filter(function (el) {
      return el.classList && el.classList.contains('habitacion');
    });
    if (habitaciones.length !== 5) return;

    seccion.setAttribute('data-selector-montado', 'true');
    seccion.classList.add('hotel-selector-activo');
    grid.classList.add('hotel-detalles');

    var estilo = document.createElement('style');
    estilo.textContent = [
      '.hotel-selector{display:grid;gap:2rem;margin:1.5rem 0 2.5rem}',
      '.hotel-selector__titulo{max-width:720px}',
      '.hotel-selector__titulo h3{font-size:clamp(1.55rem,3vw,2.15rem);margin:.35rem 0 .65rem}',
      '.hotel-selector__ceja{color:var(--color-verde);font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}',
      '.hotel-casa{display:grid;overflow:hidden;background:#fff;border:2px solid color-mix(in srgb,var(--color-verde) 36%,var(--borde));border-radius:var(--radio-lg);box-shadow:0 14px 38px rgba(15,23,42,.08)}',
      '.hotel-casa__foto{min-height:250px;background:var(--color-crema);overflow:hidden}',
      '.hotel-casa__foto img{width:100%;height:100%;min-height:250px;object-fit:cover}',
      '.hotel-casa__contenido{padding:clamp(1.25rem,3vw,2rem)}',
      '.hotel-casa__insignia{display:inline-flex;padding:.35rem .75rem;border-radius:999px;background:var(--color-verde);color:#fff;font-size:.78rem;font-weight:700;margin-bottom:.8rem}',
      '.hotel-selector__datos{display:flex;flex-wrap:wrap;gap:.45rem;margin:.75rem 0 1rem}',
      '.hotel-selector__datos span{padding:.35rem .7rem;border-radius:999px;background:var(--color-crema);font-size:.82rem}',
      '.hotel-selector__acciones{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1.1rem}',
      '.hotel-selector__acciones .boton{justify-content:center}',
      '.hotel-habitaciones-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:1rem}',
      '.hotel-mini{display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid var(--borde);border-radius:var(--radio-md);box-shadow:0 10px 30px rgba(15,23,42,.06)}',
      '.hotel-mini__foto{display:block;aspect-ratio:4/3;overflow:hidden;background:var(--color-crema)}',
      '.hotel-mini__foto img{width:100%;height:100%;object-fit:cover;transition:transform .2s ease}',
      '.hotel-mini__foto:hover img{transform:scale(1.025)}',
      '.hotel-mini__cuerpo{display:flex;flex:1;flex-direction:column;padding:1rem}',
      '.hotel-mini__cuerpo h3{margin:0 0 .55rem}',
      '.hotel-mini__precio{margin-top:auto;padding-top:.8rem;font-weight:700}',
      '.hotel-mini__acciones{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-top:.8rem}',
      '.hotel-mini__acciones .boton{min-height:44px;padding:.7rem .65rem;justify-content:center;text-align:center}',
      '.hotel-volver{display:inline-flex;margin-bottom:1rem;color:var(--color-verde);font-weight:700}',
      '.hotel-selector-activo .hotel-detalles>.habitacion{display:none}',
      '.hotel-selector-activo .hotel-detalles>.habitacion.hotel-detalle--visible{display:grid;scroll-margin-top:6rem}',
      '.hotel-casa-detalle{display:none;margin-top:1.5rem;padding:clamp(1.2rem,3vw,2rem);background:#fff;border:1px solid var(--borde);border-radius:var(--radio-lg);box-shadow:0 14px 38px rgba(15,23,42,.08);scroll-margin-top:6rem}',
      '.hotel-casa-detalle.hotel-detalle--visible{display:block}',
      '.hotel-casa-detalle__mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-top:1.25rem}',
      '.hotel-casa-detalle__mini a{display:grid;gap:.45rem;color:inherit;font-weight:700}',
      '.hotel-casa-detalle__mini img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--radio-sm)}',
      '@media(min-width:800px){.hotel-casa{grid-template-columns:minmax(300px,.9fr) 1.1fr;align-items:stretch}.hotel-casa__foto,.hotel-casa__foto img{min-height:100%}}',
      '@media(max-width:560px){.hotel-mini__acciones{grid-template-columns:1fr}.hotel-selector__acciones{display:grid}.hotel-selector__acciones .boton{width:100%}}'
    ].join('');
    document.head.appendChild(estilo);

    var encabezado = seccion.querySelector('.encabezado-seccion');
    if (encabezado) {
      var titulo = encabezado.querySelector('h2');
      var nota = encabezado.querySelector('p');
      if (titulo) titulo.textContent = 'Elige como quieres hospedarte';
      if (nota) nota.textContent = 'Reserva una habitacion o toma la casa completa para grupos de hasta 22 personas.';
    }

    var selector = document.createElement('div');
    selector.className = 'hotel-selector';

    var tituloSelector = document.createElement('div');
    tituloSelector.className = 'hotel-selector__titulo';
    tituloSelector.innerHTML = '<span class="hotel-selector__ceja">Dos formas de hospedarte</span><h3>Una habitacion o toda la casa</h3><p class="texto-suave">Compara primero y entra solo a la opcion que te interesa. Si viajan en grupo, puedes reservar las cinco habitaciones juntas.</p>';
    selector.appendChild(tituloSelector);

    var fotoCasa = document.querySelector('.bloque-doble__media img');
    var casa = document.createElement('article');
    casa.className = 'hotel-casa';
    casa.innerHTML =
      '<div class="hotel-casa__foto">' +
        (fotoCasa ? '<img src="' + fotoCasa.getAttribute('src') + '" alt="' + (fotoCasa.getAttribute('alt') || 'Hotel Atheron Suite en Zipaquira') + '" loading="lazy" decoding="async">' : '') +
      '</div>' +
      '<div class="hotel-casa__contenido">' +
        '<span class="hotel-casa__insignia">Mejor opcion para grupos</span>' +
        '<h3>Casa completa · Atheron Suite</h3>' +
        '<div class="hotel-selector__datos"><span>Hasta 22 huespedes</span><span>5 habitaciones</span></div>' +
        '<p class="texto-suave">Ideal para familias, grupos de amigos, empresas o viajeros que quieren hospedarse juntos en una sola propiedad.</p>' +
        '<p><strong>Precio para grupos: consultar</strong></p>' +
        '<div class="hotel-selector__acciones">' +
          '<a class="boton boton--contorno" href="#detalle-casa-completa" data-ver-casa>Ver casa completa</a>' +
          '<a class="boton boton--whatsapp" href="#contacto" data-whatsapp="Hola, quiero cotizar la casa completa de Hotel Atheron Suite para un grupo de hasta 22 personas.">Cotizar grupo</a>' +
        '</div>' +
      '</div>';
    selector.appendChild(casa);

    var subtitulo = document.createElement('div');
    subtitulo.className = 'hotel-selector__titulo';
    subtitulo.innerHTML = '<span class="hotel-selector__ceja">¿Prefieres una habitacion?</span><h3>Conoce las cinco opciones</h3>';
    selector.appendChild(subtitulo);

    var miniGrid = document.createElement('div');
    miniGrid.className = 'hotel-habitaciones-grid';

    var datosHabitaciones = habitaciones.map(function (articulo, indice) {
      var nombreEl = articulo.querySelector('h3');
      var nombre = nombreEl ? nombreEl.textContent.trim() : 'Habitacion ' + (indice + 1);
      var id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      var img = articulo.querySelector('img');
      var etiquetas = Array.prototype.slice.call(articulo.querySelectorAll('.habitacion__dato')).map(function (el) { return el.textContent.trim(); }).filter(Boolean);
      var precio = articulo.querySelector('.tarjeta__precio');
      articulo.id = 'detalle-' + id;

      var volver = document.createElement('a');
      volver.className = 'hotel-volver';
      volver.href = '#habitaciones';
      volver.textContent = '← Ver todas las opciones';
      articulo.insertBefore(volver, articulo.firstChild);

      var mini = document.createElement('article');
      mini.className = 'hotel-mini';
      mini.innerHTML =
        '<a class="hotel-mini__foto" href="#detalle-' + id + '" data-ver-habitacion="' + indice + '" aria-label="Ver fotos y detalles de ' + nombre + '">' +
          (img ? '<img src="' + img.getAttribute('src') + '" alt="' + (img.getAttribute('alt') || nombre) + '" loading="lazy" decoding="async">' : '') +
        '</a>' +
        '<div class="hotel-mini__cuerpo">' +
          '<h3>' + nombre + '</h3>' +
          '<div class="hotel-selector__datos">' + etiquetas.slice(0, 2).map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' +
          '<div class="hotel-mini__precio">' + (precio ? precio.textContent.trim() : 'Precio a consultar') + '</div>' +
          '<div class="hotel-mini__acciones">' +
            '<a class="boton boton--contorno" href="#detalle-' + id + '" data-ver-habitacion="' + indice + '">Ver fotos y detalles</a>' +
            '<a class="boton boton--whatsapp" href="#contacto" data-whatsapp="Hola, quiero consultar disponibilidad y precio de ' + nombre + ' en Hotel Atheron Suite.">Consultar</a>' +
          '</div>' +
        '</div>';
      miniGrid.appendChild(mini);

      return { articulo: articulo, id: id, nombre: nombre, img: img };
    });
    selector.appendChild(miniGrid);

    var casaDetalle = document.createElement('article');
    casaDetalle.className = 'hotel-casa-detalle';
    casaDetalle.id = 'detalle-casa-completa';
    casaDetalle.innerHTML =
      '<a class="hotel-volver" href="#habitaciones">← Ver todas las opciones</a>' +
      '<span class="hotel-selector__ceja">Para grupos grandes</span>' +
      '<h3>Casa completa · hasta 22 huespedes</h3>' +
      '<p class="texto-suave">Reserva las cinco habitaciones de Atheron Suite para que tu grupo se hospede en una sola propiedad. Es una opcion pensada para familias numerosas, grupos de amigos, empresas y viajeros que quieren permanecer juntos.</p>' +
      '<div class="hotel-selector__datos"><span>Hasta 22 huespedes</span><span>5 habitaciones</span><span>Una sola propiedad</span></div>' +
      '<a class="boton boton--whatsapp" href="#contacto" data-whatsapp="Hola, quiero cotizar la casa completa de Hotel Atheron Suite. Somos un grupo y quiero consultar disponibilidad y precio.">Cotizar casa completa</a>' +
      '<div class="hotel-casa-detalle__mini">' + datosHabitaciones.map(function (h, i) {
        return '<a href="#detalle-' + h.id + '" data-ver-habitacion="' + i + '">' +
          (h.img ? '<img src="' + h.img.getAttribute('src') + '" alt="' + (h.img.getAttribute('alt') || h.nombre) + '" loading="lazy" decoding="async">' : '') +
          '<span>' + h.nombre + '</span></a>';
      }).join('') + '</div>';

    grid.parentNode.insertBefore(selector, grid);
    grid.parentNode.insertBefore(casaDetalle, grid);

    function ocultarDetalles() {
      habitaciones.forEach(function (articulo) { articulo.classList.remove('hotel-detalle--visible'); });
      casaDetalle.classList.remove('hotel-detalle--visible');
    }

    function mostrarHabitacion(indice, moverHash) {
      ocultarDetalles();
      var dato = datosHabitaciones[indice];
      if (!dato) return;
      dato.articulo.classList.add('hotel-detalle--visible');
      if (moverHash !== false && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#detalle-' + dato.id);
      }
      dato.articulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function mostrarCasa(moverHash) {
      ocultarDetalles();
      casaDetalle.classList.add('hotel-detalle--visible');
      if (moverHash !== false && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#detalle-casa-completa');
      }
      casaDetalle.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    selector.addEventListener('click', function (e) {
      var verHab = e.target.closest('[data-ver-habitacion]');
      if (verHab) {
        e.preventDefault();
        mostrarHabitacion(Number(verHab.getAttribute('data-ver-habitacion')));
        return;
      }
      var verCasa = e.target.closest('[data-ver-casa]');
      if (verCasa) {
        e.preventDefault();
        mostrarCasa();
      }
    });

    casaDetalle.addEventListener('click', function (e) {
      var verHab = e.target.closest('[data-ver-habitacion]');
      if (verHab) {
        e.preventDefault();
        mostrarHabitacion(Number(verHab.getAttribute('data-ver-habitacion')));
      }
    });

    Array.prototype.forEach.call(seccion.querySelectorAll('.hotel-volver'), function (volver) {
      volver.addEventListener('click', function (e) {
        e.preventDefault();
        ocultarDetalles();
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', '#habitaciones');
        selector.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    var hash = window.location.hash;
    if (hash === '#detalle-casa-completa') {
      mostrarCasa(false);
    } else if (hash.indexOf('#detalle-') === 0) {
      datosHabitaciones.some(function (h, i) {
        if ('#detalle-' + h.id === hash) {
          mostrarHabitacion(i, false);
          return true;
        }
        return false;
      });
    }
  }

  montarSelectorHotel();
})();
