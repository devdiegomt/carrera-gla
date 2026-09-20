/* ============================================================
   tandas.js — grupos y salidas.

   En la interfaz una "tanda" se llama GRUPO (los que corren
   juntos) y una "oleada" se llama SALIDA (los que arrancan al
   mismo tiempo dentro del grupo). En el código se conservan los
   nombres originales del modelo de datos.
   ============================================================ */
'use strict';

const Tandas = (() => {

  const $ = Util.$;
  const est = Estado.est;

  const lista = () => Array.from(est.tandas.values()).sort((a, b) => b.creadaEn - a.creadaEn);

  /* ================= barra superior ================= */

  function pintarBarra() {
    if (!est.tandaActiva) return;
    $('#barra-grupo-nombre').textContent = est.tandaActiva.nombre;
    const r = Estado.resumen();
    $('#barra-grupo-dato').textContent =
      r.inscritos + (r.inscritos === 1 ? ' corredor' : ' corredores');
  }

  async function abrirSelector() {
    const caja = UI.el('div', { clase: 'lista' });
    for (const t of lista()) {
      const r = Estado.resumenTanda(t.id);
      const activo = est.tandaActiva && t.id === est.tandaActiva.id;
      caja.append(UI.el('button', {
        type: 'button',
        clase: 'fila' + (activo ? ' fila--activa' : ''),
        onclick: () => UI.cerrarHoja({ accion: 'usar', id: t.id })
      }, [
        UI.el('div', { clase: 'fila__cuerpo' }, [
          UI.el('div', { clase: 'fila__titulo', texto: t.nombre }),
          UI.el('div', {
            clase: 'fila__meta',
            texto: r.inscritos + ' corredores · ' + t.vueltas +
                   (t.vueltas === 1 ? ' vuelta' : ' vueltas') + ' · ' +
                   (r.eventos === 1 ? '1 pasada' : r.eventos + ' pasadas')
          })
        ]),
        activo ? UI.icono('cheque') : UI.icono('derecha')
      ]));
    }

    const r = await UI.hoja({
      titulo: 'Grupos',
      descripcion: 'Cada grupo corre aparte. Los dorsales y las manillas se pueden repetir ' +
                   'entre grupos sin que los datos se mezclen.',
      cuerpo: caja,
      acciones: [{ texto: 'Crear un grupo nuevo', icono: 'mas', tipo: 'principal', valor: { accion: 'crear' } }]
    });
    if (!r) return;
    if (r.accion === 'crear') return crear();
    if (r.accion === 'usar') return cambiar(r.id);
  }

  async function cambiar(id) {
    if (!id || (est.tandaActiva && id === est.tandaActiva.id)) return;
    if (NFC.estaActivo()) {
      const ok = await UI.confirmar({
        titulo: 'Hay una lectura activa',
        mensaje: 'Se apagará la lectura para que ninguna vuelta quede en el grupo equivocado.',
        confirmar: 'Cambiar de grupo', peligro: false
      });
      if (!ok) return;
      NFC.detener();
    }
    await Estado.activarTanda(id);
    UI.aviso('Grupo activo: ' + est.tandaActiva.nombre, 'ok');
    App.tandaCambio();
  }

  /* ================= crear y editar ================= */

  async function crear() {
    const anteriores = lista();

    const cNombre = UI.campo({ etiqueta: 'Nombre del grupo', valor: 'Grupo ' + (est.tandas.size + 1), maximo: 40 });
    const cVueltas = UI.contador({
      etiqueta: 'Vueltas para terminar',
      valor: est.config.vueltasPorDefecto || 5, minimo: 1, maximo: 99
    });
    const cSalidas = UI.contador({
      etiqueta: 'Cuántas salidas',
      ayuda: 'Una sola si arrancan todos juntos. Dos o más si arrancan escalonados.',
      valor: 1, minimo: 1, maximo: 20
    });

    let heredarDe = anteriores.length ? anteriores[0].id : '';
    const selHeredar = anteriores.length ? UI.selector({
      etiqueta: 'Reutilizar las manillas de',
      ayuda: 'Si cada manilla va pegada a su número de dorsal, con esto no hay que volver a ' +
             'escanear: el grupo nuevo nace con las manillas puestas y solo faltan los nombres.',
      opciones: [{ valor: '', texto: 'No reutilizar: empezar de cero' }].concat(
        anteriores.map(t => {
          const r = Estado.resumenTanda(t.id);
          return { valor: t.id, texto: t.nombre, ayuda: r.conChip + ' manillas asignadas' };
        })),
      valor: heredarDe,
      alCambiar: v => { heredarDe = v; }
    }) : null;

    const cuerpo = UI.el('div', {}, [cNombre, cVueltas, cSalidas, selHeredar]);

    const r = await UI.hoja({
      titulo: 'Nuevo grupo',
      cuerpo,
      acciones: [{ texto: 'Crear grupo', tipo: 'principal', valor: 'ok' }]
    });
    if (r !== 'ok') return;

    const n = cSalidas.obtenerValor();
    const oleadas = [];
    for (let i = 1; i <= n; i++) oleadas.push({ id: i, nombre: 'Salida ' + i, horaSalida: null });

    const tanda = await Estado.crearTanda({
      nombre: cNombre.obtenerValor(),
      vueltas: cVueltas.obtenerValor(),
      ventanaMinSeg: est.config.ventanaPorDefecto || 60,
      oleadas,
      heredarChipsDe: (selHeredar && heredarDe) || null
    });

    const res = Estado.resumenTanda(tanda.id);
    UI.aviso('Grupo «' + tanda.nombre + '» creado' +
      (res.conChip ? ' con ' + res.conChip + ' manillas reutilizadas' : ''), 'ok');
    App.tandaCambio();
  }

  async function editar(t) {
    const cNombre = UI.campo({ etiqueta: 'Nombre del grupo', valor: t.nombre, maximo: 40 });
    const r = await UI.hoja({
      titulo: 'Grupo «' + t.nombre + '»',
      cuerpo: UI.el('div', {}, [
        cNombre,
        UI.el('p', { clase: 'codigo', texto: 'Código para juntar datos: ' + t.id })
      ]),
      acciones: [
        { texto: 'Guardar', tipo: 'principal', valor: 'ok' },
        { texto: 'Eliminar el grupo', tipo: 'peligro', valor: 'borrar' }
      ]
    });
    if (!r) return;
    if (r === 'borrar') return eliminar(t);
    await Estado.guardarTandaPorId(t.id, { nombre: cNombre.obtenerValor().trim() || t.nombre });
    UI.aviso('Grupo renombrado', 'ok');
    App.tandaCambio();
  }

  async function eliminar(t) {
    const r = Estado.resumenTanda(t.id);
    const ok = await UI.confirmar({
      titulo: 'Eliminar «' + t.nombre + '»',
      mensaje: 'Se borran sus ' + r.inscritos + ' corredores y sus ' + r.eventos + ' pasadas.\n' +
               'Los otros grupos no se tocan. No se puede deshacer: comparte una copia antes si la necesitas.',
      confirmar: 'Sí, eliminar'
    });
    if (!ok) return;
    await Estado.borrarTanda(t.id);
    UI.aviso('Grupo eliminado', 'neutro');
    App.tandaCambio();
  }

  /* ================= pantalla de grupos (dentro de Ajustes) ================= */

  function panelGrupos() {
    const caja = UI.el('div', { clase: 'lista' });
    for (const t of lista()) {
      const r = Estado.resumenTanda(t.id);
      const activo = est.tandaActiva && t.id === est.tandaActiva.id;
      const fila = UI.el('div', { clase: 'fila' + (activo ? ' fila--activa' : '') }, [
        UI.el('div', { clase: 'fila__cuerpo' }, [
          UI.el('div', { clase: 'fila__titulo', texto: t.nombre + (activo ? ' · en uso' : '') }),
          UI.el('div', {
            clase: 'fila__meta',
            texto: r.inscritos + ' corredores · ' + r.conChip + ' con manilla · ' +
                   t.vueltas + (t.vueltas === 1 ? ' vuelta' : ' vueltas')
          })
        ])
      ]);
      if (!activo) {
        fila.append(UI.boton({ texto: 'Usar', tamano: 'chico', alPulsar: () => cambiar(t.id) }));
      }
      fila.append(UI.boton({ icono: 'lapiz', tipo: 'fantasma', etiqueta: 'Editar grupo', alPulsar: () => editar(t) }));
      caja.append(fila);
    }

    return UI.el('div', {}, [
      caja,
      UI.el('div', { style: 'height:12px' }),
      UI.boton({ texto: 'Crear un grupo nuevo', icono: 'mas', tipo: 'principal', ancho: 'completo', alPulsar: crear })
    ]);
  }

  /* ================= salidas ================= */

  function panelSalidas() {
    const salidas = Estado.oleadas();
    const caja = UI.el('div', { clase: 'lista' });

    for (const o of salidas) {
      let cuantos = 0;
      for (const c of est.corredores.values()) if (c.oleada === o.id) cuantos++;
      const fila = UI.el('div', { clase: 'fila' + (o.horaSalida ? ' fila--ok' : '') }, [
        UI.el('div', { clase: 'fila__cuerpo' }, [
          UI.el('div', { clase: 'fila__titulo', texto: o.nombre }),
          UI.el('div', {
            clase: 'fila__meta',
            texto: cuantos + (cuantos === 1 ? ' corredor · ' : ' corredores · ') +
                   (o.horaSalida ? 'salió a las ' + Util.hora(o.horaSalida) : 'sin salir')
          })
        ]),
        UI.boton({ icono: 'lapiz', tipo: 'fantasma', etiqueta: 'Renombrar salida', alPulsar: () => renombrarSalida(o) })
      ]);
      if (salidas.length > 1) {
        fila.append(UI.boton({
          icono: 'basura', tipo: 'fantasma', etiqueta: 'Eliminar salida',
          alPulsar: () => eliminarSalida(o)
        }));
      }
      caja.append(fila);
    }

    const acciones = UI.el('div', { clase: 'acciones', style: 'margin-top:12px' }, [
      UI.boton({ texto: 'Añadir salida', icono: 'mas', alPulsar: nuevaSalida })
    ]);
    if (salidas.length > 1) {
      acciones.append(UI.boton({ texto: 'Repartir corredores', icono: 'grupo', alPulsar: repartir }));
    }

    return UI.el('div', {}, [
      UI.el('p', {
        clase: 'campo__ayuda', style: 'margin-bottom:12px',
        texto: 'Si el grupo arranca escalonado, crea una salida por cada arranque y dile a la app ' +
               'quién va en cada una. La hora se marca en la pestaña Carrera.'
      }),
      caja, acciones
    ]);
  }

  async function nuevaSalida() {
    const id = await Estado.agregarOleada('');
    UI.aviso('Salida ' + id + ' añadida', 'ok');
    App.datosCambiaron();
    Ajustes.refrescar();
  }

  async function renombrarSalida(o) {
    const nombre = await UI.pedir({
      titulo: 'Renombrar salida', etiqueta: 'Nombre', valor: o.nombre
    });
    if (nombre == null) return;
    await Estado.actualizarOleada(o.id, { nombre: nombre.trim() || o.nombre });
    App.datosCambiaron();
    Ajustes.refrescar();
  }

  async function eliminarSalida(o) {
    const ok = await UI.confirmar({
      titulo: 'Eliminar ' + o.nombre,
      mensaje: 'Los corredores de esa salida pasan a la primera que quede.',
      confirmar: 'Sí, eliminar'
    });
    if (!ok) return;
    await Estado.borrarOleada(o.id);
    App.datosCambiaron();
    Ajustes.refrescar();
  }

  /** Reparte por rangos de dorsal, que es como se suele organizar. */
  async function repartir() {
    const salidas = Estado.oleadas();
    const campos = [];
    const cuerpo = UI.el('div', {}, [
      UI.el('p', {
        clase: 'campo__ayuda', style: 'margin-bottom:12px',
        texto: 'Indica desde qué dorsal empieza cada salida. Los números menores quedan en la primera.'
      })
    ]);
    for (let i = 1; i < salidas.length; i++) {
      const c = UI.campo({
        etiqueta: salidas[i].nombre + ' empieza en el dorsal',
        tipo: 'number', marcador: 'Ej.: 150'
      });
      campos.push({ oleada: salidas[i].id, campo: c });
      cuerpo.append(c);
    }

    const r = await UI.hoja({
      titulo: 'Repartir corredores',
      cuerpo,
      acciones: [{ texto: 'Aplicar', tipo: 'principal', valor: 'ok' }]
    });
    if (r !== 'ok') return;

    const cortes = campos
      .map(c => ({ oleada: c.oleada, desde: Number(c.campo.obtenerValor()) }))
      .filter(c => Number.isFinite(c.desde) && c.desde > 0)
      .sort((a, b) => a.desde - b.desde);
    if (!cortes.length) { UI.aviso('No indicaste ningún número', 'error'); return; }

    const cambios = [];
    for (const c of est.corredores.values()) {
      let destino = salidas[0].id;
      for (const corte of cortes) if (c.dorsal >= corte.desde) destino = corte.oleada;
      if (c.oleada !== destino) cambios.push(Object.assign({}, c, { oleada: destino }));
    }
    if (!cambios.length) { UI.aviso('No hubo cambios', 'neutro'); return; }

    await DB.ponerVarios('corredores', cambios);
    for (const c of cambios) { est.todos.set(c.id, c); est.corredores.set(c.dorsal, c); }
    UI.aviso(cambios.length + ' corredores reasignados', 'ok');
    App.datosCambiaron();
    Ajustes.refrescar();
  }

  /* ================= ciclo de vida ================= */

  function iniciar() {
    $('#barra-grupo').addEventListener('click', abrirSelector);
    pintarBarra();
  }

  return { iniciar, pintarBarra, abrirSelector, crear, panelGrupos, panelSalidas };
})();
