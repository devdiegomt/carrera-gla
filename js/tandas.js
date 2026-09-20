/* ============================================================
   tandas.js — selector de tanda activa, gestión de tandas y de
   sus oleadas. Aquí vive la reutilización de manillas: una tanda
   nueva puede heredar las parejas dorsal↔manilla de otra.
   ============================================================ */
'use strict';

const Tandas = (() => {

  const $ = Util.$;
  const est = Estado.est;

  function lista() {
    return Array.from(est.tandas.values()).sort((a, b) => b.creadaEn - a.creadaEn);
  }

  /* ---------------- barra superior ---------------- */

  function pintarBarra() {
    const sel = $('#sel-tanda');
    sel.innerHTML = '';
    for (const t of lista()) {
      sel.append(Util.el('option', {
        value: t.id,
        texto: t.nombre + (t.estado === 'cerrada' ? ' (cerrada)' : '')
      }));
    }
    sel.value = est.tandaActiva ? est.tandaActiva.id : '';

    const r = Estado.resumen();
    $('#barra-tanda-info').textContent =
      r.inscritos + ' insc. · ' + Estado.vueltas() + ' v.';
  }

  async function cambiarTanda(id) {
    if (!id || (est.tandaActiva && id === est.tandaActiva.id)) return;
    if (NFC.estaActivo()) {
      const ok = await Util.confirmar(
        'Cambiar de tanda con la lectura activa',
        'Se detendrá la lectura NFC para evitar que una vuelta se registre en la tanda equivocada.',
        'Cambiar igual', false);
      if (!ok) { pintarBarra(); return; }
      NFC.detener();
    }
    await Estado.activarTanda(id);
    Util.aviso('Tanda activa: ' + est.tandaActiva.nombre, 'ok');
    App.tandaCambio();
  }

  /* ---------------- lista de tandas ---------------- */

  function pintarListaTandas() {
    const caja = $('#lista-tandas');
    caja.innerHTML = '';
    for (const t of lista()) {
      const r = Estado.resumenTanda(t.id);
      const activa = est.tandaActiva && t.id === est.tandaActiva.id;

      const cuerpo = Util.el('div', { clase: 'item-cuerpo' }, [
        Util.el('strong', { texto: t.nombre }),
        Util.el('span', {
          clase: 'item-meta',
          texto: r.inscritos + ' inscritos · ' + r.conChip + ' con manilla · ' +
                 r.eventos + (r.eventos === 1 ? ' vuelta' : ' vueltas') + ' de ' +
                 t.vueltas + ' · ' + (t.oleadas || []).length +
                 ((t.oleadas || []).length === 1 ? ' oleada' : ' oleadas')
        }),
        Util.el('span', { clase: 'item-codigo', texto: t.id })
      ]);

      const acciones = Util.el('div', { clase: 'item-acciones' }, [
        Util.el('button', {
          type: 'button', texto: '✏️', 'aria-label': 'Renombrar tanda',
          onclick: () => renombrar(t)
        }),
        Util.el('button', {
          type: 'button', texto: '🗑️', 'aria-label': 'Eliminar tanda',
          onclick: () => eliminar(t)
        })
      ]);

      const fila = Util.el('div', { clase: 'item' + (activa ? ' activa-tanda' : '') }, [cuerpo]);
      if (activa) fila.prepend(Util.el('span', { clase: 'item-etiqueta', texto: 'Activa' }));
      else fila.append(Util.el('button', {
        clase: 'btn btn-secundario', type: 'button', texto: 'Usar',
        onclick: () => cambiarTanda(t.id)
      }));
      fila.append(acciones);
      caja.append(fila);
    }
  }

  /* ---------------- crear tanda ---------------- */

  async function nueva() {
    const anteriores = lista();

    const inNombre = Util.el('input', {
      type: 'text', maxlength: '40', value: 'Tanda ' + (est.tandas.size + 1)
    });
    const inVueltas = Util.el('input', {
      type: 'number', min: '1', max: '99', step: '1',
      value: String(est.config.vueltasPorDefecto || 5)
    });
    const inVentana = Util.el('input', {
      type: 'number', min: '1', max: '3600', step: '1',
      value: String(est.config.ventanaPorDefecto || 60)
    });
    const inOleadas = Util.el('input', { type: 'number', min: '1', max: '20', step: '1', value: '1' });

    const selHeredar = Util.el('select', {});
    selHeredar.append(Util.el('option', { value: '', texto: 'No heredar: inscribir desde cero' }));
    for (const t of anteriores) {
      const r = Estado.resumenTanda(t.id);
      selHeredar.append(Util.el('option', {
        value: t.id,
        texto: t.nombre + ' (' + r.conChip + ' manillas vinculadas)'
      }));
    }
    if (anteriores.length) selHeredar.value = anteriores[0].id;

    const chkNombres = Util.el('input', { type: 'checkbox' });
    const etqNombres = Util.el('label', { clase: 'campo-check' }, [
      chkNombres, document.createTextNode(' Copiar también los nombres (misma gente corriendo otra vez)')
    ]);

    const cuerpo = Util.el('div', {}, [
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Nombre de la tanda' }), inNombre]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Vueltas para terminar' }), inVueltas]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Ventana mínima entre vueltas (s)' }), inVentana]),
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Cuántas oleadas (salidas escalonadas)' }), inOleadas]),
      Util.el('hr'),
      Util.el('div', { clase: 'campo' }, [
        Util.el('label', { texto: 'Reutilizar manillas de' }), selHeredar,
        Util.el('p', {
          clase: 'nota',
          texto: 'Copia las parejas dorsal↔manilla de esa tanda. Si cada manilla va pegada ' +
                 'a su número de dorsal, con esto no hay que volver a escanear nada: solo ' +
                 'escribir los nombres nuevos.'
        })
      ]),
      etqNombres
    ]);

    const r = await Util.modal('Nueva tanda', cuerpo, [
      { texto: 'Crear tanda', clase: 'btn-primario', valor: 'crear' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    if (r !== 'crear') return;

    const nOleadas = Math.max(1, Math.min(20, Number(inOleadas.value) || 1));
    const oleadas = [];
    for (let i = 1; i <= nOleadas; i++) {
      oleadas.push({ id: i, nombre: 'Oleada ' + i, horaSalida: null });
    }

    const tanda = await Estado.crearTanda({
      nombre: inNombre.value,
      vueltas: Number(inVueltas.value),
      ventanaMinSeg: Number(inVentana.value),
      oleadas,
      heredarChipsDe: selHeredar.value || null,
      heredarNombres: chkNombres.checked
    });

    const heredados = selHeredar.value ? Estado.resumenTanda(tanda.id) : null;
    Util.aviso('Tanda «' + tanda.nombre + '» creada' +
      (heredados && heredados.inscritos ? ' con ' + heredados.conChip + ' manillas heredadas' : ''), 'ok');
    App.tandaCambio();
  }

  async function renombrar(t) {
    const inNombre = Util.el('input', { type: 'text', maxlength: '40', value: t.nombre });
    const cuerpo = Util.el('div', {}, [
      Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Nombre' }), inNombre]),
      Util.el('p', { clase: 'nota', texto: 'Código interno: ' + t.id + ' (no cambia; es lo que usan la unión y el padrón).' })
    ]);
    const r = await Util.modal('Renombrar tanda', cuerpo, [
      { texto: 'Guardar', clase: 'btn-primario', valor: 'ok' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    if (r !== 'ok') return;
    await Estado.guardarTandaPorId(t.id, { nombre: inNombre.value.trim() || t.nombre });
    Util.aviso('Tanda renombrada', 'ok');
    App.tandaCambio();
  }

  async function eliminar(t) {
    const r = Estado.resumenTanda(t.id);
    const ok = await Util.confirmar(
      'Eliminar la tanda «' + t.nombre + '»',
      'Se borrarán sus ' + r.inscritos + ' corredores y sus ' + r.eventos + ' vueltas.\n' +
      'Las demás tandas no se tocan. Esta acción no se puede deshacer: exporta antes si la necesitas.',
      'Sí, eliminar la tanda');
    if (!ok) return;
    await Estado.borrarTanda(t.id);
    Util.aviso('Tanda eliminada', 'ok');
    App.tandaCambio();
  }

  /* ---------------- oleadas ---------------- */

  function pintarOleadas() {
    $('#nombre-tanda-oleadas').textContent = est.tandaActiva ? est.tandaActiva.nombre : '';
    const caja = $('#lista-oleadas');
    caja.innerHTML = '';

    const oleadas = Estado.oleadas();
    for (const o of oleadas) {
      let cuantos = 0;
      for (const c of est.corredores.values()) if (c.oleada === o.id) cuantos++;

      const acciones = Util.el('div', { clase: 'item-acciones' }, [
        Util.el('button', {
          type: 'button', texto: '✏️', 'aria-label': 'Renombrar oleada',
          onclick: () => renombrarOleada(o)
        })
      ]);
      if (oleadas.length > 1) {
        acciones.append(Util.el('button', {
          type: 'button', texto: '🗑️', 'aria-label': 'Eliminar oleada',
          onclick: () => eliminarOleada(o)
        }));
      }

      caja.append(Util.el('div', { clase: 'item' + (o.horaSalida ? ' ok' : '') }, [
        Util.el('div', { clase: 'item-cuerpo' }, [
          Util.el('strong', { texto: o.nombre }),
          Util.el('span', {
            clase: 'item-meta',
            texto: cuantos + ' corredor' + (cuantos === 1 ? '' : 'es') + ' · ' +
                   (o.horaSalida ? 'salida ' + Util.hora(o.horaSalida) : 'sin salida')
          })
        ]),
        acciones
      ]));
    }

    if (oleadas.length > 1) {
      caja.append(Util.el('button', {
        clase: 'btn btn-secundario', type: 'button',
        texto: '↔️ Repartir inscritos entre oleadas',
        onclick: repartir
      }));
    }
  }

  async function renombrarOleada(o) {
    const inNombre = Util.el('input', { type: 'text', maxlength: '30', value: o.nombre });
    const cuerpo = Util.el('div', { clase: 'campo' }, [Util.el('label', { texto: 'Nombre' }), inNombre]);
    const r = await Util.modal('Renombrar oleada', cuerpo, [
      { texto: 'Guardar', clase: 'btn-primario', valor: 'ok' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    if (r !== 'ok') return;
    await Estado.actualizarOleada(o.id, { nombre: inNombre.value.trim() || o.nombre });
    App.datosCambiaron();
    pintarOleadas();
  }

  async function nuevaOleada() {
    const id = await Estado.agregarOleada('');
    Util.aviso('Oleada ' + id + ' añadida', 'ok');
    App.datosCambiaron();
    pintarOleadas();
  }

  async function eliminarOleada(o) {
    const ok = await Util.confirmar(
      'Eliminar ' + o.nombre,
      'Los corredores de esa oleada pasarán a la primera oleada que quede.',
      'Sí, eliminar');
    if (!ok) return;
    await Estado.borrarOleada(o.id);
    App.datosCambiaron();
    pintarOleadas();
  }

  /** Asigna oleadas por rango de dorsal, que es como se suele organizar. */
  async function repartir() {
    const oleadas = Estado.oleadas();
    const campos = [];
    const cuerpo = Util.el('div', {}, [
      Util.el('p', { texto: 'Indica desde qué dorsal empieza cada oleada. Los dorsales menores al primer corte quedan en la primera oleada.' })
    ]);
    for (let i = 1; i < oleadas.length; i++) {
      const inp = Util.el('input', { type: 'number', min: '1', step: '1', placeholder: 'dorsal' });
      campos.push({ oleada: oleadas[i], input: inp });
      cuerpo.append(Util.el('div', { clase: 'campo' }, [
        Util.el('label', { texto: oleadas[i].nombre + ' empieza en el dorsal' }), inp
      ]));
    }

    const r = await Util.modal('Repartir por rango de dorsal', cuerpo, [
      { texto: 'Aplicar', clase: 'btn-primario', valor: 'ok' },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    if (r !== 'ok') return;

    const cortes = campos
      .map(c => ({ oleada: c.oleada.id, desde: Number(c.input.value) }))
      .filter(c => Number.isFinite(c.desde) && c.desde > 0)
      .sort((a, b) => a.desde - b.desde);
    if (!cortes.length) { Util.aviso('No indicaste ningún corte', 'error'); return; }

    const cambios = [];
    for (const c of est.corredores.values()) {
      let destino = oleadas[0].id;
      for (const corte of cortes) if (c.dorsal >= corte.desde) destino = corte.oleada;
      if (c.oleada !== destino) cambios.push(Object.assign({}, c, { oleada: destino }));
    }
    if (!cambios.length) { Util.aviso('No hubo cambios', ''); return; }

    await DB.ponerVarios('corredores', cambios);
    for (const c of cambios) { est.todos.set(c.id, c); est.corredores.set(c.dorsal, c); }
    Util.aviso(cambios.length + ' corredores reasignados', 'ok');
    App.datosCambiaron();
    pintarOleadas();
  }

  /* ---------------- ciclo de vida ---------------- */

  function iniciar() {
    $('#sel-tanda').addEventListener('change', e => cambiarTanda(e.target.value));
    $('#btn-nueva-tanda').addEventListener('click', nueva);
    $('#btn-nueva-oleada').addEventListener('click', nuevaOleada);
    refrescar();
  }

  function refrescar() {
    pintarBarra();
    pintarListaTandas();
    pintarOleadas();
  }

  return { iniciar, refrescar, pintarBarra, pintarOleadas, pintarListaTandas };
})();
