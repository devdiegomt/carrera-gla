/* ============================================================
   carrera.js — pantalla de registro de vueltas y salidas.
   ============================================================ */
'use strict';

const Carrera = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let digitos = '';
  let historial = [];   // últimas 10 lecturas mostradas
  let cronometro = null;

  /* ---------------- panel de resultado ---------------- */

  function pintarPanel({ clase, dorsal, nombre, detalle, hora }) {
    const p = $('#panel-resultado');
    p.className = 'panel-resultado ' + clase;
    $('#res-dorsal').textContent = dorsal;
    $('#res-nombre').textContent = nombre;
    $('#res-vuelta').textContent = detalle;
    $('#res-hora').textContent = hora || '';
    p.classList.remove('destello');
    void p.offsetWidth;
    p.classList.add('destello');
  }

  function panelEspera() {
    pintarPanel({
      clase: 'estado-espera',
      dorsal: '···',
      nombre: NFC.estaActivo() ? 'Acerca una manilla' : 'Listo para leer',
      detalle: NFC.estaActivo() ? 'Lectura NFC activa' : 'Activa la lectura NFC o usa el teclado',
      hora: est.tandaActiva ? est.tandaActiva.nombre : ''
    });
  }

  function mostrarResultado(res) {
    const total = res.total || Estado.vueltas();
    if (res.estado === 'ok' || res.estado === 'final') {
      const esFinal = res.estado === 'final';
      const ol = res.oleada;
      const extra = [];
      if (ol && Estado.oleadas().length > 1) extra.push(ol.nombre);
      if (res.neto != null) extra.push('neto ' + Util.duracion(res.neto));
      pintarPanel({
        clase: esFinal ? 'estado-final' : 'estado-ok',
        dorsal: res.dorsal,
        nombre: res.corredor ? (res.corredor.nombre || 'Dorsal ' + res.dorsal) : '',
        detalle: (esFinal ? '¡META! ' : '') + 'Vuelta ' + res.vuelta + ' de ' + total,
        hora: Util.hora(res.evento.ts) + (extra.length ? ' · ' + extra.join(' · ') : '')
      });
      Util.retro(esFinal ? 'final' : 'ok');
      agregarAlHistorial({
        clase: esFinal ? 'final' : 'ok',
        dorsal: res.dorsal,
        nombre: res.corredor ? res.corredor.nombre : '',
        texto: (esFinal ? 'META · ' : '') + 'Vuelta ' + res.vuelta + '/' + total +
               ' · ' + etiquetaMetodo(res.evento.metodo),
        ts: res.evento.ts
      });
    } else {
      pintarPanel({
        clase: 'estado-error',
        dorsal: res.dorsal || '✕',
        nombre: res.corredor ? (res.corredor.nombre || 'Dorsal ' + res.dorsal) : 'No registrado',
        detalle: res.mensaje,
        hora: Util.hora(Date.now())
      });
      Util.retro('error');
      agregarAlHistorial({
        clase: 'error',
        dorsal: res.dorsal || '?',
        nombre: res.corredor ? res.corredor.nombre : '',
        texto: res.mensaje,
        ts: Date.now()
      });
    }
    $('#btn-deshacer').disabled = !est.ultimoLocal;
    App.datosCambiaron();
  }

  function etiquetaMetodo(m) {
    return m === 'teclado' ? 'teclado' : m === 'asignada' ? 'asignada' : 'NFC';
  }

  /* ---------------- historial ---------------- */

  function agregarAlHistorial(entrada) {
    historial.unshift(entrada);
    if (historial.length > 10) historial.length = 10;
    pintarHistorial();
  }

  function pintarHistorial() {
    const caja = $('#historial');
    caja.innerHTML = '';
    if (!historial.length) {
      caja.append(Util.el('div', { clase: 'item-vacio', texto: 'Todavía no hay lecturas en esta tanda.' }));
      return;
    }
    for (const h of historial) {
      caja.append(Util.el('div', { clase: 'item ' + h.clase }, [
        Util.el('span', { clase: 'item-dorsal', texto: String(h.dorsal) }),
        Util.el('div', { clase: 'item-cuerpo' }, [
          Util.el('strong', { texto: h.nombre || '—' }),
          Util.el('span', { clase: 'item-meta', texto: h.texto })
        ]),
        Util.el('span', { clase: 'item-meta', texto: Util.hora(h.ts) })
      ]));
    }
  }

  function historialDesdeDatos() {
    const total = Estado.vueltas();
    const eventos = Estado.todosLosEventos().slice(-10).reverse();
    historial = eventos.map(ev => {
      const arr = Estado.eventosDe(ev.dorsal);
      const n = arr.findIndex(x => x.id === ev.id) + 1;
      const c = est.corredores.get(ev.dorsal);
      return {
        clase: n >= total ? 'final' : 'ok',
        dorsal: ev.dorsal,
        nombre: c ? c.nombre : '',
        texto: 'Vuelta ' + n + '/' + total + ' · ' + etiquetaMetodo(ev.metodo) +
               ' · ' + (ev.dispositivo || ''),
        ts: ev.ts
      };
    });
    pintarHistorial();
  }

  /* ---------------- salidas de oleada ---------------- */

  function pintarSalidas() {
    const caja = $('#lista-salidas');
    const lista = Estado.oleadas();
    const dadas = lista.filter(o => o.horaSalida).length;
    $('#chip-salidas').textContent = dadas + '/' + lista.length;
    caja.innerHTML = '';

    for (const o of lista) {
      const cuantos = contarEnOleada(o.id);
      const cuerpo = Util.el('div', { clase: 'salida-cuerpo' }, [
        Util.el('strong', { texto: o.nombre }),
        Util.el('span', { clase: 'item-meta', texto: cuantos + ' corredor' + (cuantos === 1 ? '' : 'es') })
      ]);

      const fila = Util.el('div', { clase: 'salida' + (o.horaSalida ? ' dada' : ''), datos: { oleada: o.id } }, [cuerpo]);

      if (o.horaSalida) {
        fila.append(Util.el('div', {}, [
          Util.el('div', { clase: 'salida-hora', texto: Util.hora(o.horaSalida) }),
          Util.el('div', { clase: 'salida-transcurrido', datos: { desde: o.horaSalida }, texto: '' })
        ]));
        fila.append(Util.el('button', {
          clase: 'btn btn-secundario', type: 'button', texto: 'Corregir',
          onclick: () => corregirSalida(o)
        }));
      } else {
        fila.append(Util.el('button', {
          clase: 'btn btn-primario', type: 'button', texto: '🚦 Dar salida',
          onclick: () => darSalida(o)
        }));
      }
      caja.append(fila);
    }
    actualizarCronometros();
  }

  function contarEnOleada(id) {
    let n = 0;
    for (const c of est.corredores.values()) if (c.oleada === id) n++;
    return n;
  }

  async function darSalida(oleada) {
    Util.prepararAudio();
    const ts = Date.now();
    await Estado.darSalida(oleada.id, ts);
    Util.retro('final');
    Util.aviso(oleada.nombre + ' salió a las ' + Util.hora(ts), 'ok');
    pintarSalidas();
    App.datosCambiaron();
  }

  async function corregirSalida(oleada) {
    const entrada = Util.el('input', { type: 'time', step: '1', value: horaParaInput(oleada.horaSalida) });
    const cuerpo = Util.el('div', {}, [
      Util.el('p', { texto: 'Hora de salida de ' + oleada.nombre + ' (hora de Bogotá, 24 h).' }),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Hora' }), entrada]),
      Util.el('p', { clase: 'nota', texto: 'Se aplica al día de hoy. Úsalo solo si olvidaste pulsar el botón.' })
    ]);
    const r = await Util.modal('Corregir salida', cuerpo, [
      { texto: 'Guardar hora', clase: 'btn-primario', valor: 'guardar' },
      { texto: 'Quitar la salida', clase: 'btn-peligro-suave', valor: 'quitar' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    if (!r) return;
    if (r === 'quitar') {
      await Estado.actualizarOleada(oleada.id, { horaSalida: null });
    } else {
      const ts = tsDesdeHora(entrada.value);
      if (ts == null) { Util.aviso('Hora inválida', 'error'); return; }
      await Estado.actualizarOleada(oleada.id, { horaSalida: ts });
    }
    pintarSalidas();
    App.datosCambiaron();
  }

  /** HH:MM:SS de Bogotá para un <input type="time">. */
  function horaParaInput(ts) {
    return ts ? Util.hora(ts) : '';
  }

  /** Convierte HH:MM(:SS) de hoy en Bogotá a epoch ms. */
  function tsDesdeHora(valor) {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(valor || '').trim());
    if (!m) return null;
    const ahora = Date.now();
    // Diferencia entre la hora de Bogotá y la del sistema, en ms.
    const partesBogota = Util.hora(ahora).split(':').map(Number);
    const d = new Date(ahora);
    const minutosBogota = partesBogota[0] * 3600 + partesBogota[1] * 60 + partesBogota[2];
    const minutosSistema = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const desfase = (minutosBogota - minutosSistema) * 1000;

    const objetivo = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
    const base = new Date(ahora);
    base.setHours(0, 0, 0, 0);
    return base.getTime() + objetivo * 1000 - desfase;
  }

  function actualizarCronometros() {
    for (const n of Util.$$('.salida-transcurrido')) {
      const desde = Number(n.dataset.desde);
      if (!desde) { n.textContent = ''; continue; }
      n.textContent = '+' + Util.duracion(Date.now() - desde);
    }
  }

  /* ---------------- NFC ---------------- */

  async function alternarNfc() {
    Util.prepararAudio();
    if (NFC.estaActivo()) {
      NFC.detener();
      App.soltarPantalla();
      pintarBotonNfc();
      panelEspera();
      $('#nfc-estado').textContent = 'Lectura detenida.';
      return;
    }
    $('#nfc-estado').textContent = 'Pidiendo permiso de NFC…';
    const ok = await NFC.iniciar(alLeerChip, (e, mensaje) => {
      $('#nfc-estado').textContent = mensaje;
      pintarBotonNfc();
      if (e && e.name !== 'ReadingError') {
        Util.alerta('NFC no disponible', mensaje);
        abrirTecladoRespaldo();
      } else {
        Util.retro('error');
      }
    });
    if (ok) {
      $('#nfc-estado').textContent =
        'Lectura activa. Acerca la manilla al centro de la parte trasera del celular.';
      App.mantenerPantalla();
      panelEspera();
    }
    pintarBotonNfc();
  }

  function pintarBotonNfc() {
    const b = $('#btn-nfc');
    const activo = NFC.estaActivo();
    $('#btn-nfc-texto').textContent = activo ? 'Lectura activa — tocar para detener' : 'Activar lectura NFC';
    b.classList.toggle('btn-activo', activo);
    b.classList.toggle('btn-primario', !activo);
    b.querySelector('.btn-icono').textContent = activo ? '🟢' : '📡';
  }

  async function alLeerChip({ uid, dorsalEnChip, ts }) {
    let dorsal = uid != null ? est.porUid.get(uid) : undefined;
    if (dorsal == null && dorsalEnChip != null && est.corredores.has(dorsalEnChip)) {
      dorsal = dorsalEnChip;
    }

    if (dorsal == null) {
      // Manilla no vinculada en ESTA tanda: la vuelta no se pierde.
      const hist = uid ? Estado.historialDeChip(uid) : null;
      const previo = hist && hist.previos[0];
      const p = await Estado.marcarPendiente(ts, uid ? { uid } : null);
      pintarPanel({
        clase: 'estado-error',
        dorsal: '?',
        nombre: 'Manilla sin vincular',
        detalle: previo
          ? 'Era el dorsal ' + previo.dorsal + ' en ' + hist.nombreTanda(previo.tanda) +
            '. Guardada como marca pendiente.'
          : 'Guardada como marca pendiente. Vincúlala en Inscripción.',
        hora: Util.hora(p.ts) + (uid ? ' · ' + uid : '')
      });
      Util.retro('error');
      agregarAlHistorial({
        clase: 'error', dorsal: '?', nombre: 'Manilla sin vincular',
        texto: 'Marca pendiente' + (uid ? ' · ' + uid : ''), ts: p.ts
      });
      pintarPendientes();
      App.datosCambiaron();
      return;
    }

    const res = await Estado.registrar({ dorsal, ts, metodo: 'nfc' });
    mostrarResultado(res);
  }

  /* ---------------- teclado de respaldo ---------------- */

  function abrirTecladoRespaldo() {
    const d = $('#det-teclado');
    if (d) d.open = true;
  }

  function construirTeclado() {
    const caja = $('#teclado');
    caja.innerHTML = '';
    for (const t of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']) {
      caja.append(Util.el('button', {
        clase: (t === 'C' || t === '⌫') ? 'btn btn-secundario' : 'btn btn-primario',
        type: 'button', texto: t,
        onclick: () => pulsarTecla(t)
      }));
    }
    actualizarVisor();
  }

  function actualizarVisor() {
    const n = Number(est.config.digitosDorsal) || 3;
    $('#teclado-digitos').textContent = digitos ? digitos.padEnd(n, '·') : '·'.repeat(n);
    $('#teclado-ayuda').textContent =
      'Se registra automáticamente al completar ' + n + ' dígito' + (n === 1 ? '' : 's') + '.';
  }

  async function pulsarTecla(t) {
    Util.prepararAudio();
    const n = Number(est.config.digitosDorsal) || 3;
    if (t === 'C') { digitos = ''; actualizarVisor(); Util.vibrar(20); return; }
    if (t === '⌫') { digitos = digitos.slice(0, -1); actualizarVisor(); Util.vibrar(20); return; }
    if (digitos.length >= n) return;
    digitos += t;
    Util.vibrar(15);
    actualizarVisor();
    if (digitos.length === n) {
      const dorsal = Number(digitos);
      digitos = '';
      actualizarVisor();
      mostrarResultado(await Estado.registrar({ dorsal, ts: Date.now(), metodo: 'teclado' }));
    }
  }

  /* ---------------- marcas pendientes ---------------- */

  async function marcarSinIdentificar() {
    Util.prepararAudio();
    const p = await Estado.marcarPendiente(Date.now());
    Util.retro('neutro');
    pintarPanel({
      clase: 'estado-espera',
      dorsal: '⏱',
      nombre: 'Marca sin identificar',
      detalle: 'Guardada. Escribe el dorsal cuando lo sepas.',
      hora: Util.hora(p.ts)
    });
    pintarPendientes();
    $('#det-pendientes').open = true;
    App.datosCambiaron();
  }

  function pintarPendientes() {
    const caja = $('#lista-pendientes');
    $('#chip-pendientes').textContent = String(est.pendientes.length);
    caja.innerHTML = '';
    if (!est.pendientes.length) {
      caja.append(Util.el('div', { clase: 'item-vacio', texto: 'No hay marcas pendientes.' }));
      return;
    }
    for (const p of est.pendientes) {
      const entrada = Util.el('input', {
        type: 'number', inputmode: 'numeric', min: '1', step: '1',
        placeholder: 'Dorsal',
        'aria-label': 'Dorsal para la marca de las ' + Util.hora(p.ts)
      });
      const asignar = Util.el('button', {
        clase: 'btn btn-primario', type: 'button', texto: 'Asignar',
        onclick: async () => {
          const dorsal = Number(entrada.value);
          if (!dorsal) { Util.aviso('Escribe un dorsal', 'error'); return; }
          const res = await Estado.asignarPendiente(p.id, dorsal);
          if (res.estado === 'error') {
            Util.aviso(res.mensaje, 'error');
            Util.retro('error');
          } else {
            // Si la marca traía una manilla desconocida, se aprovecha para vincularla.
            if (p.uid && !est.porUid.has(p.uid)) {
              const v = await Estado.vincularUid(dorsal, p.uid);
              if (v.ok) Util.aviso('Manilla vinculada al dorsal ' + dorsal, 'ok');
            }
            Util.aviso('Dorsal ' + dorsal + ': ' + res.mensaje +
                       ' (hora original ' + Util.hora(p.ts) + ')', 'ok');
            Util.retro(res.estado === 'final' ? 'final' : 'ok');
            agregarAlHistorial({
              clase: res.estado === 'final' ? 'final' : 'ok',
              dorsal, nombre: res.corredor ? res.corredor.nombre : '',
              texto: 'Vuelta ' + res.vuelta + '/' + res.total + ' · asignada', ts: p.ts
            });
          }
          pintarPendientes();
          App.datosCambiaron();
        }
      });
      const descartar = Util.el('button', {
        clase: 'btn btn-peligro-suave', type: 'button', texto: '✕',
        'aria-label': 'Descartar marca',
        onclick: async () => {
          if (!await Util.confirmar('Descartar marca',
            'Se eliminará la marca de las ' + Util.hora(p.ts) + '. Esta acción no se puede deshacer.',
            'Sí, descartar')) return;
          await Estado.quitarPendiente(p.id);
          pintarPendientes();
          App.datosCambiaron();
        }
      });

      const fila = Util.el('div', { clase: 'item-fila' }, [
        Util.el('span', { clase: 'item-meta', texto: Util.hora(p.ts) }),
        entrada, asignar, descartar
      ]);
      const contenedor = Util.el('div', { clase: 'item' }, [fila]);
      if (p.uid) {
        contenedor.prepend(Util.el('span', { clase: 'item-codigo', texto: '🔗 ' + p.uid }));
      }
      caja.append(contenedor);
    }
  }

  /* ---------------- deshacer ---------------- */

  async function deshacer() {
    const ev = est.ultimoLocal;
    if (!ev) return;
    const c = est.corredores.get(ev.dorsal);
    const ok = await Util.confirmar(
      'Deshacer último registro',
      'Se eliminará la vuelta del dorsal ' + ev.dorsal +
      (c && c.nombre ? ' (' + c.nombre + ')' : '') + ' registrada a las ' + Util.hora(ev.ts) + '.',
      'Sí, deshacer');
    if (!ok) return;
    await Estado.deshacerUltimo();
    Util.aviso('Registro deshecho: dorsal ' + ev.dorsal, 'ok');
    Util.retro('neutro');
    $('#btn-deshacer').disabled = true;
    panelEspera();
    historialDesdeDatos();
    App.datosCambiaron();
  }

  /* ---------------- ciclo de vida ---------------- */

  function iniciar() {
    $('#btn-nfc').addEventListener('click', alternarNfc);
    $('#btn-sin-identificar').addEventListener('click', marcarSinIdentificar);
    $('#btn-deshacer').addEventListener('click', deshacer);

    construirTeclado();
    panelEspera();
    pintarSalidas();
    pintarPendientes();
    historialDesdeDatos();

    if (!NFC.disponible()) {
      $('#nfc-estado').textContent =
        'Este navegador no tiene Web NFC: la app arranca en modo teclado. ' +
        'Usa Chrome para Android en un celular con NFC para leer las manillas.';
      $('#btn-nfc').disabled = true;
      abrirTecladoRespaldo();
    }

    cronometro = setInterval(actualizarCronometros, 1000);
  }

  function refrescar(reiniciarPanel) {
    if (reiniciarPanel === undefined) reiniciarPanel = true;
    actualizarVisor();
    pintarSalidas();
    pintarPendientes();
    historialDesdeDatos();
    if (reiniciarPanel) panelEspera();
    $('#btn-deshacer').disabled = !est.ultimoLocal;
  }

  return { iniciar, refrescar, pintarPendientes, pintarSalidas, tsDesdeHora };
})();
