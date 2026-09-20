/* ============================================================
   ajustes.js — configuración, reloj, padrón, unión de
   dispositivos, diagnóstico y zona de riesgo.
   ============================================================ */
'use strict';

const Ajustes = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let archivosUnion = null;
  let mapeoUnion = null;
  let planUnion = null;

  let analisisPadron = null;
  let mapeoPadron = null;

  /* ---------------- configuración ---------------- */

  function cargarFormulario() {
    const t = est.tandaActiva;
    $('#cfg-tanda-nombre').value = t ? t.nombre : '';
    $('#cfg-vueltas').value = t ? t.vueltas : 5;
    $('#cfg-ventana').value = t ? t.ventanaMinSeg : 60;
    $('#cfg-nombre').value = est.config.nombreCarrera || '';
    $('#cfg-digitos').value = est.config.digitosDorsal;
    $('#cfg-puesto').value = est.config.nombrePuesto || '';
    $('#cfg-dispositivo').value = est.config.idDispositivo || '';
    $('#cfg-rango-desde').value = est.config.rangoDesde || '';
    $('#cfg-rango-hasta').value = est.config.rangoHasta || '';
  }

  async function guardarConfig(ev) {
    ev.preventDefault();
    const vueltas = Math.max(1, Math.min(99, Number($('#cfg-vueltas').value) || 1));
    const ventana = Math.max(1, Math.min(3600, Number($('#cfg-ventana').value) || 1));
    const digitosDorsal = Math.max(1, Math.min(6, Number($('#cfg-digitos').value) || 3));
    const idDispositivo = $('#cfg-dispositivo').value.trim() || Util.idAleatorio('CEL');
    const rangoDesde = Number($('#cfg-rango-desde').value) || null;
    const rangoHasta = Number($('#cfg-rango-hasta').value) || null;

    if (rangoDesde && rangoHasta && rangoHasta < rangoDesde) {
      Util.aviso('El rango de dorsales está al revés', 'error');
      return;
    }

    const antes = est.tandaActiva;
    if (vueltas !== antes.vueltas) {
      const ok = await Util.confirmar(
        'Cambiar el número de vueltas',
        est.tandaActiva.nombre + ' pasará de ' + antes.vueltas + ' a ' + vueltas + ' vueltas.\n' +
        'Los ' + est.totalEventos + ' eventos registrados se conservan: solo se recalcula ' +
        'quién ha terminado.',
        'Sí, cambiar', false);
      if (!ok) { cargarFormulario(); return; }
    }

    await Estado.guardarTanda({
      nombre: $('#cfg-tanda-nombre').value.trim() || antes.nombre,
      vueltas, ventanaMinSeg: ventana
    });
    await Estado.guardarConfig({
      nombreCarrera: $('#cfg-nombre').value.trim() || 'Carrera escolar',
      digitosDorsal,
      nombrePuesto: $('#cfg-puesto').value.trim() || 'Meta',
      idDispositivo,
      rangoDesde, rangoHasta,
      vueltasPorDefecto: vueltas,
      ventanaPorDefecto: ventana
    });
    cargarFormulario();
    Util.aviso('Configuración guardada', 'ok');
    App.datosCambiaron();
    Tandas.refrescar();
  }

  /* ---------------- reloj ---------------- */

  function pintarReloj() {
    const ahora = Date.now();
    const g = $('#reloj-gigante');
    if (g) g.textContent = Util.hora(ahora);
    const f = $('#reloj-fecha');
    if (f) f.textContent = Util.fecha(ahora);
  }

  /* ---------------- padrón ---------------- */

  function accionPadron(accion) {
    const alcance = $('#sel-alcance-padron').value;
    if (!est.todos.size) { Util.aviso('No hay corredores que exportar', 'error'); return; }
    const p = Exportar.paquetePadron(alcance);
    if (accion === 'descargar') Util.descargar(p.nombre, p.contenido, p.mime);
    else if (accion === 'compartir') Util.compartir(p.nombre, p.contenido, p.mime);
    else Util.copiar(p.contenido);
  }

  async function importarPadron(ev) {
    const archivo = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;

    let texto;
    try { texto = await Util.leerArchivo(archivo); }
    catch (e) { Util.alerta('Error', e.message); return; }

    const an = Exportar.analizarPadron(texto, archivo.name);
    if (!an.ok) { Util.alerta('Padrón no válido', an.mensaje); return; }

    analisisPadron = an;
    mapeoPadron = an.mapeo;
    pintarResumenPadron(archivo.name);
  }

  function pintarResumenPadron(nombreArchivo) {
    const caja = $('#resumen-padron');
    caja.innerHTML = '';
    caja.hidden = false;
    const a = analisisPadron.archivo;

    caja.append(Util.el('h3', { texto: 'Archivo: ' + nombreArchivo }));
    const porTanda = new Map();
    for (const c of a.corredores) porTanda.set(c.tanda, (porTanda.get(c.tanda) || 0) + 1);
    const ul = Util.el('ul', {}, [
      Util.el('li', { texto: a.corredores.length + ' corredores' }),
      Util.el('li', { texto: a.corredores.filter(c => c.uid).length + ' con manilla vinculada' }),
      Util.el('li', { texto: 'Esquema v' + a.esquema })
    ]);
    caja.append(ul);

    caja.append(Util.el('h3', { texto: '¿A qué tanda va cada grupo?' }));
    caja.append(cajaMapeo(mapeoPadron, porTanda));

    caja.append(Util.el('button', {
      clase: 'btn btn-primario', type: 'button', texto: '🔗 Fusionar con lo que ya tengo',
      onclick: () => aplicarPadron('fusionar')
    }));
    caja.append(Util.el('button', {
      clase: 'btn btn-peligro', type: 'button', texto: '♻️ Reemplazar esas tandas',
      onclick: () => aplicarPadron('reemplazar')
    }));
    caja.append(Util.el('button', {
      clase: 'btn btn-secundario', type: 'button', texto: 'Cancelar',
      onclick: () => { caja.hidden = true; caja.innerHTML = ''; analisisPadron = null; }
    }));
  }

  /** Tabla de mapeo tanda del archivo -> tanda local. */
  function cajaMapeo(mapeo, conteos) {
    const caja = Util.el('div', {});
    for (const m of mapeo) {
      const sel = Util.el('select', {});
      sel.append(Util.el('option', { value: '__nueva__', texto: '➕ Crear como tanda nueva' }));
      for (const t of Array.from(est.tandas.values()).sort((a, b) => b.creadaEn - a.creadaEn)) {
        sel.append(Util.el('option', { value: t.id, texto: 'Unir a: ' + t.nombre }));
      }
      sel.value = m.destino;
      sel.addEventListener('change', e => { m.destino = e.target.value; });

      const cuantos = conteos ? (conteos.get(m.origen) || 0) : null;
      caja.append(Util.el('div', { clase: 'mapeo-fila' }, [
        Util.el('span', { clase: 'mapeo-nombre', texto: m.nombre }),
        Util.el('span', { clase: 'item-codigo', texto: m.origen + (cuantos != null ? ' · ' + cuantos + ' corredores' : '') }),
        sel,
        Util.el('span', { clase: 'item-meta', texto: m.motivo })
      ]));
    }
    return caja;
  }

  async function aplicarPadron(modo) {
    if (!analisisPadron) return;
    const texto = modo === 'reemplazar'
      ? 'Se eliminarán los corredores que este dispositivo tenga en las tandas de destino y se dejarán solo los del archivo.\nLas vueltas ya registradas no se borran.'
      : 'Se conservará lo que ya tienes y se completará lo que falte (nombres, categorías y manillas vacías).';
    const ok = await Util.confirmar('Importar padrón', texto,
      modo === 'reemplazar' ? 'Sí, reemplazar' : 'Sí, fusionar', modo === 'reemplazar');
    if (!ok) return;

    const r = await Exportar.aplicarPadron(analisisPadron, mapeoPadron, modo);
    Util.aviso('Padrón importado: ' + r.total + ' corredores', 'ok');
    $('#resumen-padron').hidden = true;
    $('#resumen-padron').innerHTML = '';
    analisisPadron = null;
    App.tandaCambio();
  }

  /* ---------------- unir dispositivos ---------------- */

  async function cargarArchivosUnion(ev) {
    const archivos = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!archivos.length) return;

    const analizados = [];
    for (const a of archivos) {
      try {
        analizados.push(Exportar.analizarArchivo(await Util.leerArchivo(a), a.name));
      } catch (e) {
        analizados.push({ ok: false, archivo: a.name, mensaje: e.message });
      }
    }

    const buenos = analizados.filter(a => a.ok);
    if (!buenos.length) {
      Util.alerta('Sin datos utilizables', analizados.map(a => a.archivo + ': ' + a.mensaje).join('\n'));
      return;
    }

    archivosUnion = { todos: analizados, buenos };
    mapeoUnion = Exportar.proponerMapeo(buenos);
    planUnion = null;
    pintarPasoMapeo();
  }

  function pintarPasoMapeo() {
    const caja = $('#resumen-union');
    caja.innerHTML = '';
    caja.hidden = false;

    caja.append(Util.el('h3', { texto: 'Archivos leídos' }));
    const ua = Util.el('ul', {});
    for (const a of archivosUnion.todos) {
      ua.append(Util.el('li', {
        clase: a.ok ? '' : 'malo',
        texto: a.ok
          ? a.archivo + ' → ' + a.dispositivo + (a.puesto ? ' (' + a.puesto + ')' : '') +
            ' · ' + a.eventos.length + ' eventos · ' + a.corredores.length + ' corredores'
          : a.archivo + ' → ' + a.mensaje
      }));
    }
    caja.append(ua);

    caja.append(Util.el('h3', { texto: '¿A qué tanda corresponde cada grupo?' }));
    caja.append(Util.el('p', {
      clase: 'nota',
      texto: 'Si todos los celulares importaron el mismo padrón, esto ya viene resuelto. ' +
             'Solo hay que tocarlo si alguien creó la tanda por su cuenta.'
    }));
    caja.append(cajaMapeo(mapeoUnion, null));

    caja.append(Util.el('button', {
      clase: 'btn btn-primario', type: 'button', texto: '🔎 Calcular la unión',
      onclick: calcularUnion
    }));
    caja.append(Util.el('button', {
      clase: 'btn btn-secundario', type: 'button', texto: 'Cancelar',
      onclick: cancelarUnion
    }));
  }

  function cancelarUnion() {
    archivosUnion = null; mapeoUnion = null; planUnion = null;
    $('#resumen-union').hidden = true;
    $('#resumen-union').innerHTML = '';
  }

  function calcularUnion() {
    planUnion = Exportar.prepararUnion(archivosUnion.buenos, mapeoUnion);
    pintarResumenUnion();
  }

  function pintarResumenUnion() {
    const caja = $('#resumen-union');
    caja.innerHTML = '';
    caja.hidden = false;
    const p = planUnion;

    caja.append(Util.el('h3', { texto: 'Resultado de la deduplicación' }));
    caja.append(Util.el('ul', {}, [
      Util.el('li', { texto: p.totalLeidos + ' marcas leídas en total (incluye las de este dispositivo)' }),
      Util.el('li', { clase: 'bueno', texto: p.aceptados.length + ' vueltas válidas' }),
      Util.el('li', { clase: p.descartes.length ? 'malo' : '', texto: p.descartes.length + ' marcas descartadas por repetición dentro de la ventana de su tanda' }),
      Util.el('li', { texto: p.nuevos.length + ' corredores nuevos · ' + p.completados.length + ' completados con datos de otro celular' })
    ]));

    /* ---- conflictos que decide una persona ---- */
    if (p.conflictos.length) {
      caja.append(Util.el('h3', { clase: 'malo', texto: '⚠️ Conflictos de inscripción (' + p.conflictos.length + ')' }));
      caja.append(Util.el('p', {
        clase: 'nota',
        texto: 'La unión conserva lo que ya hay en este dispositivo. Revisa estos casos a mano ' +
               'después de unir; evita que se repitan repartiendo rangos de dorsales por organizador.'
      }));
      const t = Util.el('table');
      t.append(Util.el('tr', {}, [
        Util.el('th', { texto: 'Tanda' }), Util.el('th', { clase: 'num', texto: 'Dorsal' }),
        Util.el('th', { texto: 'Se conserva' }), Util.el('th', { texto: 'Se ignora' })
      ]));
      for (const c of p.conflictos.slice(0, 40)) {
        if (c.tipo === 'nombre') {
          t.append(Util.el('tr', {}, [
            Util.el('td', { texto: nombreTanda(c.tanda) }),
            Util.el('td', { clase: 'num', texto: String(c.dorsal) }),
            Util.el('td', { texto: c.actual }),
            Util.el('td', { texto: c.entrante + ' (' + c.archivo + ')' })
          ]));
        } else {
          t.append(Util.el('tr', {}, [
            Util.el('td', { texto: nombreTanda(c.tanda) }),
            Util.el('td', { clase: 'num', texto: String(c.dorsalConservado) }),
            Util.el('td', { texto: 'manilla ' + c.uid }),
            Util.el('td', { texto: 'se libera del dorsal ' + c.dorsalLiberado })
          ]));
        }
      }
      caja.append(t);
      if (p.conflictos.length > 40) {
        caja.append(Util.el('p', { clase: 'nota', texto: '… y ' + (p.conflictos.length - 40) + ' más.' }));
      }
    }

    if (p.huerfanos.length) {
      caja.append(Util.el('p', {
        clase: 'malo',
        texto: 'Hay marcas de dorsales sin inscribir: ' + p.huerfanos.slice(0, 15).join(', ') +
               (p.huerfanos.length > 15 ? '…' : '') + '. Se conservan, pero saldrán sin nombre.'
      }));
    }

    /* ---- por tanda ---- */
    caja.append(Util.el('h3', { texto: 'Por tanda' }));
    const tt = Util.el('table');
    tt.append(Util.el('tr', {}, [
      Util.el('th', { texto: 'Tanda' }),
      Util.el('th', { clase: 'num', texto: 'Corredores' }),
      Util.el('th', { clase: 'num', texto: 'Vueltas' }),
      Util.el('th', { clase: 'num', texto: 'Descartes' })
    ]));
    for (const r of p.porTanda) {
      tt.append(Util.el('tr', {}, [
        Util.el('td', { texto: r.nombre + (p.tandasNuevas.includes(r.id) ? ' (nueva)' : '') }),
        Util.el('td', { clase: 'num', texto: String(r.corredores) }),
        Util.el('td', { clase: 'num', texto: String(r.eventos) }),
        Util.el('td', { clase: 'num', texto: String(r.descartes) })
      ]));
    }
    caja.append(tt);

    /* ---- por dispositivo ---- */
    caja.append(Util.el('h3', { texto: 'Por dispositivo' }));
    const td = Util.el('table');
    td.append(Util.el('tr', {}, [
      Util.el('th', { texto: 'Dispositivo' }),
      Util.el('th', { clase: 'num', texto: 'Leídas' }),
      Util.el('th', { clase: 'num', texto: 'Válidas' }),
      Util.el('th', { clase: 'num', texto: 'Descartadas' })
    ]));
    for (const r of p.porDispositivo) {
      td.append(Util.el('tr', {}, [
        Util.el('td', { texto: r.dispositivo }),
        Util.el('td', { clase: 'num', texto: String(r.leidos) }),
        Util.el('td', { clase: 'num', texto: String(r.aceptados) }),
        Util.el('td', { clase: 'num', texto: String(r.descartados) })
      ]));
    }
    caja.append(td);

    /* ---- reporte de descartes ---- */
    if (p.descartes.length) {
      caja.append(Util.el('h3', { texto: 'Reporte de descartes' }));
      const t = Util.el('table');
      t.append(Util.el('tr', {}, [
        Util.el('th', { texto: 'Tanda' }),
        Util.el('th', { clase: 'num', texto: 'Dorsal' }),
        Util.el('th', { texto: 'Se conserva' }),
        Util.el('th', { texto: 'Se descarta' }),
        Util.el('th', { clase: 'num', texto: 'Δ s' })
      ]));
      for (const d of p.descartes.slice(0, 80)) {
        t.append(Util.el('tr', {}, [
          Util.el('td', { texto: nombreTanda(d.tanda) }),
          Util.el('td', { clase: 'num', texto: String(d.dorsal) }),
          Util.el('td', { texto: Util.hora(d.horaConservada) + ' · ' + d.dispositivoConservado }),
          Util.el('td', { texto: Util.hora(d.horaDescartada) + ' · ' + d.dispositivoDescartado }),
          Util.el('td', { clase: 'num', texto: String(d.diferenciaSeg) })
        ]));
      }
      caja.append(t);
      if (p.descartes.length > 80) {
        caja.append(Util.el('p', { clase: 'nota', texto: '… y ' + (p.descartes.length - 80) + ' descartes más. Descarga el reporte para verlos todos.' }));
      }
      caja.append(Util.el('button', {
        clase: 'btn btn-secundario', type: 'button', texto: '⬇️ Descargar reporte de descartes (CSV)',
        onclick: () => Util.descargar(
          'descartes_' + Util.selloArchivo(Date.now()) + '.csv',
          Exportar.csvDescartes(p.descartes), 'text/csv')
      }));
    }

    caja.append(Util.el('button', {
      clase: 'btn btn-primario', type: 'button', texto: '✅ Aplicar unión y recalcular la tabla',
      onclick: aplicarUnion
    }));
    caja.append(Util.el('button', {
      clase: 'btn btn-secundario', type: 'button', texto: '← Volver al mapeo de tandas',
      onclick: pintarPasoMapeo
    }));
    caja.append(Util.el('button', {
      clase: 'btn btn-secundario', type: 'button', texto: 'Cancelar',
      onclick: cancelarUnion
    }));
  }

  function nombreTanda(id) {
    const t = est.tandas.get(id);
    return t ? t.nombre : id;
  }

  async function aplicarUnion() {
    if (!planUnion) return;
    const ok = await Util.confirmar(
      'Aplicar la unión',
      'Los datos de este dispositivo se reemplazarán por el resultado: ' +
      planUnion.aceptados.length + ' vueltas y ' + planUnion.corredores.length + ' corredores.\n' +
      'Se guarda un respaldo: podrás deshacerlo.',
      'Sí, aplicar', false);
    if (!ok) return;

    const n = await Exportar.aplicarUnion(planUnion);
    cancelarUnion();
    $('#btn-deshacer-union').hidden = false;
    Util.aviso('Unión aplicada: ' + n + ' vueltas válidas', 'ok');
    App.tandaCambio();
    App.irA('posiciones');
  }

  async function deshacerUnion() {
    const ok = await Util.confirmar(
      'Deshacer la unión',
      'Se restaurarán las tandas, los corredores y los eventos que tenía este dispositivo antes de la última unión.',
      'Sí, deshacer');
    if (!ok) return;
    if (await Exportar.deshacerUnion()) {
      $('#btn-deshacer-union').hidden = true;
      Util.aviso('Unión deshecha', 'ok');
      App.tandaCambio();
    } else {
      Util.aviso('No hay ninguna unión que deshacer', 'error');
    }
  }

  /* ---------------- diagnóstico ---------------- */

  function fila(estado, titulo, detalle) {
    const icono = estado === 'ok' ? '✅' : estado === 'error' ? '⛔' : '⚠️';
    return Util.el('div', { clase: 'item ' + (estado === 'ok' ? 'ok' : estado === 'error' ? 'error' : 'final') }, [
      Util.el('span', { clase: 'item-dorsal', texto: icono }),
      Util.el('div', { clase: 'item-cuerpo' }, [
        Util.el('strong', { texto: titulo }),
        Util.el('span', { clase: 'item-meta', texto: detalle })
      ])
    ]);
  }

  async function diagnosticar() {
    const caja = $('#diagnostico');
    caja.innerHTML = '';

    caja.append(window.isSecureContext
      ? fila('ok', 'Contexto seguro', 'La página se sirve por https o localhost.')
      : fila('error', 'Contexto NO seguro', 'Web NFC exige https. Abre la app desde su dirección https.'));

    caja.append(NFC.disponible()
      ? fila('ok', 'Web NFC disponible', 'El navegador expone NDEFReader.')
      : fila('error', 'Web NFC no disponible', 'Usa Chrome para Android 124+ en un equipo con NFC. La app funciona en modo teclado.'));

    const permiso = await NFC.estadoPermiso();
    caja.append(
      permiso === 'granted' ? fila('ok', 'Permiso de NFC', 'Concedido.') :
      permiso === 'denied' ? fila('error', 'Permiso de NFC', 'Denegado. Candado junto a la dirección → Permisos → NFC.') :
      permiso === 'prompt' ? fila('aviso', 'Permiso de NFC', 'Se pedirá al activar la lectura.') :
      fila('aviso', 'Permiso de NFC', 'El navegador no informa el estado; se sabrá al activar la lectura.'));

    caja.append(Util.esWebView()
      ? fila('error', 'Navegador incrustado detectado', 'Estás dentro de otra app (Gmail, WhatsApp…). Abre la página en Chrome: menú ⋮ → «Abrir en Chrome».')
      : fila('ok', 'Navegador independiente', 'No se detectó un WebView incrustado.'));

    try {
      const persistido = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      let detalle = persistido
        ? 'Almacenamiento persistente concedido: el sistema no borrará los datos.'
        : 'Almacenamiento no persistente: el sistema podría liberar espacio. Instala la app para reducir el riesgo.';
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (e && e.usage != null) {
          detalle += ' Uso: ' + (e.usage / 1024).toFixed(0) + ' KB' +
                     (e.quota ? ' de ' + (e.quota / 1048576).toFixed(0) + ' MB.' : '.');
        }
      }
      caja.append(fila(persistido ? 'ok' : 'aviso', 'Almacenamiento', detalle));
    } catch (_) {
      caja.append(fila('aviso', 'Almacenamiento', 'No se pudo consultar el estado.'));
    }

    let eventosTotales = 0;
    for (const t of est.tandas.values()) eventosTotales += Estado.resumenTanda(t.id).eventos;
    caja.append(fila('ok', 'Datos guardados',
      est.tandas.size + ' tandas · ' + est.todos.size + ' corredores · ' + eventosTotales +
      ' eventos · esquema v' + DB.ESQUEMA));

    caja.append(fila('ok', 'Tanda activa',
      est.tandaActiva.nombre + ' (' + est.tandaActiva.id + ') · ' +
      Estado.vueltas() + ' vueltas · ventana ' + est.tandaActiva.ventanaMinSeg + ' s · ' +
      Estado.oleadas().length + ' oleada(s)'));

    const r = Estado.resumen();
    if (r.sinChip) {
      caja.append(fila('aviso', 'Corredores sin manilla',
        r.sinChip + ' de ' + r.inscritos + ' no tienen manilla vinculada en esta tanda. ' +
        'Solo podrán registrarse con el teclado.'));
    } else if (r.inscritos) {
      caja.append(fila('ok', 'Manillas', 'Los ' + r.inscritos + ' inscritos tienen manilla vinculada.'));
    }

    const sinSalida = Estado.oleadas().filter(o => !o.horaSalida);
    if (sinSalida.length) {
      caja.append(fila('aviso', 'Salidas sin marcar',
        sinSalida.map(o => o.nombre).join(', ') + '. Sin hora de salida los tiempos netos no son comparables.'));
    } else {
      caja.append(fila('ok', 'Salidas', 'Todas las oleadas tienen hora de salida.'));
    }

    const sw = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    caja.append(sw
      ? fila('ok', 'Modo sin conexión', 'Service worker activo: la app abre sin red.')
      : fila('aviso', 'Modo sin conexión', 'El service worker aún no está registrado. Recarga con red una vez.'));

    caja.append('wakeLock' in navigator
      ? fila('ok', 'Pantalla siempre encendida', 'Wake Lock disponible.')
      : fila('aviso', 'Pantalla siempre encendida', 'Sin Wake Lock: sube el tiempo de apagado en los ajustes del celular.'));

    caja.append(navigator.vibrate
      ? fila('ok', 'Vibración', 'Disponible.')
      : fila('aviso', 'Vibración', 'No disponible: guíate por el sonido y el color.'));

    const instalada = window.matchMedia('(display-mode: standalone)').matches;
    caja.append(instalada
      ? fila('ok', 'App instalada', 'Se está ejecutando como aplicación.')
      : fila('aviso', 'App no instalada', 'Instálala desde el menú de Chrome → «Instalar aplicación».'));
  }

  /* ---------------- zona de riesgo ---------------- */

  async function datosDePrueba() {
    const ok = await Util.confirmar(
      'Cargar datos de prueba',
      'Se creará una tanda de ensayo con 40 corredores, 2 oleadas separadas 35 segundos y ' +
      'vueltas simuladas, para practicar antes de la carrera.\n' +
      'No toca las tandas que ya tengas.',
      'Sí, cargar', false);
    if (!ok) return;

    const nombres = ['Ana', 'Luis', 'Sofía', 'Mateo', 'Valeria', 'Samuel', 'Isabella', 'Tomás',
                     'Camila', 'Emilio', 'Lucía', 'Daniel', 'Salomé', 'Andrés', 'Mariana', 'Felipe',
                     'Antonia', 'Nicolás', 'Juliana', 'Martín'];
    const apellidos = ['Gómez', 'Rodríguez', 'Martínez', 'López', 'Ramírez', 'Torres', 'Castro', 'Vargas'];
    const cats = ['Infantil', 'Juvenil', 'Mayores'];

    const total = 5;
    const ventana = 60;
    const tanda = await Estado.crearTanda({
      nombre: 'Prueba ' + Util.horaCorta(Date.now()),
      vueltas: total,
      ventanaMinSeg: ventana,
      oleadas: [
        { id: 1, nombre: 'Oleada 1', horaSalida: null },
        { id: 2, nombre: 'Oleada 2', horaSalida: null }
      ]
    });

    const ms = ventana * 1000;
    const salida1 = Date.now() - (total + 1) * ms;
    const salida2 = salida1 + 35000;   // la segunda oleada sale 35 s después
    await Estado.guardarTandaPorId(tanda.id, {
      oleadas: [
        { id: 1, nombre: 'Oleada 1', horaSalida: salida1 },
        { id: 2, nombre: 'Oleada 2', horaSalida: salida2 }
      ]
    });

    const corredores = [];
    for (let i = 0; i < 40; i++) {
      const dorsal = 101 + i;
      corredores.push({
        id: Estado.claveCorredor(tanda.id, dorsal),
        tanda: tanda.id,
        dorsal,
        nombre: nombres[i % nombres.length] + ' ' + apellidos[i % apellidos.length],
        categoria: cats[i % cats.length],
        uid: '04:' + ('0' + (i + 1).toString(16).toUpperCase()).slice(-2) + ':DE:MO',
        oleada: i < 20 ? 1 : 2
      });
    }
    await DB.ponerVarios('corredores', corredores);

    const eventos = [];
    for (const c of corredores) {
      const salida = c.oleada === 1 ? salida1 : salida2;
      const ritmo = ms * (1 + Math.random() * 0.6);
      const vueltas = Math.min(total, 1 + Math.floor(Math.random() * total));
      let t = salida;
      for (let v = 0; v < vueltas; v++) {
        t += ritmo;
        eventos.push({
          tanda: tanda.id, dorsal: c.dorsal, ts: Math.round(t),
          metodo: 'nfc', dispositivo: est.config.idDispositivo
        });
      }
    }
    await DB.ponerVarios('eventos', eventos);

    Estado.reconstruirCorredores(await DB.todo('corredores'));
    Estado.reconstruirEventos(await DB.todo('eventos'));
    await Estado.activarTanda(tanda.id);
    Util.aviso('Tanda de prueba creada con 40 corredores en 2 oleadas', 'ok');
    App.tandaCambio();
  }

  async function borrarVueltas() {
    const ok = await Util.confirmar(
      'Borrar las vueltas de ' + est.tandaActiva.nombre,
      'Se eliminarán los ' + est.totalEventos + ' eventos y las ' + est.pendientes.length +
      ' marcas pendientes de esta tanda, y se borrarán sus horas de salida.\n' +
      'Los corredores y sus manillas se conservan. Las demás tandas no se tocan.\n' +
      'Esta acción no se puede deshacer: exporta antes si quieres conservarlas.',
      'Sí, borrar las vueltas');
    if (!ok) return;
    await Estado.borrarVueltas();
    Util.aviso('Vueltas borradas', 'ok');
    App.tandaCambio();
  }

  async function borrarTodo() {
    let eventosTotales = 0;
    for (const t of est.tandas.values()) eventosTotales += Estado.resumenTanda(t.id).eventos;
    const ok = await Util.confirmar(
      'Borrar todo',
      'Se eliminarán TODOS los datos de este dispositivo: ' + est.tandas.size + ' tandas, ' +
      est.todos.size + ' corredores, sus manillas, ' + eventosTotales +
      ' eventos y el respaldo de unión.\nEsta acción no se puede deshacer.',
      'Sí, borrar todo');
    if (!ok) return;
    const confirmado = await Util.confirmar(
      '¿Seguro?',
      'Última confirmación. Si no has exportado, perderás los datos de la carrera.',
      'Borrar definitivamente');
    if (!confirmado) return;
    await Estado.borrarTodo();
    $('#btn-deshacer-union').hidden = true;
    Util.aviso('Todos los datos fueron borrados', 'ok');
    App.tandaCambio();
  }

  /* ---------------- ciclo de vida ---------------- */

  async function iniciar() {
    $('#form-config').addEventListener('submit', guardarConfig);
    $('#btn-padron-descargar').addEventListener('click', () => accionPadron('descargar'));
    $('#btn-padron-compartir').addEventListener('click', () => accionPadron('compartir'));
    $('#btn-padron-copiar').addEventListener('click', () => accionPadron('copiar'));
    $('#file-padron').addEventListener('change', importarPadron);
    $('#file-union').addEventListener('change', cargarArchivosUnion);
    $('#btn-deshacer-union').addEventListener('click', deshacerUnion);
    $('#btn-diagnostico').addEventListener('click', diagnosticar);
    $('#btn-demo').addEventListener('click', datosDePrueba);
    $('#btn-borrar-vueltas').addEventListener('click', borrarVueltas);
    $('#btn-borrar-todo').addEventListener('click', borrarTodo);

    $('#reloj-zona').textContent = 'Zona horaria de referencia: ' + Util.ZONA +
      ' (formato 24 h). Zona del sistema: ' +
      (Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida') + '.';

    cargarFormulario();
    pintarReloj();
    diagnosticar();
    if (await Exportar.hayUnionPrevia()) $('#btn-deshacer-union').hidden = false;
  }

  function refrescar() { cargarFormulario(); }

  return { iniciar, refrescar, pintarReloj, diagnosticar };
})();
