/* ============================================================
   app.js — arranque, navegación, pantalla encendida y modo sin
   conexión.
   ============================================================ */
'use strict';

const App = (() => {

  const $ = Util.$;
  const est = Estado.est;

  const SECCIONES = [
    { id: 'carrera', texto: 'Carrera', icono: 'bandera' },
    { id: 'inscripcion', texto: 'Inscritos', icono: 'persona' },
    { id: 'posiciones', texto: 'Resultados', icono: 'podio' },
    { id: 'ajustes', texto: 'Ajustes', icono: 'ajustes' }
  ];

  let vistaActual = 'carrera';
  let bloqueo = null;
  let quiereBloqueo = false;

  /* ---------------- navegación ---------------- */

  function construirNav() {
    const nav = $('#app-nav');
    nav.innerHTML = '';
    for (const s of SECCIONES) {
      nav.append(UI.el('button', {
        type: 'button',
        clase: 'app-nav__btn' + (s.id === vistaActual ? ' esta-activa' : ''),
        datos: { vista: s.id },
        'aria-label': s.texto,
        onclick: () => { Util.prepararAudio(); irA(s.id); }
      }, [UI.icono(s.icono), UI.el('span', { texto: s.texto })]));
    }
  }

  function irA(vista) {
    vistaActual = vista;
    for (const s of Util.$$('.vista')) s.classList.toggle('esta-activa', s.id === 'vista-' + vista);
    for (const b of Util.$$('.app-nav__btn')) {
      b.classList.toggle('esta-activa', b.dataset.vista === vista);
    }
    window.scrollTo(0, 0);

    if (vista === 'carrera') Carrera.refrescar(false);
    if (vista === 'inscripcion') { Inscripcion.sincronizar(); Inscripcion.refrescar(); }
    if (vista === 'posiciones') Posiciones.refrescar();
    if (vista === 'ajustes') Ajustes.refrescar();
  }

  /** Algo cambió en los datos del grupo activo. */
  function datosCambiaron() {
    pintarCabecera();
    Tandas.pintarBarra();
    if (vistaActual === 'posiciones') Posiciones.refrescar();
    if (vistaActual === 'inscripcion') Inscripcion.refrescar();
    if (vistaActual === 'carrera') { Carrera.pintarPendientes(); Carrera.pintarSalidas(); }
    if (vistaActual === 'ajustes') Ajustes.refrescar();
  }

  /** Cambió el grupo activo o se recargó todo: repintar sin excepción. */
  function tandaCambio() {
    pintarCabecera();
    Tandas.pintarBarra();
    Carrera.refrescar();
    Inscripcion.alCambiarTanda();
    Posiciones.refrescar();
    Ajustes.refrescar();
  }

  function pintarCabecera() {
    $('#cab-titulo').textContent = est.config.nombreCarrera || 'Carrera';
    const t = est.tandaActiva;
    $('#cab-sub').textContent = (est.config.nombrePuesto || 'Meta') +
      ' · ' + (est.config.idDispositivo || '') +
      (t ? ' · ' + t.vueltas + (t.vueltas === 1 ? ' vuelta' : ' vueltas') : '');
  }

  /* ---------------- reloj ---------------- */

  function arrancarReloj() {
    const tic = () => { $('#cab-reloj').textContent = Util.hora(Date.now()); };
    tic();
    setInterval(tic, 1000);
  }

  /* ---------------- pantalla encendida ---------------- */

  async function mantenerPantalla() {
    quiereBloqueo = true;
    if (!('wakeLock' in navigator)) return;
    try {
      if (bloqueo) return;
      bloqueo = await navigator.wakeLock.request('screen');
      bloqueo.addEventListener('release', () => { bloqueo = null; });
    } catch (_) { /* el sistema puede negarlo con batería baja */ }
  }

  function soltarPantalla() {
    quiereBloqueo = false;
    try { if (bloqueo) bloqueo.release(); } catch (_) { /* ignorar */ }
    bloqueo = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && quiereBloqueo) mantenerPantalla();
  });

  /* ---------------- modo sin conexión ---------------- */

  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            UI.aviso('Hay una versión nueva. Cierra y vuelve a abrir la app.', 'neutro', 6000);
          }
        });
      });
    }).catch(() => { /* sin modo sin conexión; la app igual funciona */ });
  }

  function programarSW() {
    if (document.readyState === 'complete') registrarSW();
    else window.addEventListener('load', registrarSW, { once: true });
  }

  /* ---------------- arranque ---------------- */

  async function iniciar() {
    programarSW();
    construirNav();

    if (Util.esWebView()) {
      UI.alerta({
        titulo: 'Ábrela en Chrome',
        mensaje: 'Estás viendo la app dentro de otra aplicación (WhatsApp, Gmail…) y así el NFC ' +
                 'no funciona.\nToca el menú de tres puntos y elige «Abrir en Chrome».'
      });
    }

    try {
      await DB.abrir();
    } catch (e) {
      await UI.alerta({
        titulo: 'No se pueden guardar los datos',
        mensaje: e.message + '\nSi estás en una ventana de incógnito, ábrela en una ventana normal de Chrome.'
      });
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

    window.addEventListener('beforeunload', ev => {
      if (NFC.estaActivo()) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return { irA, datosCambiaron, tandaCambio, mantenerPantalla, soltarPantalla, pintarCabecera };
})();
