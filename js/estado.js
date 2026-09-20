/* ============================================================
   estado.js — estado en memoria y reglas de la carrera.

   Jerarquía:
     TANDA   grupo que corre junto. Dorsales y chips se reciclan
             entre tandas sin mezclarse (el 101 de la mañana no es
             el 101 de la tarde).
     OLEADA  salida escalonada dentro de una tanda, con su propia
             hora de salida. El tiempo neto descuenta esa salida.

   Los eventos se indexan por tanda y dorsal (Map dorsal -> array
   ordenado por hora). Nunca se recorre el arreglo completo para
   registrar una lectura: es una búsqueda binaria sobre las pocas
   vueltas de ese dorsal.
   ============================================================ */
'use strict';

const Estado = (() => {

  const CONFIG_POR_DEFECTO = {
    id: 1,
    esquema: 2,
    nombreCarrera: 'Carrera escolar',
    digitosDorsal: 3,
    idDispositivo: '',
    nombrePuesto: 'Meta',
    tandaActiva: null,
    vueltasPorDefecto: 5,
    ventanaPorDefecto: 60,
    rangoDesde: null,   // rango de dorsales que inscribe ESTE dispositivo
    rangoHasta: null
  };

  const est = {
    config: Object.assign({}, CONFIG_POR_DEFECTO),

    tandas: new Map(),       // idTanda -> tanda
    tandaActiva: null,       // objeto tanda (nunca null tras cargar)

    todos: new Map(),        // idCorredor -> corredor (todas las tandas)
    corredores: new Map(),   // dorsal -> corredor (SOLO tanda activa)
    porUid: new Map(),       // uid -> dorsal (SOLO tanda activa)
    uidHistorial: new Map(), // uid -> [{tanda, dorsal, nombre, categoria}] (todas)

    indices: new Map(),      // idTanda -> Map(dorsal -> [evento ordenado])
    porDorsal: new Map(),    // = indices.get(tandaActiva.id)

    todasPendientes: [],
    pendientes: [],          // SOLO tanda activa

    totalEventos: 0,         // SOLO tanda activa
    ultimoLocal: null
  };

  /* ================= identificadores ================= */

  /** Id de tanda corto y legible: T-4K9P. Único entre dispositivos. */
  function nuevoIdTanda() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id;
    do {
      let s = '';
      for (let i = 0; i < 4; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
      id = 'T-' + s;
    } while (est.tandas.has(id));
    return id;
  }

  function claveCorredor(tanda, dorsal) { return tanda + '#' + dorsal; }

  /* ================= carga inicial ================= */

  async function cargar() {
    const guardada = await DB.obtener('config', 1);
    if (guardada) est.config = Object.assign({}, CONFIG_POR_DEFECTO, guardada, { id: 1 });
    if (!est.config.idDispositivo) est.config.idDispositivo = Util.idAleatorio('CEL');

    // Compatibilidad con el esquema v1: sus vueltas/ventana pasan a ser
    // los valores por defecto de las tandas nuevas.
    if (guardada && guardada.vueltas && !guardada.vueltasPorDefecto) {
      est.config.vueltasPorDefecto = guardada.vueltas;
    }
    if (guardada && guardada.ventanaMinSeg && !guardada.ventanaPorDefecto) {
      est.config.ventanaPorDefecto = guardada.ventanaMinSeg;
    }
    delete est.config.vueltas;
    delete est.config.ventanaMinSeg;

    const tandas = await DB.todo('tandas');
    est.tandas.clear();
    for (const t of tandas) est.tandas.set(t.id, normalizarTanda(t));

    const listaCorredores = await DB.todo('corredores');
    const listaEventos = await DB.todo('eventos');
    reconstruirCorredores(listaCorredores);
    reconstruirEventos(listaEventos);
    est.todasPendientes = (await DB.todo('pendientes')).sort((a, b) => a.ts - b.ts);

    // Tandas implícitas: registros que apuntan a una tanda inexistente.
    // Pasa al migrar desde el esquema v1 y repara cualquier inconsistencia.
    await recuperarTandasHuerfanas(listaCorredores, listaEventos);

    // Siempre debe existir una tanda activa.
    if (!est.tandas.size) {
      const t = await crearTanda({ nombre: 'Tanda 1' }, false);
      est.config.tandaActiva = t.id;
    } else if (!est.tandas.has(est.config.tandaActiva)) {
      est.config.tandaActiva = tandaMasReciente().id;
    }
    await guardarConfig({});
    apuntarATanda(est.config.tandaActiva);
  }

  /** Crea las tandas que los datos mencionan pero que no existen. */
  async function recuperarTandasHuerfanas(corredores, eventos) {
    const referidas = new Set();
    for (const c of corredores) if (c.tanda) referidas.add(c.tanda);
    for (const ev of eventos) if (ev.tanda) referidas.add(ev.tanda);
    for (const p of est.todasPendientes) if (p.tanda) referidas.add(p.tanda);

    let creadas = 0;
    for (const id of referidas) {
      if (est.tandas.has(id)) continue;
      const tanda = normalizarTanda({
        id,
        nombre: id === 'T-1'
          ? (est.config.nombreCarrera || 'Tanda 1')
          : 'Tanda recuperada ' + id,
        vueltas: Number(est.config.vueltasPorDefecto) || 5,
        ventanaMinSeg: Number(est.config.ventanaPorDefecto) || 60,
        creadaEn: Date.now() + (creadas++)
      });
      await DB.poner('tandas', tanda);
      est.tandas.set(id, tanda);
      if (!est.config.tandaActiva) est.config.tandaActiva = id;
    }
    if (creadas) {
      reconstruirCorredores(corredores);   // recalcula el historial de manillas
      reconstruirEventos(eventos);
    }
  }

  function normalizarTanda(t) {
    const tanda = Object.assign({
      id: t.id,
      nombre: t.nombre || t.id,
      vueltas: 5,
      ventanaMinSeg: 60,
      estado: 'abierta',
      creadaEn: Date.now(),
      oleadas: []
    }, t);
    if (!Array.isArray(tanda.oleadas) || !tanda.oleadas.length) {
      tanda.oleadas = [{ id: 1, nombre: 'Oleada 1', horaSalida: null }];
    }
    return tanda;
  }

  function tandaMasReciente() {
    let mejor = null;
    for (const t of est.tandas.values()) if (!mejor || t.creadaEn > mejor.creadaEn) mejor = t;
    return mejor;
  }

  function reconstruirCorredores(lista) {
    est.todos.clear();
    est.uidHistorial.clear();
    for (const c of lista) {
      est.todos.set(c.id || claveCorredor(c.tanda, c.dorsal), c);
      if (c.uid) {
        let arr = est.uidHistorial.get(c.uid);
        if (!arr) { arr = []; est.uidHistorial.set(c.uid, arr); }
        arr.push(c);
      }
    }
    for (const arr of est.uidHistorial.values()) {
      arr.sort((a, b) => creacionDe(b.tanda) - creacionDe(a.tanda));
    }
  }

  function creacionDe(idTanda) {
    const t = est.tandas.get(idTanda);
    return t ? t.creadaEn : 0;
  }

  function reconstruirEventos(lista) {
    est.indices.clear();
    for (const ev of lista) {
      const tanda = ev.tanda || (est.tandaActiva && est.tandaActiva.id) || 'T-1';
      let porDorsal = est.indices.get(tanda);
      if (!porDorsal) { porDorsal = new Map(); est.indices.set(tanda, porDorsal); }
      let arr = porDorsal.get(ev.dorsal);
      if (!arr) { arr = []; porDorsal.set(ev.dorsal, arr); }
      arr.push(ev);
    }
    for (const porDorsal of est.indices.values()) {
      for (const arr of porDorsal.values()) arr.sort((a, b) => a.ts - b.ts);
    }
    est.ultimoLocal = null;
    if (est.tandaActiva) apuntarATanda(est.tandaActiva.id);
  }

  /** Reapunta las vistas "de la tanda activa" a la tanda indicada. */
  function apuntarATanda(idTanda) {
    const tanda = est.tandas.get(idTanda) || tandaMasReciente();
    est.tandaActiva = tanda;
    if (!tanda) return;

    est.corredores.clear();
    est.porUid.clear();
    for (const c of est.todos.values()) {
      if (c.tanda !== tanda.id) continue;
      est.corredores.set(c.dorsal, c);
      if (c.uid) est.porUid.set(c.uid, c.dorsal);
    }

    if (!est.indices.has(tanda.id)) est.indices.set(tanda.id, new Map());
    est.porDorsal = est.indices.get(tanda.id);

    let n = 0;
    for (const arr of est.porDorsal.values()) n += arr.length;
    est.totalEventos = n;

    est.pendientes = est.todasPendientes.filter(p => p.tanda === tanda.id);
    est.ultimoLocal = null;
  }

  /* ================= tandas ================= */

  function vueltas() { return Number(est.tandaActiva && est.tandaActiva.vueltas) || 1; }
  function ventanaMs() {
    return Math.max(1, Number(est.tandaActiva && est.tandaActiva.ventanaMinSeg) || 1) * 1000;
  }
  function oleadas() { return (est.tandaActiva && est.tandaActiva.oleadas) || []; }

  function oleadaDe(corredor) {
    const lista = oleadas();
    return lista.find(o => o.id === corredor.oleada) || lista[0] || null;
  }

  /**
   * Crea una tanda. heredarChipsDe copia las parejas dorsal↔chip de
   * otra tanda dejando los nombres vacíos: es la forma rápida de
   * reutilizar las manillas cuando la manilla y el dorsal van juntos.
   */
  async function crearTanda(datos, activar = true) {
    const tanda = normalizarTanda({
      id: nuevoIdTanda(),
      nombre: (datos.nombre || '').trim() || 'Tanda ' + (est.tandas.size + 1),
      vueltas: Number(datos.vueltas) || Number(est.config.vueltasPorDefecto) || 5,
      ventanaMinSeg: Number(datos.ventanaMinSeg) || Number(est.config.ventanaPorDefecto) || 60,
      estado: 'abierta',
      creadaEn: Date.now(),
      oleadas: datos.oleadas && datos.oleadas.length ? datos.oleadas : null
    });
    await DB.poner('tandas', tanda);
    est.tandas.set(tanda.id, tanda);

    if (datos.heredarChipsDe && est.tandas.has(datos.heredarChipsDe)) {
      const origen = [];
      for (const c of est.todos.values()) if (c.tanda === datos.heredarChipsDe) origen.push(c);
      origen.sort((a, b) => a.dorsal - b.dorsal);
      const nuevos = origen.map(c => ({
        id: claveCorredor(tanda.id, c.dorsal),
        tanda: tanda.id,
        dorsal: c.dorsal,
        nombre: datos.heredarNombres ? c.nombre : '',
        categoria: datos.heredarCategorias === false ? '' : (c.categoria || ''),
        uid: c.uid || null,
        oleada: 1
      }));
      await DB.ponerVarios('corredores', nuevos);
      for (const c of nuevos) {
        est.todos.set(c.id, c);
        if (c.uid) {
          let arr = est.uidHistorial.get(c.uid);
          if (!arr) { arr = []; est.uidHistorial.set(c.uid, arr); }
          arr.unshift(c);
        }
      }
    }

    if (activar) await activarTanda(tanda.id);
    return tanda;
  }

  async function activarTanda(idTanda) {
    if (!est.tandas.has(idTanda)) return false;
    await guardarConfig({ tandaActiva: idTanda });
    apuntarATanda(idTanda);
    return true;
  }

  async function guardarTanda(parches) {
    const tanda = Object.assign({}, est.tandaActiva, parches);
    await DB.poner('tandas', tanda);
    est.tandas.set(tanda.id, tanda);
    if (est.tandaActiva && est.tandaActiva.id === tanda.id) est.tandaActiva = tanda;
    return tanda;
  }

  async function guardarTandaPorId(idTanda, parches) {
    const previa = est.tandas.get(idTanda);
    if (!previa) return null;
    const tanda = Object.assign({}, previa, parches);
    await DB.poner('tandas', tanda);
    est.tandas.set(idTanda, tanda);
    if (est.tandaActiva && est.tandaActiva.id === idTanda) est.tandaActiva = tanda;
    return tanda;
  }

  /** Borra una tanda con todos sus corredores, eventos y pendientes. */
  async function borrarTanda(idTanda) {
    const clavesCorr = [];
    for (const c of est.todos.values()) if (c.tanda === idTanda) clavesCorr.push(c.id);
    await DB.borrarVarios('corredores', clavesCorr);
    for (const k of clavesCorr) est.todos.delete(k);

    const idsEv = [];
    const porDorsal = est.indices.get(idTanda);
    if (porDorsal) for (const arr of porDorsal.values()) for (const ev of arr) idsEv.push(ev.id);
    await DB.borrarVarios('eventos', idsEv);
    est.indices.delete(idTanda);

    const idsPen = est.todasPendientes.filter(p => p.tanda === idTanda).map(p => p.id);
    await DB.borrarVarios('pendientes', idsPen);
    est.todasPendientes = est.todasPendientes.filter(p => p.tanda !== idTanda);

    await DB.borrar('tandas', idTanda);
    est.tandas.delete(idTanda);

    reconstruirCorredores(Array.from(est.todos.values()));

    if (!est.tandas.size) {
      const t = await crearTanda({ nombre: 'Tanda 1' }, false);
      await activarTanda(t.id);
    } else if (est.config.tandaActiva === idTanda) {
      await activarTanda(tandaMasReciente().id);
    }
  }

  function resumenTanda(idTanda) {
    const tanda = est.tandas.get(idTanda);
    if (!tanda) return null;
    let inscritos = 0, conChip = 0;
    for (const c of est.todos.values()) {
      if (c.tanda !== idTanda) continue;
      inscritos++;
      if (c.uid) conChip++;
    }
    let eventos = 0;
    const porDorsal = est.indices.get(idTanda);
    if (porDorsal) for (const arr of porDorsal.values()) eventos += arr.length;
    return { tanda, inscritos, conChip, eventos };
  }

  /* ================= oleadas ================= */

  async function agregarOleada(nombre) {
    const lista = oleadas().slice();
    const id = lista.reduce((m, o) => Math.max(m, o.id), 0) + 1;
    lista.push({ id, nombre: (nombre || '').trim() || 'Oleada ' + id, horaSalida: null });
    await guardarTanda({ oleadas: lista });
    return id;
  }

  async function actualizarOleada(id, parches) {
    const lista = oleadas().map(o => (o.id === id ? Object.assign({}, o, parches) : o));
    await guardarTanda({ oleadas: lista });
  }

  /** Marca la hora de salida de una oleada. */
  async function darSalida(id, ts) {
    await actualizarOleada(id, { horaSalida: Number(ts) || Date.now() });
  }

  async function borrarOleada(id) {
    const lista = oleadas().filter(o => o.id !== id);
    if (!lista.length) return false;
    // Los corredores de esa oleada pasan a la primera que quede.
    const destino = lista[0].id;
    const mover = [];
    for (const c of est.corredores.values()) {
      if (c.oleada === id) { const n = Object.assign({}, c, { oleada: destino }); mover.push(n); }
    }
    if (mover.length) {
      await DB.ponerVarios('corredores', mover);
      for (const c of mover) { est.todos.set(c.id, c); est.corredores.set(c.dorsal, c); }
    }
    await guardarTanda({ oleadas: lista });
    return true;
  }

  /** Hora de salida aplicable a un corredor; null si su oleada no arrancó. */
  function salidaDe(corredor) {
    const o = oleadaDe(corredor);
    return o && o.horaSalida ? o.horaSalida : null;
  }

  /* ================= índice ordenado ================= */

  function puntoInsercion(arr, ts) {
    let bajo = 0, alto = arr.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (arr[medio].ts < ts) bajo = medio + 1; else alto = medio;
    }
    return bajo;
  }

  function insertarEnIndice(ev) {
    let arr = est.porDorsal.get(ev.dorsal);
    if (!arr) { arr = []; est.porDorsal.set(ev.dorsal, arr); }
    const i = puntoInsercion(arr, ev.ts);
    arr.splice(i, 0, ev);
    est.totalEventos++;
    return i;
  }

  function quitarDelIndice(ev) {
    const arr = est.porDorsal.get(ev.dorsal);
    if (!arr) return false;
    const i = arr.findIndex(x => x.id === ev.id);
    if (i < 0) return false;
    arr.splice(i, 1);
    est.totalEventos--;
    if (!arr.length) est.porDorsal.delete(ev.dorsal);
    return true;
  }

  /* ================= REGLA CENTRAL DE DEDUPLICACIÓN ================= */

  /**
   * Devuelve el evento en conflicto si el dorsal ya tiene una marca
   * dentro de la ventana, sin importar el dispositivo de origen.
   * Mira hacia atrás y hacia adelante: una marca pendiente asignada
   * después puede caer entre dos eventos ya registrados.
   */
  function conflicto(dorsal, ts, ms) {
    const arr = est.porDorsal.get(dorsal);
    if (!arr || !arr.length) return null;
    const ventana = ms || ventanaMs();
    const i = puntoInsercion(arr, ts);
    const antes = arr[i - 1];
    const despues = arr[i];
    if (antes && ts - antes.ts < ventana) return antes;
    if (despues && despues.ts - ts < ventana) return despues;
    return null;
  }

  /* ================= registro de una lectura ================= */

  async function registrar({ dorsal, ts, metodo }) {
    dorsal = Number(dorsal);
    ts = Number(ts) || Date.now();
    const total = vueltas();
    const corredor = est.corredores.get(dorsal);

    if (!Number.isFinite(dorsal) || dorsal <= 0) {
      return { estado: 'error', razon: 'invalido', mensaje: 'Dorsal inválido', dorsal, total };
    }
    if (!corredor) {
      return {
        estado: 'error', razon: 'no-inscrito', dorsal, total,
        mensaje: 'Dorsal ' + dorsal + ' no está inscrito en ' + est.tandaActiva.nombre
      };
    }

    const choque = conflicto(dorsal, ts, ventanaMs());
    if (choque) {
      const seg = Math.round(Math.abs(ts - choque.ts) / 1000);
      return {
        estado: 'error', razon: 'duplicado', dorsal, corredor, total, choque,
        vuelta: (est.porDorsal.get(dorsal) || []).length,
        mensaje: 'Repetida: ya marcó hace ' + seg + ' s (' + Util.hora(choque.ts) +
                 ', ' + (choque.dispositivo || 'otro celular') + ')'
      };
    }

    const yaTiene = (est.porDorsal.get(dorsal) || []).length;
    if (yaTiene >= total) {
      return {
        estado: 'error', razon: 'terminado', dorsal, corredor, total, vuelta: yaTiene,
        mensaje: 'Ya completó las ' + total + ' vueltas'
      };
    }

    const evento = await DB.agregarEvento({
      tanda: est.tandaActiva.id,
      dorsal, ts,
      metodo: metodo || 'nfc',
      dispositivo: est.config.idDispositivo
    });
    const i = insertarEnIndice(evento);
    est.ultimoLocal = evento;

    const vuelta = i + 1;
    const o = oleadaDe(corredor);
    return {
      estado: vuelta >= total ? 'final' : 'ok',
      razon: 'registrado', dorsal, corredor, vuelta, total, evento,
      oleada: o,
      neto: salidaDe(corredor) != null ? ts - salidaDe(corredor) : null,
      mensaje: 'Vuelta ' + vuelta + ' de ' + total
    };
  }

  async function deshacerUltimo() {
    const ev = est.ultimoLocal;
    if (!ev) return null;
    await DB.borrar('eventos', ev.id);
    quitarDelIndice(ev);
    est.ultimoLocal = null;
    return ev;
  }

  /* ================= marcas pendientes ================= */

  async function marcarPendiente(ts, extra) {
    const p = await DB.agregarPendiente(Object.assign({
      tanda: est.tandaActiva.id,
      ts: ts || Date.now()
    }, extra || {}));
    est.todasPendientes.push(p);
    est.todasPendientes.sort((a, b) => a.ts - b.ts);
    est.pendientes = est.todasPendientes.filter(x => x.tanda === est.tandaActiva.id);
    return p;
  }

  async function quitarPendiente(id) {
    await DB.borrar('pendientes', id);
    est.todasPendientes = est.todasPendientes.filter(p => p.id !== id);
    est.pendientes = est.todasPendientes.filter(p => p.tanda === est.tandaActiva.id);
  }

  async function asignarPendiente(id, dorsal) {
    const p = est.pendientes.find(x => x.id === id);
    if (!p) return { estado: 'error', razon: 'no-existe', mensaje: 'La marca ya no existe' };
    const r = await registrar({ dorsal, ts: p.ts, metodo: 'asignada' });
    if (r.estado !== 'error') await quitarPendiente(id);
    return r;
  }

  /* ================= corredores ================= */

  async function guardarCorredor({ dorsal, nombre, categoria, uid, oleada }) {
    dorsal = Number(dorsal);
    const idTanda = est.tandaActiva.id;
    const previo = est.corredores.get(dorsal);
    const c = {
      id: claveCorredor(idTanda, dorsal),
      tanda: idTanda,
      dorsal,
      nombre: String(nombre == null ? (previo ? previo.nombre : '') : nombre).trim(),
      categoria: String(categoria == null ? (previo ? previo.categoria : '') : categoria).trim(),
      uid: uid !== undefined ? uid : (previo ? previo.uid : null),
      oleada: Number(oleada || (previo ? previo.oleada : 0)) || (oleadas()[0] ? oleadas()[0].id : 1)
    };
    await DB.poner('corredores', c);

    if (previo && previo.uid && previo.uid !== c.uid) {
      est.porUid.delete(previo.uid);
      const hist = est.uidHistorial.get(previo.uid);
      if (hist) est.uidHistorial.set(previo.uid, hist.filter(x => x.id !== c.id));
    }
    est.todos.set(c.id, c);
    est.corredores.set(dorsal, c);
    if (c.uid) {
      est.porUid.set(c.uid, dorsal);
      const hist = est.uidHistorial.get(c.uid) || [];
      const sinEste = hist.filter(x => x.id !== c.id);
      sinEste.unshift(c);
      est.uidHistorial.set(c.uid, sinEste);
    }
    return c;
  }

  async function borrarCorredor(dorsal) {
    dorsal = Number(dorsal);
    const c = est.corredores.get(dorsal);
    if (!c) return;
    await DB.borrar('corredores', c.id);
    est.corredores.delete(dorsal);
    est.todos.delete(c.id);
    if (c.uid) {
      est.porUid.delete(c.uid);
      const hist = est.uidHistorial.get(c.uid);
      if (hist) est.uidHistorial.set(c.uid, hist.filter(x => x.id !== c.id));
    }
  }

  /** Vincula un chip dentro de la tanda activa. */
  async function vincularUid(dorsal, uid, forzar) {
    dorsal = Number(dorsal);
    const duenio = est.porUid.get(uid);
    if (duenio != null && duenio !== dorsal) {
      const otro = est.corredores.get(duenio);
      if (!forzar) {
        return {
          ok: false, ocupadoPor: duenio,
          mensaje: 'Esa manilla ya está vinculada al dorsal ' + duenio +
                   (otro && otro.nombre ? ' (' + otro.nombre + ')' : '') + ' en esta tanda'
        };
      }
      await guardarCorredor(Object.assign({}, otro, { uid: null }));
    }
    const corredor = est.corredores.get(dorsal);
    if (!corredor) return { ok: false, mensaje: 'El dorsal ' + dorsal + ' no está inscrito en esta tanda' };
    await guardarCorredor(Object.assign({}, corredor, { uid }));
    return { ok: true, mensaje: 'Manilla vinculada al dorsal ' + dorsal };
  }

  /**
   * Qué sabemos de una manilla: a quién pertenece ahora en esta tanda
   * y a quién perteneció en tandas anteriores. Es la base de la
   * inscripción exprés al reutilizar manillas.
   */
  function historialDeChip(uid) {
    const hist = est.uidHistorial.get(uid) || [];
    const actual = hist.find(c => c.tanda === est.tandaActiva.id) || null;
    const previos = hist.filter(c => c.tanda !== est.tandaActiva.id);
    return {
      actual,
      previos,
      sugerido: actual || previos[0] || null,
      nombreTanda: id => { const t = est.tandas.get(id); return t ? t.nombre : id; }
    };
  }

  /** Siguiente dorsal libre, respetando el rango asignado a este dispositivo. */
  function siguienteDorsal() {
    const desde = Number(est.config.rangoDesde) || 0;
    const hasta = Number(est.config.rangoHasta) || 0;
    if (desde > 0) {
      for (let d = desde; d <= (hasta > 0 ? hasta : desde + 9999); d++) {
        if (!est.corredores.has(d)) return d;
      }
    }
    let max = 0;
    for (const d of est.corredores.keys()) if (d > max) max = d;
    return max + 1 || 1;
  }

  /** ¿El dorsal queda fuera del rango asignado a este dispositivo? */
  function fueraDeRango(dorsal) {
    const desde = Number(est.config.rangoDesde) || 0;
    const hasta = Number(est.config.rangoHasta) || 0;
    if (!desde && !hasta) return false;
    if (desde && dorsal < desde) return true;
    if (hasta && dorsal > hasta) return true;
    return false;
  }

  function categorias() {
    const s = new Set();
    for (const c of est.corredores.values()) if (c.categoria) s.add(c.categoria);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'));
  }

  /* ================= consultas ================= */

  function vueltasDe(dorsal) {
    const arr = est.porDorsal.get(Number(dorsal));
    return arr ? arr.length : 0;
  }

  function eventosDe(dorsal) { return est.porDorsal.get(Number(dorsal)) || []; }

  /** Eventos de una tanda (la activa por defecto), ordenados por hora. */
  function todosLosEventos(idTanda) {
    const porDorsal = idTanda ? est.indices.get(idTanda) : est.porDorsal;
    const out = [];
    if (porDorsal) for (const arr of porDorsal.values()) for (const ev of arr) out.push(ev);
    out.sort((a, b) => a.ts - b.ts || a.dorsal - b.dorsal);
    return out;
  }

  function eventosDeTodasLasTandas() {
    const out = [];
    for (const porDorsal of est.indices.values()) {
      for (const arr of porDorsal.values()) for (const ev of arr) out.push(ev);
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

  /** Primera marca de la tanda: referencia cuando una oleada no tiene salida. */
  function inicioReferencia(idTanda) {
    const porDorsal = idTanda ? est.indices.get(idTanda) : est.porDorsal;
    let min = Infinity;
    if (porDorsal) for (const arr of porDorsal.values()) {
      if (arr.length && arr[0].ts < min) min = arr[0].ts;
    }
    return isFinite(min) ? min : null;
  }

  /**
   * Tabla de posiciones.
   * modo 'neto'    — vueltas desc, tiempo desde la salida de su oleada asc.
   *                  Es el orden justo cuando hay salidas escalonadas.
   * modo 'llegada' — vueltas desc, hora de la última marca asc.
   *                  Es lo que ve quien está en la meta.
   */
  function posiciones(categoria, oleadaId, modo) {
    const total = vueltas();
    const t0 = inicioReferencia();
    const filas = [];

    for (const c of est.corredores.values()) {
      if (categoria && c.categoria !== categoria) continue;
      if (oleadaId && c.oleada !== oleadaId) continue;

      const arr = est.porDorsal.get(c.dorsal) || [];
      const n = arr.length;
      const ultima = n ? arr[n - 1].ts : null;
      const terminado = n >= total;
      const tsFinal = terminado ? arr[total - 1].ts : null;

      const salidaOleada = salidaDe(c);
      const salida = salidaOleada != null ? salidaOleada : t0;
      const referencia = terminado ? tsFinal : ultima;

      filas.push({
        dorsal: c.dorsal,
        nombre: c.nombre,
        categoria: c.categoria,
        oleada: c.oleada,
        nombreOleada: (oleadaDe(c) || {}).nombre || '',
        vueltas: n,
        ultima,
        terminado,
        tsFinal,
        salida,
        salidaEstimada: salidaOleada == null,
        tiempo: (referencia != null && salida != null) ? referencia - salida : null
      });
    }

    const porNeto = modo !== 'llegada';
    filas.sort((a, b) => {
      if (b.vueltas !== a.vueltas) return b.vueltas - a.vueltas;
      if (porNeto) {
        if (a.tiempo == null) return b.tiempo == null ? a.dorsal - b.dorsal : 1;
        if (b.tiempo == null) return -1;
        if (a.tiempo !== b.tiempo) return a.tiempo - b.tiempo;
        return a.dorsal - b.dorsal;
      }
      if (a.ultima == null) return b.ultima == null ? a.dorsal - b.dorsal : 1;
      if (b.ultima == null) return -1;
      if (a.ultima !== b.ultima) return a.ultima - b.ultima;
      return a.dorsal - b.dorsal;
    });

    filas.forEach((f, i) => { f.posicion = i + 1; });
    return filas;
  }

  function resumen() {
    const total = vueltas();
    let terminados = 0, sinChip = 0;
    for (const c of est.corredores.values()) {
      if ((est.porDorsal.get(c.dorsal) || []).length >= total) terminados++;
      if (!c.uid) sinChip++;
    }
    return {
      inscritos: est.corredores.size,
      vueltas: est.totalEventos,
      terminados,
      sinChip,
      pendientes: est.pendientes.length
    };
  }

  /* ================= configuración ================= */

  async function guardarConfig(nueva) {
    est.config = Object.assign({}, est.config, nueva, { id: 1, esquema: DB.ESQUEMA });
    await DB.poner('config', est.config);
    return est.config;
  }

  /* ================= DEDUPLICACIÓN GLOBAL (unión) ================= */

  /**
   * Aplica la regla a la mezcla de todos los dispositivos.
   * Se agrupa por TANDA + DORSAL: el 101 de una tanda nunca choca
   * con el 101 de otra.
   * msPorTanda: Map idTanda -> ventana en ms.
   */
  function dedupGlobal(eventos, msPorTanda, msPorDefecto) {
    const orden = eventos.slice().sort((a, b) =>
      a.ts - b.ts ||
      String(a.dispositivo || '').localeCompare(String(b.dispositivo || '')) ||
      (a.dorsal - b.dorsal)
    );
    const ultimoPorClave = new Map();
    const aceptados = [];
    const descartes = [];

    for (const ev of orden) {
      const clave = (ev.tanda || '?') + '#' + ev.dorsal;
      const ms = (msPorTanda && msPorTanda.get(ev.tanda)) || msPorDefecto || 60000;
      const prev = ultimoPorClave.get(clave);
      if (prev && ev.ts - prev.ts < ms) {
        descartes.push({
          tanda: ev.tanda,
          dorsal: ev.dorsal,
          horaConservada: prev.ts,
          horaDescartada: ev.ts,
          dispositivoConservado: prev.dispositivo || '—',
          dispositivoDescartado: ev.dispositivo || '—',
          diferenciaSeg: Math.round((ev.ts - prev.ts) / 1000)
        });
      } else {
        aceptados.push(ev);
        ultimoPorClave.set(clave, ev);
      }
    }
    return { aceptados, descartes };
  }

  /* ================= borrados ================= */

  /** Borra las vueltas de la tanda activa (deja los corredores). */
  async function borrarVueltas() {
    const idTanda = est.tandaActiva.id;
    const ids = todosLosEventos(idTanda).map(e => e.id);
    await DB.borrarVarios('eventos', ids);
    est.indices.set(idTanda, new Map());

    const idsPen = est.todasPendientes.filter(p => p.tanda === idTanda).map(p => p.id);
    await DB.borrarVarios('pendientes', idsPen);
    est.todasPendientes = est.todasPendientes.filter(p => p.tanda !== idTanda);

    // Las oleadas vuelven a estar sin salir.
    await guardarTanda({ oleadas: oleadas().map(o => Object.assign({}, o, { horaSalida: null })) });
    apuntarATanda(idTanda);
  }

  async function borrarTodo() {
    await DB.limpiar(['eventos', 'pendientes', 'corredores', 'tandas', 'respaldos']);
    est.tandas.clear();
    est.todos.clear();
    est.corredores.clear();
    est.porUid.clear();
    est.uidHistorial.clear();
    est.indices.clear();
    est.porDorsal = new Map();
    est.todasPendientes = [];
    est.pendientes = [];
    est.totalEventos = 0;
    est.ultimoLocal = null;
    est.tandaActiva = null;
    const t = await crearTanda({ nombre: 'Tanda 1' }, false);
    await activarTanda(t.id);
  }

  return {
    est, CONFIG_POR_DEFECTO, claveCorredor, nuevoIdTanda,
    cargar, reconstruirCorredores, reconstruirEventos, apuntarATanda,

    vueltas, ventanaMs, oleadas, oleadaDe, salidaDe,
    crearTanda, activarTanda, guardarTanda, guardarTandaPorId, borrarTanda,
    resumenTanda, tandaMasReciente,
    agregarOleada, actualizarOleada, darSalida, borrarOleada,

    registrar, deshacerUltimo, conflicto,
    marcarPendiente, quitarPendiente, asignarPendiente,
    guardarCorredor, borrarCorredor, vincularUid, historialDeChip,
    siguienteDorsal, fueraDeRango, categorias,

    vueltasDe, eventosDe, todosLosEventos, eventosDeTodasLasTandas,
    inicioReferencia, posiciones, resumen,

    guardarConfig, dedupGlobal, borrarVueltas, borrarTodo
  };
})();
