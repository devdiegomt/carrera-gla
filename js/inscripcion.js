/* ============================================================
   inscripcion.js — inscripción exprés por manilla, alta manual,
   vinculación, lista buscable y carga masiva.
   ============================================================ */
'use strict';

const Inscripcion = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let filtro = '';
  let soloSinChip = false;
  let planMasivo = null;

  // Estado del modo exprés
  let expresActivo = false;
  let chipLeido = null;      // { uid, hist }

  /* ================= inscripción exprés ================= */

  async function alternarExpres() {
    Util.prepararAudio();
    if (expresActivo) {
      NFC.detener();
      expresActivo = false;
      pintarBotonExpres();
      $('#expres-estado').textContent = 'Lectura detenida.';
      return;
    }
    if (!NFC.disponible()) {
      Util.alerta('NFC no disponible', NFC.mensajeError({ name: 'NotSupportedError' }));
      return;
    }
    if (NFC.estaActivo()) {
      NFC.detener();
      Carrera.refrescar();
      Util.aviso('Se detuvo la lectura de la carrera para inscribir', '');
    }

    $('#expres-estado').textContent = 'Pidiendo permiso de NFC…';
    const ok = await NFC.iniciar(alLeerManilla, (e, mensaje) => {
      $('#expres-estado').textContent = mensaje;
      if (e && e.name !== 'ReadingError') {
        expresActivo = false;
        pintarBotonExpres();
        Util.alerta('NFC no disponible', mensaje);
      } else {
        Util.retro('error');
      }
    });
    if (ok) {
      expresActivo = true;
      App.mantenerPantalla();
      $('#expres-estado').textContent = 'Acerca la primera manilla.';
    }
    pintarBotonExpres();
  }

  function pintarBotonExpres() {
    const b = $('#btn-expres');
    $('#btn-expres-texto').textContent = expresActivo
      ? 'Escaneando — tocar para detener'
      : 'Escanear manilla e inscribir';
    b.classList.toggle('btn-activo', expresActivo);
    b.classList.toggle('btn-primario', !expresActivo);
    b.querySelector('.btn-icono').textContent = expresActivo ? '🟢' : '📡';
  }

  function alLeerManilla({ uid }) {
    if (!uid) {
      $('#expres-estado').textContent = 'Esa manilla no expone un identificador legible.';
      Util.retro('error');
      return;
    }
    if (!$('#expres-form').hidden) {
      $('#expres-estado').textContent = 'Termina con la manilla anterior (guardar o descartar).';
      Util.retro('error');
      return;
    }

    chipLeido = { uid, hist: Estado.historialDeChip(uid) };
    Util.retro('ok');
    pintarFormularioExpres();
  }

  function pintarFormularioExpres() {
    const { uid, hist } = chipLeido;
    const form = $('#expres-form');
    form.hidden = false;

    $('#expres-chip').textContent = '🔗 ' + uid;

    const caja = $('#expres-historial');
    caja.innerHTML = '';
    caja.hidden = true;

    let dorsalSugerido = null;
    let categoriaSugerida = '';

    if (hist.actual) {
      caja.hidden = false;
      caja.append(Util.el('p', {
        clase: 'malo',
        texto: 'Esta manilla YA está vinculada en ' + est.tandaActiva.nombre +
               ' al dorsal ' + hist.actual.dorsal +
               (hist.actual.nombre ? ' (' + hist.actual.nombre + ')' : '') +
               '. Si guardas con otro dorsal, se la quitas a ese corredor.'
      }));
      dorsalSugerido = hist.actual.dorsal;
      categoriaSugerida = hist.actual.categoria || '';
    } else if (hist.previos.length) {
      caja.hidden = false;
      caja.append(Util.el('p', { texto: 'Esta manilla se usó antes:' }));
      const ul = Util.el('ul', {});
      for (const p of hist.previos.slice(0, 4)) {
        ul.append(Util.el('li', {
          texto: hist.nombreTanda(p.tanda) + ' · dorsal ' + p.dorsal +
                 (p.nombre ? ' · ' + p.nombre : '')
        }));
      }
      caja.append(ul);
      const previo = hist.previos[0];
      if (!est.corredores.has(previo.dorsal)) {
        dorsalSugerido = previo.dorsal;
        caja.append(Util.el('p', {
          clase: 'bueno',
          texto: 'Se propone el mismo dorsal ' + previo.dorsal + ': está libre en esta tanda.'
        }));
      } else {
        caja.append(Util.el('p', {
          clase: 'malo',
          texto: 'El dorsal ' + previo.dorsal + ' ya está ocupado en esta tanda; se propone el siguiente libre.'
        }));
      }
      categoriaSugerida = previo.categoria || '';
    }

    $('#ex-dorsal').value = String(dorsalSugerido || Estado.siguienteDorsal());
    $('#ex-nombre').value = '';
    $('#ex-categoria').value = categoriaSugerida;
    llenarSelectOleadas($('#ex-oleada'));
    $('#expres-estado').textContent = 'Manilla leída. Escribe el nombre y guarda.';
    $('#ex-nombre').focus();
  }

  async function guardarExpres() {
    if (!chipLeido) return;
    const dorsal = Number($('#ex-dorsal').value);
    const nombre = $('#ex-nombre').value.trim();
    if (!Number.isFinite(dorsal) || dorsal <= 0) {
      Util.aviso('Dorsal inválido', 'error');
      return;
    }
    if (Estado.fueraDeRango(dorsal)) {
      const ok = await Util.confirmar(
        'Dorsal fuera de tu rango',
        'Este dispositivo tiene asignado el rango ' + textoRango() + '.\n' +
        'Usar el ' + dorsal + ' puede chocar con otro organizador al unir.',
        'Usarlo igual', false);
      if (!ok) return;
    }

    const ocupado = est.corredores.get(dorsal);
    if (ocupado && ocupado.nombre && ocupado.nombre !== nombre) {
      const ok = await Util.confirmar(
        'Dorsal ocupado',
        'El dorsal ' + dorsal + ' ya es de ' + ocupado.nombre + ' en esta tanda. ' +
        '¿Reemplazar sus datos?',
        'Sí, reemplazar', false);
      if (!ok) return;
    }

    await Estado.guardarCorredor({
      dorsal, nombre,
      categoria: $('#ex-categoria').value.trim(),
      oleada: Number($('#ex-oleada').value) || 1
    });
    const v = await Estado.vincularUid(dorsal, chipLeido.uid, true);
    if (!v.ok) { Util.aviso(v.mensaje, 'error'); return; }

    Util.retro('final');
    Util.aviso('Dorsal ' + dorsal + (nombre ? ' · ' + nombre : '') + ' listo', 'ok');
    cerrarFormularioExpres();
    $('#expres-estado').textContent = expresActivo
      ? 'Guardado. Acerca la siguiente manilla.'
      : 'Guardado.';
    App.datosCambiaron();
  }

  function cerrarFormularioExpres() {
    chipLeido = null;
    $('#expres-form').hidden = true;
    $('#expres-historial').hidden = true;
  }

  function textoRango() {
    const d = Number(est.config.rangoDesde) || null;
    const h = Number(est.config.rangoHasta) || null;
    if (d && h) return d + '–' + h;
    if (d) return 'desde ' + d;
    if (h) return 'hasta ' + h;
    return 'sin límite';
  }

  /* ================= alta manual ================= */

  async function guardarDesdeFormulario(ev) {
    ev.preventDefault();
    const dorsal = Number($('#in-dorsal').value);
    const nombre = $('#in-nombre').value.trim();

    if (!Number.isFinite(dorsal) || dorsal <= 0) {
      Util.aviso('El dorsal debe ser un número mayor que cero', 'error');
      return;
    }
    if (!nombre) { Util.aviso('Escribe el nombre del corredor', 'error'); return; }

    if (Estado.fueraDeRango(dorsal)) {
      const ok = await Util.confirmar(
        'Dorsal fuera de tu rango',
        'Este dispositivo tiene asignado el rango ' + textoRango() + '.\n' +
        'Usar el ' + dorsal + ' puede chocar con otro organizador al unir.',
        'Usarlo igual', false);
      if (!ok) return;
    }

    const previo = est.corredores.get(dorsal);
    if (previo && previo.nombre) {
      const ok = await Util.confirmar(
        'Dorsal ya usado',
        'El dorsal ' + dorsal + ' ya es de ' + previo.nombre + ' en ' + est.tandaActiva.nombre +
        '. ¿Reemplazar sus datos? La manilla vinculada y sus vueltas se conservan.',
        'Sí, reemplazar', false);
      if (!ok) return;
    }

    await Estado.guardarCorredor({
      dorsal, nombre,
      categoria: $('#in-categoria').value.trim(),
      oleada: Number($('#in-oleada').value) || 1
    });
    Util.aviso('Guardado: ' + dorsal + ' · ' + nombre, 'ok');

    $('#in-nombre').value = '';
    $('#in-dorsal').value = String(Estado.siguienteDorsal());
    $('#in-nombre').focus();
    App.datosCambiaron();
  }

  /* ================= vincular manilla ================= */

  async function vincular() {
    Util.prepararAudio();
    const dorsal = Number($('#in-vincular-dorsal').value);
    if (!Number.isFinite(dorsal) || dorsal <= 0) {
      Util.aviso('Escribe el dorsal que vas a vincular', 'error');
      return;
    }
    if (!est.corredores.get(dorsal)) {
      Util.aviso('El dorsal ' + dorsal + ' no está inscrito en esta tanda', 'error');
      return;
    }
    if (!NFC.disponible()) {
      Util.alerta('NFC no disponible', NFC.mensajeError({ name: 'NotSupportedError' }));
      return;
    }
    if (NFC.estaActivo()) {
      NFC.detener();
      expresActivo = false;
      pintarBotonExpres();
      Carrera.refrescar();
    }

    $('#vincular-estado').textContent = 'Acerca la manilla del dorsal ' + dorsal + '…';

    let usado = false;
    await NFC.iniciar(async ({ uid }) => {
      if (usado) return;
      usado = true;
      NFC.detener();
      if (!uid) {
        $('#vincular-estado').textContent = 'La manilla no expone un identificador legible.';
        Util.retro('error');
        return;
      }
      let r = await Estado.vincularUid(dorsal, uid);
      if (!r.ok && r.ocupadoPor != null) {
        const forzar = await Util.confirmar('Manilla ocupada',
          r.mensaje + '.\n¿Se la quitas a ese dorsal y se la das al ' + dorsal + '?',
          'Sí, reasignar', false);
        if (!forzar) { $('#vincular-estado').textContent = r.mensaje; return; }
        r = await Estado.vincularUid(dorsal, uid, true);
      }
      $('#vincular-estado').textContent = r.mensaje + (r.ok ? ' · ' + uid : '');
      Util.aviso(r.mensaje, r.ok ? 'ok' : 'error');
      Util.retro(r.ok ? 'ok' : 'error');
      if (r.ok) {
        $('#in-vincular-dorsal').value = '';
        App.datosCambiaron();
      }
    }, (e, mensaje) => {
      $('#vincular-estado').textContent = mensaje;
      if (e && e.name !== 'ReadingError') Util.alerta('NFC no disponible', mensaje);
    });
  }

  /* ================= lista ================= */

  function coincide(c, q) {
    if (soloSinChip && c.uid) return false;
    if (!q) return true;
    return String(c.dorsal).includes(q) ||
           (c.nombre || '').toLowerCase().includes(q) ||
           (c.categoria || '').toLowerCase().includes(q);
  }

  function pintarLista() {
    const caja = $('#lista-corredores');
    const q = filtro.trim().toLowerCase();
    const todos = Array.from(est.corredores.values()).sort((a, b) => a.dorsal - b.dorsal);
    const visibles = todos.filter(c => coincide(c, q));

    const r = Estado.resumen();
    $('#chip-inscritos').textContent = String(todos.length);
    $('#nota-inscritos').textContent =
      r.sinChip + ' sin manilla · ' + (todos.length - r.sinChip) + ' con manilla · tanda ' +
      est.tandaActiva.nombre;

    caja.innerHTML = '';
    if (!todos.length) {
      caja.append(Util.el('div', { clase: 'item-vacio', texto: 'Todavía no hay corredores en esta tanda.' }));
      return;
    }
    if (!visibles.length) {
      caja.append(Util.el('div', { clase: 'item-vacio', texto: 'Ningún corredor coincide con el filtro.' }));
      return;
    }

    const oleadas = Estado.oleadas();
    const tope = 100;
    for (const c of visibles.slice(0, tope)) {
      const vueltas = Estado.vueltasDe(c.dorsal);
      const ol = oleadas.find(o => o.id === c.oleada);
      const meta = [c.categoria || 'sin categoría'];
      if (oleadas.length > 1) meta.push(ol ? ol.nombre : 'sin oleada');
      meta.push(vueltas + ' vuelta' + (vueltas === 1 ? '' : 's'));

      caja.append(Util.el('div', { clase: 'item' }, [
        Util.el('span', { clase: 'item-dorsal', texto: String(c.dorsal) }),
        Util.el('div', { clase: 'item-cuerpo' }, [
          Util.el('strong', { texto: c.nombre || '(sin nombre)' }),
          Util.el('span', { clase: 'item-meta', texto: meta.join(' · ') })
        ]),
        Util.el('span', {
          clase: c.uid ? 'tilde-chip' : 'sin-chip',
          title: c.uid ? 'Manilla ' + c.uid : 'Sin manilla vinculada',
          texto: c.uid ? '🔗' : '○'
        }),
        Util.el('div', { clase: 'item-acciones' }, [
          Util.el('button', { type: 'button', texto: '✏️', 'aria-label': 'Editar', onclick: () => editar(c.dorsal) }),
          Util.el('button', { type: 'button', texto: '🗑️', 'aria-label': 'Eliminar', onclick: () => eliminar(c.dorsal) })
        ])
      ]));
    }
    if (visibles.length > tope) {
      caja.append(Util.el('div', {
        clase: 'item-vacio',
        texto: 'Mostrando ' + tope + ' de ' + visibles.length + '. Afina la búsqueda para ver el resto.'
      }));
    }
  }

  /* ================= editar y eliminar ================= */

  async function editar(dorsal) {
    const c = est.corredores.get(dorsal);
    if (!c) return;

    const inDorsal = Util.el('input', { type: 'number', value: String(c.dorsal), min: '1', step: '1' });
    const inNombre = Util.el('input', { type: 'text', value: c.nombre || '', maxlength: '80' });
    const inCategoria = Util.el('input', { type: 'text', value: c.categoria || '', maxlength: '40' });
    const selOleada = Util.el('select', {});
    llenarSelectOleadas(selOleada, c.oleada);

    const cuerpo = Util.el('div', {}, [
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Dorsal' }), inDorsal]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Nombre' }), inNombre]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Categoría' }), inCategoria]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Oleada' }), selOleada]),
      Util.el('p', { clase: 'nota', texto: c.uid ? 'Manilla vinculada: ' + c.uid : 'Sin manilla vinculada.' })
    ]);

    const botones = [
      { texto: 'Guardar cambios', clase: 'btn-primario', valor: 'guardar' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ];
    if (c.uid) botones.splice(1, 0, { texto: 'Desvincular manilla', clase: 'btn-peligro-suave', valor: 'desvincular' });

    const r = await Util.modal('Editar dorsal ' + c.dorsal, cuerpo, botones);
    if (!r) return;

    if (r === 'desvincular') {
      await Estado.guardarCorredor(Object.assign({}, c, { uid: null }));
      Util.aviso('Manilla desvinculada del dorsal ' + c.dorsal, 'ok');
      App.datosCambiaron();
      return;
    }

    const nuevoDorsal = Number(inDorsal.value);
    const nombre = inNombre.value.trim();
    if (!nombre) { Util.aviso('El nombre no puede quedar vacío', 'error'); return; }
    if (!Number.isFinite(nuevoDorsal) || nuevoDorsal <= 0) { Util.aviso('Dorsal inválido', 'error'); return; }

    if (nuevoDorsal !== c.dorsal) {
      if (est.corredores.has(nuevoDorsal)) {
        Util.aviso('El dorsal ' + nuevoDorsal + ' ya está ocupado en esta tanda', 'error');
        return;
      }
      if (Estado.vueltasDe(c.dorsal) > 0) {
        Util.aviso('No se puede cambiar el dorsal: ya tiene vueltas registradas', 'error');
        return;
      }
      await Estado.borrarCorredor(c.dorsal);
    }

    await Estado.guardarCorredor({
      dorsal: nuevoDorsal, nombre,
      categoria: inCategoria.value.trim(),
      uid: c.uid || null,
      oleada: Number(selOleada.value) || 1
    });
    Util.aviso('Corredor actualizado', 'ok');
    App.datosCambiaron();
  }

  async function eliminar(dorsal) {
    const c = est.corredores.get(dorsal);
    if (!c) return;
    const vueltas = Estado.vueltasDe(dorsal);
    const ok = await Util.confirmar(
      'Eliminar corredor',
      'Se eliminará el dorsal ' + dorsal + ' (' + (c.nombre || 'sin nombre') + ') de ' +
      est.tandaActiva.nombre + '.' +
      (vueltas ? '\nSus ' + vueltas + ' vuelta(s) quedarán registradas pero sin nombre.' : '') +
      '\nEsta acción no se puede deshacer.',
      'Sí, eliminar');
    if (!ok) return;
    await Estado.borrarCorredor(dorsal);
    Util.aviso('Corredor eliminado', 'ok');
    App.datosCambiaron();
  }

  /* ================= carga masiva ================= */

  function resolverOleada(texto) {
    const lista = Estado.oleadas();
    if (!texto) return lista[0] ? lista[0].id : 1;
    const n = Number(texto);
    if (Number.isFinite(n) && lista.some(o => o.id === n)) return n;
    const porNombre = lista.find(o => o.nombre.toLowerCase() === texto.toLowerCase());
    return porNombre ? porNombre.id : (lista[0] ? lista[0].id : 1);
  }

  function analizarMasiva(texto) {
    const validos = [];
    const errores = [];
    const vistos = new Set();

    texto.split(/\r?\n/).forEach((linea, i) => {
      const n = i + 1;
      const s = linea.trim();
      if (!s || s.startsWith('#')) return;

      const partes = s.split(/[,;\t]/).map(p => p.trim());
      if (partes.length < 2) {
        errores.push('Línea ' + n + ': faltan campos (dorsal,nombre,categoria,oleada)');
        return;
      }
      const dorsal = Number(partes[0]);
      if (!Number.isFinite(dorsal) || dorsal <= 0 || Math.floor(dorsal) !== dorsal) {
        errores.push('Línea ' + n + ': «' + partes[0] + '» no es un dorsal válido');
        return;
      }
      if (!partes[1]) { errores.push('Línea ' + n + ': el nombre está vacío'); return; }
      if (vistos.has(dorsal)) {
        errores.push('Línea ' + n + ': el dorsal ' + dorsal + ' se repite en el texto');
        return;
      }
      if (Estado.fueraDeRango(dorsal)) {
        errores.push('Línea ' + n + ': el dorsal ' + dorsal + ' está fuera del rango de este dispositivo (' + textoRango() + ')');
      }
      vistos.add(dorsal);
      validos.push({
        dorsal, nombre: partes[1],
        categoria: (partes[2] || '').trim(),
        oleada: resolverOleada((partes[3] || '').trim())
      });
    });

    return {
      validos, errores,
      nuevos: validos.filter(c => !est.corredores.has(c.dorsal)),
      actualiza: validos.filter(c => est.corredores.has(c.dorsal))
    };
  }

  function vistaPrevia() {
    const texto = $('#in-masiva').value;
    if (!texto.trim()) { Util.aviso('Pega primero el listado', 'error'); return; }

    planMasivo = analizarMasiva(texto);
    const caja = $('#previa-masiva');
    caja.innerHTML = '';
    caja.hidden = false;

    caja.append(Util.el('h3', { texto: 'Resumen · ' + est.tandaActiva.nombre }));
    caja.append(Util.el('ul', {}, [
      Util.el('li', { clase: 'bueno', texto: planMasivo.nuevos.length + ' corredores nuevos' }),
      Util.el('li', { texto: planMasivo.actualiza.length + ' dorsales que ya existen y se actualizarán (conservan manilla y vueltas)' }),
      Util.el('li', { clase: planMasivo.errores.length ? 'malo' : '', texto: planMasivo.errores.length + ' avisos' })
    ]));

    if (planMasivo.errores.length) {
      caja.append(Util.el('h3', { clase: 'malo', texto: 'Avisos' }));
      const ue = Util.el('ul', {});
      for (const e of planMasivo.errores.slice(0, 40)) ue.append(Util.el('li', { clase: 'malo', texto: e }));
      if (planMasivo.errores.length > 40) ue.append(Util.el('li', { texto: '… y ' + (planMasivo.errores.length - 40) + ' más' }));
      caja.append(ue);
    }

    if (planMasivo.validos.length) {
      const oleadas = Estado.oleadas();
      caja.append(Util.el('h3', { texto: 'Primeras filas' }));
      const t = Util.el('table');
      t.append(Util.el('tr', {}, [
        Util.el('th', { texto: 'Dorsal' }), Util.el('th', { texto: 'Nombre' }),
        Util.el('th', { texto: 'Categoría' }), Util.el('th', { texto: 'Oleada' }),
        Util.el('th', { texto: 'Acción' })
      ]));
      for (const c of planMasivo.validos.slice(0, 15)) {
        const ol = oleadas.find(o => o.id === c.oleada);
        t.append(Util.el('tr', {}, [
          Util.el('td', { texto: String(c.dorsal) }),
          Util.el('td', { texto: c.nombre }),
          Util.el('td', { texto: c.categoria || '—' }),
          Util.el('td', { texto: ol ? ol.nombre : '—' }),
          Util.el('td', { texto: est.corredores.has(c.dorsal) ? 'Actualiza' : 'Nuevo' })
        ]));
      }
      caja.append(t);
      if (planMasivo.validos.length > 15) {
        caja.append(Util.el('p', { clase: 'nota', texto: '… y ' + (planMasivo.validos.length - 15) + ' filas más.' }));
      }
    }

    $('#btn-confirmar-masiva').disabled = planMasivo.validos.length === 0;
  }

  async function confirmarMasiva() {
    if (!planMasivo || !planMasivo.validos.length) return;
    const ok = await Util.confirmar(
      'Confirmar carga masiva',
      'En ' + est.tandaActiva.nombre + ' se guardarán ' + planMasivo.nuevos.length +
      ' corredores nuevos y se actualizarán ' + planMasivo.actualiza.length + '.',
      'Sí, cargar', false);
    if (!ok) return;

    const idTanda = est.tandaActiva.id;
    const finales = planMasivo.validos.map(c => {
      const prev = est.corredores.get(c.dorsal);
      return {
        id: Estado.claveCorredor(idTanda, c.dorsal),
        tanda: idTanda,
        dorsal: c.dorsal,
        nombre: c.nombre,
        categoria: c.categoria,
        uid: prev ? (prev.uid || null) : null,
        oleada: c.oleada
      };
    });
    await DB.ponerVarios('corredores', finales);
    for (const c of finales) {
      est.todos.set(c.id, c);
      est.corredores.set(c.dorsal, c);
      if (c.uid) est.porUid.set(c.uid, c.dorsal);
    }

    Util.aviso(finales.length + ' corredores cargados', 'ok');
    $('#in-masiva').value = '';
    $('#previa-masiva').hidden = true;
    $('#btn-confirmar-masiva').disabled = true;
    planMasivo = null;
    App.datosCambiaron();
  }

  /* ================= utilidades ================= */

  function llenarSelectOleadas(sel, seleccionada) {
    const lista = Estado.oleadas();
    sel.innerHTML = '';
    for (const o of lista) {
      sel.append(Util.el('option', { value: String(o.id), texto: o.nombre }));
    }
    sel.value = String(seleccionada || (lista[0] ? lista[0].id : 1));
  }

  /* ================= ciclo de vida ================= */

  function iniciar() {
    $('#btn-expres').addEventListener('click', alternarExpres);
    $('#btn-expres-guardar').addEventListener('click', guardarExpres);
    $('#btn-expres-cancelar').addEventListener('click', () => {
      cerrarFormularioExpres();
      $('#expres-estado').textContent = expresActivo ? 'Descartada. Acerca la siguiente manilla.' : '';
    });

    $('#form-corredor').addEventListener('submit', guardarDesdeFormulario);
    $('#btn-vincular').addEventListener('click', vincular);
    $('#btn-previa-masiva').addEventListener('click', vistaPrevia);
    $('#btn-confirmar-masiva').addEventListener('click', confirmarMasiva);
    $('#buscar-corredor').addEventListener('input', e => { filtro = e.target.value; pintarLista(); });
    $('#btn-filtro-sinchip').addEventListener('click', () => { soloSinChip = true; pintarLista(); });
    $('#btn-filtro-todos').addEventListener('click', () => { soloSinChip = false; pintarLista(); });

    if (!NFC.disponible()) $('#btn-expres').disabled = true;
    pintarBotonExpres();
    refrescar();
  }

  function refrescar() {
    if (!$('#in-dorsal').value) $('#in-dorsal').value = String(Estado.siguienteDorsal());
    const dl = $('#lista-categorias');
    dl.innerHTML = '';
    for (const c of Estado.categorias()) dl.append(Util.el('option', { value: c }));
    llenarSelectOleadas($('#in-oleada'), Number($('#in-oleada').value));
    $('#nota-rango').textContent = 'Rango de dorsales de ' + est.config.idDispositivo +
      ': ' + textoRango() + '. Se configura en Ajustes.';
    pintarLista();
  }

  /**
   * Al cambiar de tanda hay que soltar el formulario exprés a medias y
   * resincronizar el botón: la lectura puede haberse detenido desde otra
   * pantalla (la carrera, la vinculación o el propio cambio de tanda).
   */
  function alCambiarTanda() {
    cerrarFormularioExpres();
    sincronizarExpres();
    $('#in-dorsal').value = String(Estado.siguienteDorsal());
    refrescar();
  }

  function sincronizarExpres() {
    const real = NFC.estaActivo();
    if (expresActivo !== real) {
      expresActivo = real;
      pintarBotonExpres();
      if (!real) $('#expres-estado').textContent = 'Lectura detenida.';
    }
  }

  return { iniciar, refrescar, alCambiarTanda, sincronizarExpres };
})();
