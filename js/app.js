/* ============================================================
   app.js — arranque, navegación, Wake Lock y service worker.
   ============================================================ */
'use strict';

const App = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let vistaActual = 'carrera';
  let bloqueoPantalla = null;
  let quiereBloqueo = false;

  /* ---------------- navegación ---------------- */

  function irA(vista) {
    vistaActual = vista;
    for (const s of Util.$$('.vista')) s.classList.toggle('activa', s.id === 'vista-' + vista);
    for (const b of Util.$$('.nav-btn')) b.classList.toggle('activa', b.dataset.vista === vista);
    window.scrollTo(0, 0);

    if (vista === 'carrera') Carrera.refrescar(false);
    if (vista === 'inscripcion') { Inscripcion.sincronizarExpres(); Inscripcion.refrescar(); }
    if (vista === 'posiciones') Posiciones.refrescar();
    if (vista === 'ajustes') { Ajustes.refrescar(); Ajustes.pintarReloj(); Tandas.refrescar(); }
  }

  /** Repinta lo que dependa de los datos tras cualquier cambio. */
  function datosCambiaron() {
    pintarCabecera();
    Tandas.pintarBarra();
    if (vistaActual === 'posiciones') Posiciones.refrescar();
    if (vistaActual === 'inscripcion') Inscripcion.refrescar();
    if (vistaActual === 'carrera') { Carrera.pintarPendientes(); Carrera.pintarSalidas(); }
    if (vistaActual === 'ajustes') Tandas.pintarListaTandas();
  }

  /** Cambió la tanda activa (o se recargaron las tandas): repinta todo. */
  function tandaCambio() {
    pintarCabecera();
    Tandas.refrescar();
    Carrera.refrescar();
    Inscripcion.alCambiarTanda();
    Posiciones.refrescar();
    Ajustes.refrescar();
  }

  function pintarCabecera() {
    $('#titulo-carrera').textContent = est.config.nombreCarrera || 'Carrera';
    const t = est.tandaActiva;
    $('#subtitulo-carrera').textContent =
      (est.config.nombrePuesto || 'Meta') + ' · ' + (est.config.idDispositivo || '—') +
      (t ? ' · ' + t.vueltas + ' vueltas' : '');
  }

  /* ---------------- reloj ---------------- */

  function arrancarReloj() {
    const tic = () => {
      $('#reloj-cabecera').textContent = Util.hora(Date.now());
      if (vistaActual === 'ajustes') Ajustes.pintarReloj();
    };
    tic();
    setInterval(tic, 1000);
  }

  /* ---------------- Wake Lock ---------------- */

  async function mantenerPantalla() {
    quiereBloqueo = true;
    if (!('wakeLock' in navigator)) return;
    try {
      if (bloqueoPantalla) return;
      bloqueoPantalla = await navigator.wakeLock.request('screen');
      bloqueoPantalla.addEventListener('release', () => { bloqueoPantalla = null; });
    } catch (_) { /* el sistema puede negarlo con batería baja */ }
  }

  function soltarPantalla() {
    quiereBloqueo = false;
    try { if (bloqueoPantalla) bloqueoPantalla.release(); } catch (_) { /* ignorar */ }
    bloqueoPantalla = null;
  }

  // Al volver del segundo plano el bloqueo se pierde: hay que rehacerlo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && quiereBloqueo) mantenerPantalla();
  });

  /* ---------------- service worker ---------------- */

  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            Util.aviso('Hay una versión nueva. Cierra y vuelve a abrir la app para usarla.', '', 6000);
          }
        });
      });
    }).catch(() => {
      Util.aviso('No se pudo preparar el modo sin conexión.', 'error');
    });
  }

  // Se engancha al evento load si aún no ocurrió; si ya pasó, registra de una vez.
  function programarSW() {
    if (document.readyState === 'complete') registrarSW();
    else window.addEventListener('load', registrarSW, { once: true });
  }

  /* ---------------- arranque ---------------- */

  async function iniciar() {
    // El modo sin conexión no depende de la base de datos: se prepara ya.
    programarSW();

    // Navegación
    for (const b of Util.$$('.nav-btn')) {
      b.addEventListener('click', () => { Util.prepararAudio(); irA(b.dataset.vista); });
    }

    // Aviso de navegador incrustado
    if (Util.esWebView()) {
      const aviso = $('#aviso-webview');
      aviso.hidden = false;
      aviso.querySelector('.cerrar-aviso').addEventListener('click', () => { aviso.hidden = true; });
    }

    try {
      await DB.abrir();
    } catch (e) {
      await Util.alerta('No se pudo abrir el almacenamiento',
        e.message + '\nSi estás en modo incógnito o con el almacenamiento bloqueado, ' +
        'la app no podrá guardar las vueltas. Abre la página en una ventana normal de Chrome.');
      return;
    }

    await DB.pedirPersistencia();
    await Estado.cargar();

    pintarCabecera();
    Tandas.iniciar();
    Carrera.iniciar();
    Inscripcion.iniciar();
    Posiciones.iniciar();
    await Ajustes.iniciar();
    arrancarReloj();

    $('#pie-version').textContent =
      'Registro de Vueltas · esquema de datos v' + DB.ESQUEMA +
      ' · los datos se quedan en este dispositivo';

    // Evita cerrar la pestaña por accidente durante la carrera.
    window.addEventListener('beforeunload', ev => {
      if (NFC.estaActivo()) { ev.preventDefault(); ev.returnValue = ''; }
    });

  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return { irA, datosCambiaron, tandaCambio, mantenerPantalla, soltarPantalla, pintarCabecera };
})();
