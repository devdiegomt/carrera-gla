/* ============================================================
   carrera.js — la pantalla que se usa durante la carrera.

   Es la única que el profesor mira con el celular en la mano y
   corredores pasando: una sola acción principal, un panel enorme
   que se lee de lejos, y todo lo demás plegado.
   ============================================================ */
'use strict';

const Carrera = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let digitos = '';
  let historial = [];
  let btnLectura, btnDeshacer, textoEstado;
  let bloqueSalidas, bloqueTeclado, bloquePendientes, bloqueHistorial;
  let visorTeclado, ayudaTeclado;

  /* ================= panel ================= */

  function pintarPanel({ tono, dorsal, nombre, detalle, pie }) {
    const p = $('#panel');
    p.className = 'panel panel--' + tono;
    $('#panel-dorsal').textContent = dorsal;
    $('#panel-nombre').textContent = nombre;
    $('#panel-detalle').textContent = detalle;
    $('#panel-pie').textContent = pie || '';
    p.classList.remove('esta-nuevo');
    void p.offsetWidth;
    p.classList.add('esta-nuevo');
  }

  function panelEspera() {
    const leyendo = NFC.estaActivo();
    pintarPanel({
      tono: 'espera',
      dorsal: '',
      nombre: leyendo ? 'Acerca una manilla' : 'Listo para leer',
      detalle: leyendo
        ? 'Al centro de la parte de atrás del celular'
        : 'Activa la lectura o usa el teclado',
      pie: est.tandaActiva ? est.tandaActiva.nombre : ''
    });
  }

  function mostrarResultado(res) {
    const total = res.total || Estado.vueltas();

    if (res.estado === 'ok' || res.estado === 'final') {
      const meta = res.estado === 'final';
      const extra = [];
      if (res.oleada && Estado.oleadas().length > 1) extra.push(res.oleada.nombre);
      if (res.neto != null) extra.push('Tiempo ' + Util.duracion(res.neto));
      pintarPanel({
        tono: meta ? 'meta' : 'ok',
        dorsal: res.dorsal,
        nombre: (res.corredor && res.corredor.nombre) || 'Dorsal ' + res.dorsal,
        detalle: meta ? 'Terminó · vuelta ' + res.vuelta + ' de ' + total
                      : 'Vuelta ' + res.vuelta + ' de ' + total,
        pie: Util.hora(res.evento.ts) + (extra.length ? ' · ' + extra.join(' · ') : '')
      });
      Util.retro(meta ? 'final' : 'ok');
      apuntar({
        tono: meta ? 'meta' : 'ok',
        dorsal: res.dorsal,
        nombre: (res.corredor && res.corredor.nombre) || '',
        detalle: (meta ? 'Terminó · ' : '') + 'Vuelta ' + res.vuelta + ' de ' + total,
        ts: res.evento.ts
      });
    } else {
      pintarPanel({
        tono: 'error',
        dorsal: res.dorsal || '',
        nombre: (res.corredor && res.corredor.nombre) || 'No se registró',
        detalle: res.mensaje,
        pie: Util.hora(Date.now())
      });
      Util.retro('error');
      apuntar({
        tono: 'error',
        dorsal: res.dorsal || '?',
        nombre: (res.corredor && res.corredor.nombre) || '',
        detalle: res.mensaje,
        ts: Date.now()
      });
    }
    btnDeshacer.disabled = !est.ultimoLocal;
    App.datosCambiaron();
  }

  /* ================= últimas lecturas ================= */

  function apuntar(entrada) {
    historial.unshift(entrada);
    if (historial.length > 10) historial.length = 10;
    pintarHistorial();
  }

  function pintarHistorial() {
    if (!bloqueHistorial) return;
    const caja = bloqueHistorial.cuerpo;
    caja.innerHTML = '';
    if (!historial.length) {
      caja.append(UI.vacio({
        icono: 'reloj',
        titulo: 'Todavía no hay lecturas',
        mensaje: 'Aquí aparecerán las últimas diez.'
      }));
      return;
    }
    const lista = UI.el('div', { clase: 'lista' });
    for (const h of historial) {
      lista.append(UI.el('div', { clase: 'fila fila--' + h.tono }, [
        UI.el('span', { clase: 'fila__dorsal', texto: String(h.dorsal) }),
        UI.el('div', { clase: 'fila__cuerpo' }, [
          UI.el('div', { clase: 'fila__titulo', texto: h.nombre || 'Sin nombre' }),
          UI.el('div', { clase: 'fila__meta', texto: h.detalle })
        ]),
        UI.el('div', { clase: 'fila__derecha' }, [
          UI.el('div', { clase: 'fila__meta', texto: Util.hora(h.ts) })
        ])
      ]));
    }
    caja.append(lista);
  }

  function historialDesdeDatos() {
    const total = Estado.vueltas();
    historial = Estado.todosLosEventos().slice(-10).reverse().map(ev => {
      const arr = Estado.eventosDe(ev.dorsal);
      const n = arr.findIndex(x => x.id === ev.id) + 1;
      const c = est.corredores.get(ev.dorsal);
      return {
        tono: n >= total ? 'meta' : 'ok',
        dorsal: ev.dorsal,
        nombre: c ? c.nombre : '',
        detalle: 'Vuelta ' + n + ' de ' + total,
        ts: ev.ts
      };
    });
    pintarHistorial();
  }

  /* ================= salidas ================= */

  function pintarSalidas() {
    if (!bloqueSalidas) return;
    const caja = bloqueSalidas.cuerpo;
    const lista = Estado.oleadas();
    const dadas = lista.filter(o => o.horaSalida).length;
    bloqueSalidas.fijarInsignia(dadas + '/' + lista.length);
    caja.innerHTML = '';

    caja.append(UI.el('p', {
      clase: 'campo__ayuda',
      texto: 'Toca en el momento exacto del pito. El tiempo de cada corredor se cuenta ' +
             'desde la salida de su propio grupo.'
    }));

    const pila = UI.el('div', { clase: 'lista', style: 'margin-top:12px' });
    for (const o of lista) {
      let cuantos = 0;
      for (const c of est.corredores.values()) if (c.oleada === o.id) cuantos++;

      const fila = UI.el('div', { clase: 'salida' + (o.horaSalida ? ' salida--dada' : '') }, [
        UI.el('div', { clase: 'salida__cuerpo' }, [
          UI.el('div', { clase: 'salida__nombre recorta', texto: o.nombre }),
          UI.el('div', { clase: 'salida__meta', texto: cuantos + (cuantos === 1 ? ' corredor' : ' corredores') })
        ])
      ]);

      if (o.horaSalida) {
        fila.append(UI.el('div', {}, [
          UI.el('div', { clase: 'salida__hora', texto: Util.hora(o.horaSalida) }),
          UI.el('div', { clase: 'salida__crono', datos: { desde: o.horaSalida }, texto: '' })
        ]));
        fila.append(UI.boton({
          icono: 'lapiz', tipo: 'fantasma', etiqueta: 'Corregir la hora de salida',
          alPulsar: () => corregirSalida(o)
        }));
      } else {
        fila.append(UI.boton({
          texto: 'Dar salida', tipo: 'principal',
          alPulsar: () => darSalida(o)
        }));
      }
      pila.append(fila);
    }
    caja.append(pila);
    actualizarCronos();
  }

  async function darSalida(oleada) {
    Util.prepararAudio();
    const ts = Date.now();
    await Estado.darSalida(oleada.id, ts);
    Util.retro('final');
    UI.aviso(oleada.nombre + ' salió a las ' + Util.hora(ts), 'ok');
    pintarSalidas();
    App.datosCambiaron();
  }

  async function corregirSalida(oleada) {
    const base = oleada.horaSalida || Date.now();
    const [h, m, s] = Util.hora(base).split(':').map(Number);
    const campo = UI.campoHora({
      etiqueta: 'Hora de salida',
      ayuda: 'Hora de Bogotá, formato 24 horas. Se aplica al día de hoy.',
      horas: h, minutos: m, segundos: s
    });

    const r = await UI.hoja({
      titulo: 'Corregir ' + oleada.nombre,
      descripcion: 'Úsalo solo si no alcanzaste a tocar el botón en el momento de la salida.',
      cuerpo: campo,
      acciones: [
        { texto: 'Guardar hora', tipo: 'principal', valor: 'ok' },
        { texto: 'Quitar la hora de salida', tipo: 'peligro', valor: 'quitar' }
      ]
    });
    if (!r) return;

    if (r === 'quitar') {
      await Estado.actualizarOleada(oleada.id, { horaSalida: null });
      UI.aviso('Se quitó la hora de salida', 'neutro');
    } else {
      const v = campo.obtenerValor();
      await Estado.actualizarOleada(oleada.id, { horaSalida: Util.tsDesdeHora(v.horas, v.minutos, v.segundos) });
      UI.aviso('Hora de salida guardada', 'ok');
    }
    pintarSalidas();
    App.datosCambiaron();
  }

  function actualizarCronos() {
    for (const n of Util.$$('.salida__crono')) {
      const desde = Number(n.dataset.desde);
      n.textContent = desde ? 'Van ' + Util.duracion(Date.now() - desde) : '';
    }
  }

  /* ================= NFC ================= */

  async function alternarLectura() {
    Util.prepararAudio();
    if (NFC.estaActivo()) {
      NFC.detener();
      App.soltarPantalla();
      pintarBotonLectura();
      panelEspera();
      textoEstado.textContent = 'Lectura apagada.';
      return;
    }
    textoEstado.textContent = 'Pidiendo permiso…';
    const ok = await NFC.iniciar(alLeer, (e, mensaje) => {
      textoEstado.textContent = mensaje;
      pintarBotonLectura();
      if (e && e.name !== 'ReadingError') {
        UI.alerta({ titulo: 'No se pudo usar el NFC', mensaje });
        if (bloqueTeclado) bloqueTeclado.classList.add('esta-abierto');
      } else {
        Util.retro('error');
      }
    });
    if (ok) {
      textoEstado.textContent = 'Leyendo. Acerca la manilla a la parte de atrás del celular.';
      App.mantenerPantalla();
      panelEspera();
    }
    pintarBotonLectura();
  }

  function pintarBotonLectura() {
    const activo = NFC.estaActivo();
    btnLectura.classList.toggle('esta-activo', activo);
    btnLectura.classList.toggle('btn--principal', !activo);
    btnLectura.querySelector('.btn__texto').textContent = activo
      ? 'Leyendo — tocar para parar'
      : 'Activar lectura';
  }

  async function alLeer({ uid, dorsalEnChip, ts }) {
    let dorsal = uid != null ? est.porUid.get(uid) : undefined;
    if (dorsal == null && dorsalEnChip != null && est.corredores.has(dorsalEnChip)) {
      dorsal = dorsalEnChip;
    }

    if (dorsal == null) {
      const hist = uid ? Estado.historialDeChip(uid) : null;
      const previo = hist && hist.previos[0];
      const p = await Estado.marcarPendiente(ts, uid ? { uid } : null);
      pintarPanel({
        tono: 'error',
        dorsal: '?',
        nombre: 'Manilla sin dueño',
        detalle: previo
          ? 'En ' + hist.nombreTanda(previo.tanda) + ' era el dorsal ' + previo.dorsal +
            '. Se guardó la hora para que le pongas el dorsal.'
          : 'Se guardó la hora. Ponle el dorsal en «Sin dorsal».',
        pie: Util.hora(p.ts)
      });
      Util.retro('error');
      apuntar({ tono: 'error', dorsal: '?', nombre: 'Manilla sin dueño', detalle: 'Guardada sin dorsal', ts: p.ts });
      pintarPendientes();
      App.datosCambiaron();
      return;
    }

    mostrarResultado(await Estado.registrar({ dorsal, ts, metodo: 'nfc' }));
  }

  /* ================= teclado ================= */

  function construirTeclado(caja) {
    visorTeclado = UI.el('div', { clase: 'visor' });
    ayudaTeclado = UI.el('p', { clase: 'campo__ayuda', style: 'text-align:center;margin-bottom:12px' });
    const rejilla = UI.el('div', { clase: 'teclado' });

    for (const t of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      rejilla.append(UI.boton({ texto: t, alPulsar: () => tecla(t) }));
    }
    rejilla.append(UI.boton({ texto: 'Borrar', tamano: 'chico', alPulsar: () => tecla('C') }));
    rejilla.append(UI.boton({ texto: '0', alPulsar: () => tecla('0') }));
    rejilla.append(UI.boton({ icono: 'izquierda', etiqueta: 'Borrar un dígito', alPulsar: () => tecla('<') }));

    caja.append(visorTeclado, ayudaTeclado, rejilla);
    actualizarVisor();
  }

  function actualizarVisor() {
    if (!visorTeclado) return;
    const n = Number(est.config.digitosDorsal) || 3;
    visorTeclado.textContent = digitos ? digitos.padEnd(n, '·') : '·'.repeat(n);
    ayudaTeclado.textContent = 'Se registra solo al completar ' + n +
      (n === 1 ? ' dígito' : ' dígitos');
  }

  async function tecla(t) {
    Util.prepararAudio();
    const n = Number(est.config.digitosDorsal) || 3;
    if (t === 'C') { digitos = ''; actualizarVisor(); Util.vibrar(18); return; }
    if (t === '<') { digitos = digitos.slice(0, -1); actualizarVisor(); Util.vibrar(18); return; }
    if (digitos.length >= n) return;
    digitos += t;
    Util.vibrar(12);
    actualizarVisor();
    if (digitos.length === n) {
      const dorsal = Number(digitos);
      digitos = '';
      actualizarVisor();
      mostrarResultado(await Estado.registrar({ dorsal, ts: Date.now(), metodo: 'teclado' }));
    }
  }

  /* ================= sin dorsal ================= */

  async function anotarSinDorsal() {
    Util.prepararAudio();
    const p = await Estado.marcarPendiente(Date.now());
    Util.retro('neutro');
    pintarPanel({
      tono: 'espera',
      dorsal: '',
      nombre: 'Hora guardada',
      detalle: 'Ponle el dorsal cuando sepas quién era, en «Sin dorsal».',
      pie: Util.hora(p.ts)
    });
    pintarPendientes();
    if (bloquePendientes) bloquePendientes.classList.add('esta-abierto');
    App.datosCambiaron();
  }

  function pintarPendientes() {
    if (!bloquePendientes) return;
    const caja = bloquePendientes.cuerpo;
    bloquePendientes.fijarInsignia(est.pendientes.length);
    caja.innerHTML = '';

    if (!est.pendientes.length) {
      caja.append(UI.vacio({
        icono: 'cheque',
        titulo: 'Nada pendiente',
        mensaje: 'Aquí se guardan las vueltas de las que no alcanzaste a ver el dorsal.'
      }));
      return;
    }

    caja.append(UI.el('p', {
      clase: 'campo__ayuda',
      texto: 'Cada una guarda su hora original. Al ponerle el dorsal, la vuelta cuenta con esa hora.'
    }));

    const lista = UI.el('div', { clase: 'lista', style: 'margin-top:12px' });
    for (const p of est.pendientes) {
      lista.append(UI.el('button', {
        clase: 'fila', type: 'button',
        onclick: () => resolverPendiente(p)
      }, [
        UI.icono('reloj'),
        UI.el('div', { clase: 'fila__cuerpo' }, [
          UI.el('div', { clase: 'fila__titulo', texto: Util.hora(p.ts) }),
          UI.el('div', { clase: 'fila__meta', texto: p.uid ? 'Manilla sin dueño' : 'Anotada a mano' })
        ]),
        UI.icono('derecha')
      ]));
    }
    caja.append(lista);
  }

  async function resolverPendiente(p) {
    const campo = UI.campo({
      etiqueta: 'Dorsal del corredor',
      tipo: 'number',
      marcador: 'Ej.: 101',
      ayuda: p.uid ? 'Al guardarlo, esta manilla también queda asignada a ese dorsal.' : null
    });

    const r = await UI.hoja({
      titulo: 'Vuelta de las ' + Util.hora(p.ts),
      descripcion: 'La vuelta se guardará con esa hora, no con la hora de ahora.',
      cuerpo: campo,
      acciones: [
        { texto: 'Guardar la vuelta', tipo: 'principal', valor: 'ok' },
        { texto: 'Descartar esta marca', tipo: 'peligro', valor: 'borrar' }
      ]
    });
    if (!r) return;

    if (r === 'borrar') {
      const ok = await UI.confirmar({
        titulo: 'Descartar la marca',
        mensaje: 'Se perderá la vuelta de las ' + Util.hora(p.ts) + '. No se puede deshacer.',
        confirmar: 'Sí, descartar'
      });
      if (!ok) return;
      await Estado.quitarPendiente(p.id);
      UI.aviso('Marca descartada', 'neutro');
      pintarPendientes();
      App.datosCambiaron();
      return;
    }

    const dorsal = Number(campo.obtenerValor());
    if (!dorsal) { UI.aviso('Escribe un dorsal', 'error'); return; }

    const res = await Estado.asignarPendiente(p.id, dorsal);
    if (res.estado === 'error') {
      UI.aviso(res.mensaje, 'error');
      Util.retro('error');
    } else {
      if (p.uid && !est.porUid.has(p.uid)) await Estado.vincularUid(dorsal, p.uid, true);
      UI.aviso('Dorsal ' + dorsal + ' · ' + res.mensaje, 'ok');
      Util.retro(res.estado === 'final' ? 'final' : 'ok');
      apuntar({
        tono: res.estado === 'final' ? 'meta' : 'ok',
        dorsal,
        nombre: (res.corredor && res.corredor.nombre) || '',
        detalle: 'Vuelta ' + res.vuelta + ' de ' + res.total,
        ts: p.ts
      });
    }
    pintarPendientes();
    App.datosCambiaron();
  }

  /* ================= deshacer ================= */

  async function deshacer() {
    const ev = est.ultimoLocal;
    if (!ev) return;
    const c = est.corredores.get(ev.dorsal);
    const ok = await UI.confirmar({
      titulo: 'Deshacer la última vuelta',
      mensaje: 'Se borrará la vuelta del dorsal ' + ev.dorsal +
               (c && c.nombre ? ' (' + c.nombre + ')' : '') +
               ' registrada a las ' + Util.hora(ev.ts) + '.',
      confirmar: 'Sí, deshacer'
    });
    if (!ok) return;
    await Estado.deshacerUltimo();
    UI.aviso('Vuelta deshecha: dorsal ' + ev.dorsal, 'ok');
    Util.retro('neutro');
    btnDeshacer.disabled = true;
    panelEspera();
    historialDesdeDatos();
    App.datosCambiaron();
  }

  /* ================= construcción ================= */

  function iniciar() {
    const acciones = $('#carrera-acciones');
    acciones.innerHTML = '';

    btnLectura = UI.boton({
      texto: 'Activar lectura', icono: 'nfc', tipo: 'principal',
      tamano: 'grande', ancho: 'completo', alPulsar: alternarLectura
    });
    textoEstado = UI.el('p', { clase: 'campo__ayuda', style: 'margin:8px 0 12px' });

    btnDeshacer = UI.boton({ texto: 'Deshacer', icono: 'deshacer', alPulsar: deshacer });
    btnDeshacer.disabled = true;

    acciones.append(
      btnLectura,
      textoEstado,
      UI.el('div', { clase: 'acciones' }, [
        UI.boton({ texto: 'Anotar sin dorsal', icono: 'reloj', alPulsar: anotarSinDorsal }),
        btnDeshacer
      ])
    );

    const bloques = $('#carrera-bloques');
    bloques.innerHTML = '';

    bloqueSalidas = UI.plegable({ titulo: 'Salidas', insignia: '0/0', cuerpo: UI.el('div'), abierto: true });
    bloqueTeclado = UI.plegable({ titulo: 'Teclado', cuerpo: UI.el('div') });
    bloquePendientes = UI.plegable({ titulo: 'Sin dorsal', insignia: 0, cuerpo: UI.el('div') });
    bloqueHistorial = UI.plegable({ titulo: 'Últimas lecturas', cuerpo: UI.el('div'), abierto: true });

    bloques.append(bloqueSalidas, bloqueTeclado, bloquePendientes, bloqueHistorial);
    construirTeclado(bloqueTeclado.cuerpo);

    panelEspera();
    pintarSalidas();
    pintarPendientes();
    historialDesdeDatos();

    if (!NFC.disponible()) {
      btnLectura.disabled = true;
      textoEstado.textContent =
        'Este celular o navegador no tiene NFC. Puedes registrar con el teclado. ' +
        'Para leer manillas usa Chrome en un Android con NFC.';
      bloqueTeclado.classList.add('esta-abierto');
    }

    setInterval(actualizarCronos, 1000);
  }

  function refrescar(reiniciarPanel) {
    if (reiniciarPanel === undefined) reiniciarPanel = true;
    actualizarVisor();
    pintarSalidas();
    pintarPendientes();
    historialDesdeDatos();
    if (reiniciarPanel) panelEspera();
    if (btnDeshacer) btnDeshacer.disabled = !est.ultimoLocal;
    if (btnLectura) pintarBotonLectura();
  }

  return { iniciar, refrescar, pintarPendientes, pintarSalidas };
})();
