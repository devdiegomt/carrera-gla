/* ============================================================
   exportar.js — salida de datos (CSV / JSON), padrón de tanda e
   importación, y la unión de dispositivos con su deshacer.
   ============================================================ */
'use strict';

const Exportar = (() => {

  const est = Estado.est;

  function base(sufijo) {
    return Util.limpiarNombreArchivo(est.config.nombreCarrera) + '_' +
           Util.limpiarNombreArchivo(sufijo || est.tandaActiva.nombre) + '_' +
           Util.limpiarNombreArchivo(est.config.idDispositivo) + '_' +
           Util.selloArchivo(Date.now());
  }

  function tandasDe(alcance) {
    return alcance === 'todas'
      ? Array.from(est.tandas.values()).sort((a, b) => a.creadaEn - b.creadaEn)
      : [est.tandaActiva];
  }

  /* ---------------- JSON completo ---------------- */

  function objetoCompleto(alcance) {
    const tandas = tandasDe(alcance);
    const ids = new Set(tandas.map(t => t.id));
    const corredores = [];
    for (const c of est.todos.values()) if (ids.has(c.tanda)) corredores.push(c);
    corredores.sort((a, b) => a.tanda.localeCompare(b.tanda) || a.dorsal - b.dorsal);

    const eventos = [];
    for (const t of tandas) for (const ev of Estado.todosLosEventos(t.id)) eventos.push(ev);
    eventos.sort((a, b) => a.ts - b.ts);

    return {
      tipo: 'carrera-vueltas',
      esquema: DB.ESQUEMA,
      exportadoEn: Date.now(),
      exportadoEnLocal: Util.fecha(Date.now()) + ' ' + Util.hora(Date.now()),
      zonaHoraria: Util.ZONA,
      config: Object.assign({}, est.config),
      tandas: tandas.map(t => Object.assign({}, t)),
      corredores,
      eventos,
      pendientes: est.todasPendientes.filter(p => ids.has(p.tanda))
    };
  }

  function textoCompleto(alcance) { return JSON.stringify(objetoCompleto(alcance), null, 2); }

  /* ---------------- padrón ---------------- */

  /**
   * El padrón lleva la definición de la tanda (con su id), no solo los
   * corredores: así todos los organizadores inscriben sobre LA MISMA
   * tanda y la unión posterior no tiene que adivinar nada.
   */
  function objetoPadron(alcance) {
    const tandas = tandasDe(alcance);
    const ids = new Set(tandas.map(t => t.id));
    const corredores = [];
    for (const c of est.todos.values()) if (ids.has(c.tanda)) corredores.push(c);
    corredores.sort((a, b) => a.tanda.localeCompare(b.tanda) || a.dorsal - b.dorsal);

    return {
      tipo: 'padron-corredores',
      esquema: DB.ESQUEMA,
      exportadoEn: Date.now(),
      nombreCarrera: est.config.nombreCarrera,
      tandas: tandas.map(t => Object.assign({}, t)),
      corredores: corredores.map(c => ({
        tanda: c.tanda, dorsal: c.dorsal, nombre: c.nombre,
        categoria: c.categoria, uid: c.uid || null, oleada: c.oleada || 1
      }))
    };
  }

  function textoPadron(alcance) { return JSON.stringify(objetoPadron(alcance), null, 2); }

  /* ---------------- CSV ---------------- */

  function csvPosiciones(categoria, oleadaId, modo) {
    const filas = Estado.posiciones(categoria, oleadaId, modo);
    const total = Estado.vueltas();
    const out = [[
      'posicion', 'dorsal', 'nombre', 'categoria', 'oleada', 'vueltas', 'de_vueltas',
      'hora_salida', 'ultima_marca', 'estado', 'tiempo_neto', 'salida_estimada'
    ]];
    for (const f of filas) {
      out.push([
        f.posicion, f.dorsal, f.nombre, f.categoria, f.nombreOleada, f.vueltas, total,
        f.salida != null ? Util.hora(f.salida) : '',
        f.ultima ? Util.hora(f.ultima) : '',
        f.terminado ? 'Terminado' : 'En carrera',
        f.tiempo != null ? Util.duracion(f.tiempo) : '',
        f.salidaEstimada ? 'si' : 'no'
      ]);
    }
    return Util.csv(out);
  }

  function csvEventos(alcance) {
    const tandas = tandasDe(alcance);
    const out = [['tanda', 'nombre_tanda', 'id', 'dorsal', 'nombre', 'categoria', 'oleada',
                  'vuelta', 'hora_local', 'fecha_hora_iso', 'tiempo_neto', 'metodo', 'dispositivo']];
    for (const t of tandas) {
      const conteo = new Map();
      for (const ev of Estado.todosLosEventos(t.id)) {
        const n = (conteo.get(ev.dorsal) || 0) + 1;
        conteo.set(ev.dorsal, n);
        const c = est.todos.get(Estado.claveCorredor(t.id, ev.dorsal));
        const ol = c ? (t.oleadas || []).find(o => o.id === c.oleada) : null;
        const salida = ol && ol.horaSalida ? ol.horaSalida : null;
        out.push([
          t.id, t.nombre, ev.id, ev.dorsal,
          c ? c.nombre : '', c ? c.categoria : '', ol ? ol.nombre : '',
          n, Util.hora(ev.ts), new Date(ev.ts).toISOString(),
          salida != null ? Util.duracion(ev.ts - salida) : '',
          ev.metodo, ev.dispositivo || ''
        ]);
      }
    }
    return Util.csv(out);
  }

  /** Padrón en CSV, útil para imprimir la planilla de manillas. */
  function csvPadron(alcance) {
    const tandas = tandasDe(alcance);
    const ids = new Set(tandas.map(t => t.id));
    const out = [['tanda', 'nombre_tanda', 'dorsal', 'nombre', 'categoria', 'oleada', 'chip_uid']];
    const lista = [];
    for (const c of est.todos.values()) if (ids.has(c.tanda)) lista.push(c);
    lista.sort((a, b) => a.tanda.localeCompare(b.tanda) || a.dorsal - b.dorsal);
    for (const c of lista) {
      const t = est.tandas.get(c.tanda);
      const ol = t ? (t.oleadas || []).find(o => o.id === c.oleada) : null;
      out.push([c.tanda, t ? t.nombre : '', c.dorsal, c.nombre, c.categoria,
                ol ? ol.nombre : '', c.uid || '']);
    }
    return Util.csv(out);
  }

  function csvDescartes(descartes) {
    const out = [['tanda', 'dorsal', 'nombre', 'hora_conservada', 'dispositivo_conservado',
                  'hora_descartada', 'dispositivo_descartado', 'diferencia_seg']];
    for (const d of descartes) {
      const c = est.todos.get(Estado.claveCorredor(d.tanda, d.dorsal));
      out.push([
        d.tanda, d.dorsal, c ? c.nombre : '',
        Util.hora(d.horaConservada), d.dispositivoConservado,
        Util.hora(d.horaDescartada), d.dispositivoDescartado,
        d.diferenciaSeg
      ]);
    }
    return Util.csv(out);
  }

  /** Devuelve {nombre, contenido, mime} para el tipo pedido. */
  function paquete(tipo, opciones) {
    const o = opciones || {};
    const alcance = o.alcance || 'activa';
    const sufijo = alcance === 'todas' ? 'todas-las-tandas' : est.tandaActiva.nombre;
    if (tipo === 'pos-csv') {
      return { nombre: 'posiciones_' + base(sufijo) + '.csv',
               contenido: csvPosiciones(o.categoria, o.oleada, o.modo), mime: 'text/csv' };
    }
    if (tipo === 'ev-csv') {
      return { nombre: 'eventos_' + base(sufijo) + '.csv',
               contenido: csvEventos(alcance), mime: 'text/csv' };
    }
    if (tipo === 'padron-csv') {
      return { nombre: 'padron_' + base(sufijo) + '.csv',
               contenido: csvPadron(alcance), mime: 'text/csv' };
    }
    return { nombre: 'respaldo_' + base(sufijo) + '.json',
             contenido: textoCompleto(alcance), mime: 'application/json' };
  }

  function paquetePadron(alcance) {
    const sufijo = alcance === 'todas' ? 'todas-las-tandas' : est.tandaActiva.nombre;
    return {
      nombre: 'padron_' + base(sufijo) + '.json',
      contenido: textoPadron(alcance),
      mime: 'application/json'
    };
  }

  /* ---------------- lectura de archivos ---------------- */

  function normalizarCorredor(c, tandaPorDefecto) {
    const dorsal = Number(c.dorsal);
    if (!Number.isFinite(dorsal) || dorsal <= 0 || Math.floor(dorsal) !== dorsal) return null;
    return {
      tanda: String(c.tanda || tandaPorDefecto),
      dorsal,
      nombre: String(c.nombre || '').trim(),
      categoria: String(c.categoria || '').trim(),
      uid: c.uid ? String(c.uid) : null,
      oleada: Number(c.oleada) || 1
    };
  }

  function normalizarTandaImportada(t) {
    const out = {
      id: String(t.id || ''),
      nombre: String(t.nombre || t.id || 'Grupo'),
      vueltas: Number(t.vueltas) || 5,
      ventanaMinSeg: Number(t.ventanaMinSeg) || 60,
      estado: t.estado === 'cerrada' ? 'cerrada' : 'abierta',
      creadaEn: Number(t.creadaEn) || Date.now(),
      oleadas: Array.isArray(t.oleadas) && t.oleadas.length
        ? t.oleadas.map((o, i) => ({
            id: Number(o.id) || i + 1,
            nombre: String(o.nombre || 'Salida ' + (i + 1)),
            horaSalida: Number(o.horaSalida) || null
          }))
        : [{ id: 1, nombre: 'Salida 1', horaSalida: null }]
    };
    return out.id ? out : null;
  }

  /**
   * Lee un archivo (padrón o respaldo completo, v1 o v2) y devuelve
   * su contenido normalizado, sin aplicar nada.
   */
  function analizarArchivo(texto, nombreArchivo) {
    let datos;
    try { datos = JSON.parse(texto); }
    catch (e) { return { ok: false, archivo: nombreArchivo, mensaje: 'No es JSON válido' }; }

    if (!datos || typeof datos !== 'object') {
      return { ok: false, archivo: nombreArchivo, mensaje: 'El archivo está vacío' };
    }
    const esquema = Number(datos.esquema) || 1;
    if (esquema > DB.ESQUEMA) {
      return { ok: false, archivo: nombreArchivo,
               mensaje: 'Esquema v' + esquema + ': más nuevo que esta versión de la app (v' + DB.ESQUEMA + ')' };
    }

    const dispositivo = (datos.config && datos.config.idDispositivo) || 'DESCONOCIDO';

    // v1 no tiene tandas: todo lo suyo entra en una tanda sintética.
    let tandas = [];
    let tandaPorDefecto;
    if (Array.isArray(datos.tandas) && datos.tandas.length) {
      tandas = datos.tandas.map(normalizarTandaImportada).filter(Boolean);
      tandaPorDefecto = tandas[0] ? tandas[0].id : 'T-IMPORT';
    } else {
      tandaPorDefecto = 'T-1';
      tandas = [normalizarTandaImportada({
        id: tandaPorDefecto,
        nombre: (datos.config && datos.config.nombreCarrera) || 'Grupo importado',
        vueltas: (datos.config && datos.config.vueltas) || 5,
        ventanaMinSeg: (datos.config && datos.config.ventanaMinSeg) || 60
      })];
    }

    const corredores = Array.isArray(datos.corredores)
      ? datos.corredores.map(c => normalizarCorredor(c, tandaPorDefecto)).filter(Boolean)
      : [];

    const eventos = [];
    for (const ev of (Array.isArray(datos.eventos) ? datos.eventos : [])) {
      const dorsal = Number(ev.dorsal);
      const ts = Number(ev.ts);
      if (!Number.isFinite(dorsal) || dorsal <= 0 || !Number.isFinite(ts) || ts <= 0) continue;
      eventos.push({
        tanda: String(ev.tanda || tandaPorDefecto),
        dorsal, ts,
        metodo: ev.metodo || 'nfc',
        dispositivo: String(ev.dispositivo || dispositivo),
        origenId: ev.id
      });
    }

    return {
      ok: true,
      archivo: nombreArchivo,
      esquema,
      tipo: datos.tipo || (eventos.length ? 'carrera-vueltas' : 'padron-corredores'),
      dispositivo,
      puesto: (datos.config && datos.config.nombrePuesto) || '',
      tandas, corredores, eventos
    };
  }

  /* ---------------- mapeo de tandas ---------------- */

  /**
   * Para cada tanda que viene en los archivos decide a qué tanda local
   * corresponde: misma id, mismo nombre, o crear una nueva.
   */
  function proponerMapeo(archivos) {
    const vistas = new Map();
    for (const a of archivos) {
      if (!a.ok) continue;
      for (const t of a.tandas) if (!vistas.has(t.id)) vistas.set(t.id, t);
      for (const c of a.corredores) if (!vistas.has(c.tanda)) vistas.set(c.tanda, { id: c.tanda, nombre: c.tanda });
      for (const e of a.eventos) if (!vistas.has(e.tanda)) vistas.set(e.tanda, { id: e.tanda, nombre: e.tanda });
    }

    const porNombre = new Map();
    for (const t of est.tandas.values()) porNombre.set(t.nombre.toLowerCase(), t.id);

    const filas = [];
    for (const t of vistas.values()) {
      let destino, motivo;
      if (est.tandas.has(t.id)) {
        destino = t.id;
        motivo = 'misma tanda (' + t.id + ')';
      } else if (porNombre.has(String(t.nombre).toLowerCase())) {
        destino = porNombre.get(String(t.nombre).toLowerCase());
        motivo = 'mismo nombre que ' + destino;
      } else {
        destino = '__nueva__';
        motivo = 'no existe aquí';
      }
      filas.push({ origen: t.id, nombre: t.nombre, definicion: t, destino, motivo });
    }
    filas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    return filas;
  }

  /* ---------------- UNIR DISPOSITIVOS ---------------- */

  /**
   * Prepara la unión sin aplicarla: mezcla lo local con los archivos,
   * resuelve el mapeo de tandas, detecta conflictos de padrón y aplica
   * la deduplicación global.
   */
  function prepararUnion(archivos, mapeo) {
    // origen -> destino definitivo (creando ids para las nuevas)
    const destinoDe = new Map();
    const tandasNuevas = [];
    for (const m of mapeo) {
      if (m.destino === '__nueva__') {
        const id = est.tandas.has(m.origen) ? Estado.nuevoIdTanda() : m.origen;
        destinoDe.set(m.origen, id);
        tandasNuevas.push(Object.assign({}, m.definicion, { id }));
      } else {
        destinoDe.set(m.origen, m.destino);
      }
    }
    const mapear = id => destinoDe.get(id) || id;

    /* ---- corredores ---- */
    const corredores = new Map();   // idCompuesto -> corredor
    for (const c of est.todos.values()) corredores.set(c.id, Object.assign({}, c));

    const conflictos = [];
    const nuevos = [];
    const completados = [];

    for (const a of archivos) {
      if (!a.ok) continue;
      for (const c of a.corredores) {
        const idTanda = mapear(c.tanda);
        const clave = Estado.claveCorredor(idTanda, c.dorsal);
        const prev = corredores.get(clave);
        if (!prev) {
          corredores.set(clave, {
            id: clave, tanda: idTanda, dorsal: c.dorsal,
            nombre: c.nombre, categoria: c.categoria, uid: c.uid, oleada: c.oleada
          });
          nuevos.push({ tanda: idTanda, dorsal: c.dorsal, nombre: c.nombre, archivo: a.archivo });
          continue;
        }
        // Mismo dorsal con dos nombres distintos: eso lo decide una persona.
        if (prev.nombre && c.nombre && prev.nombre !== c.nombre) {
          conflictos.push({
            tipo: 'nombre', tanda: idTanda, dorsal: c.dorsal,
            actual: prev.nombre, entrante: c.nombre, archivo: a.archivo
          });
          continue;
        }
        const fusion = Object.assign({}, prev);
        let cambio = false;
        if (!fusion.nombre && c.nombre) { fusion.nombre = c.nombre; cambio = true; }
        if (!fusion.categoria && c.categoria) { fusion.categoria = c.categoria; cambio = true; }
        if (!fusion.uid && c.uid) { fusion.uid = c.uid; cambio = true; }
        if (cambio) {
          corredores.set(clave, fusion);
          completados.push({ tanda: idTanda, dorsal: c.dorsal });
        }
      }
    }

    // Un chip no puede quedar en dos dorsales de la misma tanda.
    const porTandaUid = new Map();
    const chipsEnConflicto = [];
    for (const c of Array.from(corredores.values()).sort((a, b) => a.dorsal - b.dorsal)) {
      if (!c.uid) continue;
      const clave = c.tanda + '|' + c.uid;
      if (porTandaUid.has(clave)) {
        chipsEnConflicto.push({
          tipo: 'chip', tanda: c.tanda, uid: c.uid,
          dorsalConservado: porTandaUid.get(clave), dorsalLiberado: c.dorsal
        });
        corredores.set(c.id, Object.assign({}, c, { uid: null }));
      } else {
        porTandaUid.set(clave, c.dorsal);
      }
    }

    /* ---- tandas resultantes ---- */
    const tandas = new Map();
    for (const t of est.tandas.values()) tandas.set(t.id, Object.assign({}, t));
    for (const t of tandasNuevas) tandas.set(t.id, Object.assign({}, t));
    for (const a of archivos) {
      if (!a.ok) continue;
      for (const t of a.tandas) {
        const id = mapear(t.id);
        const prev = tandas.get(id);
        if (!prev) { tandas.set(id, Object.assign({}, t, { id })); continue; }
        // Se completan las horas de salida que falten localmente.
        const oleadas = (prev.oleadas || []).map(o => {
          if (o.horaSalida) return o;
          const otra = (t.oleadas || []).find(x => x.id === o.id);
          return otra && otra.horaSalida ? Object.assign({}, o, { horaSalida: otra.horaSalida }) : o;
        });
        for (const o of (t.oleadas || [])) {
          if (!oleadas.some(x => x.id === o.id)) oleadas.push(Object.assign({}, o));
        }
        tandas.set(id, Object.assign({}, prev, { oleadas }));
      }
    }

    /* ---- eventos ---- */
    const crudos = [];
    const vistos = new Set();
    const porDispositivo = new Map();

    const agregar = ev => {
      const clave = ev.dispositivo + '#' + ev.tanda + '#' +
                    (ev.origenId != null ? ev.origenId : ev.ts + '#' + ev.dorsal);
      if (vistos.has(clave)) return;
      vistos.add(clave);
      crudos.push(ev);
      const r = porDispositivo.get(ev.dispositivo) || { leidos: 0, aceptados: 0, descartados: 0 };
      r.leidos++;
      porDispositivo.set(ev.dispositivo, r);
    };

    for (const ev of Estado.eventosDeTodasLasTandas()) {
      agregar({
        tanda: ev.tanda, dorsal: ev.dorsal, ts: ev.ts, metodo: ev.metodo,
        dispositivo: ev.dispositivo || est.config.idDispositivo, origenId: ev.id
      });
    }
    for (const a of archivos) {
      if (!a.ok) continue;
      for (const ev of a.eventos) agregar(Object.assign({}, ev, { tanda: mapear(ev.tanda) }));
    }

    const msPorTanda = new Map();
    for (const t of tandas.values()) msPorTanda.set(t.id, Math.max(1, Number(t.ventanaMinSeg) || 60) * 1000);

    const { aceptados, descartes } = Estado.dedupGlobal(crudos, msPorTanda, 60000);

    for (const ev of aceptados) {
      const r = porDispositivo.get(ev.dispositivo);
      if (r) r.aceptados++;
    }
    for (const d of descartes) {
      const r = porDispositivo.get(d.dispositivoDescartado);
      if (r) r.descartados++;
    }

    const huerfanos = new Set();
    for (const ev of aceptados) {
      if (!corredores.has(Estado.claveCorredor(ev.tanda, ev.dorsal))) {
        huerfanos.add(ev.tanda + ' · ' + ev.dorsal);
      }
    }

    const porTanda = [];
    for (const t of tandas.values()) {
      porTanda.push({
        id: t.id, nombre: t.nombre,
        corredores: Array.from(corredores.values()).filter(c => c.tanda === t.id).length,
        eventos: aceptados.filter(e => e.tanda === t.id).length,
        descartes: descartes.filter(d => d.tanda === t.id).length
      });
    }
    porTanda.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    return {
      aceptados, descartes,
      tandas: Array.from(tandas.values()),
      corredores: Array.from(corredores.values()).sort((a, b) =>
        a.tanda.localeCompare(b.tanda) || a.dorsal - b.dorsal),
      conflictos: conflictos.concat(chipsEnConflicto),
      nuevos, completados,
      porDispositivo: Array.from(porDispositivo.entries())
        .map(([dispositivo, r]) => Object.assign({ dispositivo }, r))
        .sort((a, b) => a.dispositivo.localeCompare(b.dispositivo)),
      porTanda,
      huerfanos: Array.from(huerfanos).sort(),
      totalLeidos: crudos.length,
      tandasNuevas: tandasNuevas.map(t => t.id)
    };
  }

  async function aplicarUnion(plan) {
    const respaldo = {
      id: 'union',
      creadoEn: Date.now(),
      tandas: Array.from(est.tandas.values()),
      corredores: Array.from(est.todos.values()),
      eventos: Estado.eventosDeTodasLasTandas(),
      config: Object.assign({}, est.config),
      descartes: plan.descartes
    };
    await DB.poner('respaldos', respaldo);

    const eventosFinales = plan.aceptados.map((ev, i) => ({
      id: i + 1,
      tanda: ev.tanda,
      dorsal: ev.dorsal,
      ts: ev.ts,
      metodo: ev.metodo || 'nfc',
      dispositivo: ev.dispositivo || '—'
    }));

    await DB.reemplazar('tandas', plan.tandas);
    await DB.reemplazar('corredores', plan.corredores);
    await DB.reemplazar('eventos', eventosFinales);

    est.tandas.clear();
    for (const t of plan.tandas) est.tandas.set(t.id, t);
    Estado.reconstruirCorredores(plan.corredores);
    Estado.reconstruirEventos(eventosFinales);
    if (!est.tandas.has(est.config.tandaActiva)) {
      await Estado.activarTanda(Estado.tandaMasReciente().id);
    } else {
      Estado.apuntarATanda(est.config.tandaActiva);
    }
    return eventosFinales.length;
  }

  async function hayUnionPrevia() {
    return !!(await DB.obtener('respaldos', 'union'));
  }

  async function deshacerUnion() {
    const r = await DB.obtener('respaldos', 'union');
    if (!r) return false;
    await DB.reemplazar('tandas', r.tandas || []);
    await DB.reemplazar('corredores', r.corredores || []);
    await DB.reemplazar('eventos', r.eventos || []);
    est.tandas.clear();
    for (const t of (r.tandas || [])) est.tandas.set(t.id, t);
    Estado.reconstruirCorredores(r.corredores || []);
    Estado.reconstruirEventos(r.eventos || []);
    if (r.config && est.tandas.has(r.config.tandaActiva)) {
      await Estado.activarTanda(r.config.tandaActiva);
    } else if (est.tandas.size) {
      await Estado.activarTanda(Estado.tandaMasReciente().id);
    }
    await DB.borrar('respaldos', 'union');
    return true;
  }

  /* ---------------- importar padrón ---------------- */

  /**
   * Analiza un padrón y lo compara con lo que hay aquí, sin aplicarlo.
   * Reutiliza el motor de unión para que el mapeo de tandas y la
   * detección de conflictos sean exactamente los mismos.
   */
  function analizarPadron(texto, nombreArchivo) {
    const a = analizarArchivo(texto, nombreArchivo || 'padrón');
    if (!a.ok) return { ok: false, mensaje: a.mensaje };
    if (!a.corredores.length) return { ok: false, mensaje: 'El archivo no contiene corredores.' };
    return { ok: true, archivo: a, mapeo: proponerMapeo([a]) };
  }

  /**
   * modo 'fusionar'   — conserva lo local y completa lo que falte.
   * modo 'reemplazar' — deja solo los corredores del archivo en las
   *                     tandas que trae (no toca las demás tandas).
   */
  async function aplicarPadron(analisis, mapeo, modo) {
    const a = analisis.archivo;
    const destinoDe = new Map();
    const tandasNuevas = [];
    for (const m of mapeo) {
      if (m.destino === '__nueva__') {
        const id = est.tandas.has(m.origen) ? Estado.nuevoIdTanda() : m.origen;
        destinoDe.set(m.origen, id);
        tandasNuevas.push(Object.assign({}, m.definicion, { id }));
      } else {
        destinoDe.set(m.origen, m.destino);
      }
    }
    const mapear = id => destinoDe.get(id) || id;

    for (const t of tandasNuevas) {
      await DB.poner('tandas', t);
      est.tandas.set(t.id, t);
    }
    // Las tandas existentes reciben las oleadas que no tengan.
    for (const t of a.tandas) {
      const id = mapear(t.id);
      const prev = est.tandas.get(id);
      if (!prev || tandasNuevas.some(x => x.id === id)) continue;
      const oleadas = (prev.oleadas || []).slice();
      for (const o of (t.oleadas || [])) {
        if (!oleadas.some(x => x.id === o.id)) oleadas.push(Object.assign({}, o));
      }
      await Estado.guardarTandaPorId(id, { oleadas });
    }

    const tandasTocadas = new Set(a.corredores.map(c => mapear(c.tanda)));
    const mapa = new Map();
    for (const c of est.todos.values()) {
      if (modo === 'reemplazar' && tandasTocadas.has(c.tanda)) continue;
      mapa.set(c.id, Object.assign({}, c));
    }
    for (const c of a.corredores) {
      const idTanda = mapear(c.tanda);
      const clave = Estado.claveCorredor(idTanda, c.dorsal);
      const prev = mapa.get(clave);
      mapa.set(clave, {
        id: clave, tanda: idTanda, dorsal: c.dorsal,
        nombre: c.nombre || (prev ? prev.nombre : ''),
        categoria: c.categoria || (prev ? prev.categoria : ''),
        uid: c.uid || (prev ? prev.uid : null),
        oleada: c.oleada || (prev ? prev.oleada : 1)
      });
    }

    const finales = Array.from(mapa.values());
    // Un chip no puede quedar en dos dorsales de la misma tanda.
    const vistos = new Map();
    for (const c of finales.sort((x, y) => x.dorsal - y.dorsal)) {
      if (!c.uid) continue;
      const k = c.tanda + '|' + c.uid;
      if (vistos.has(k)) c.uid = null; else vistos.set(k, c.dorsal);
    }

    await DB.reemplazar('corredores', finales);
    Estado.reconstruirCorredores(finales);
    Estado.apuntarATanda(est.config.tandaActiva);
    return { total: finales.length, tandas: Array.from(tandasTocadas) };
  }

  return {
    objetoCompleto, textoCompleto, objetoPadron, textoPadron,
    csvPosiciones, csvEventos, csvPadron, csvDescartes,
    paquete, paquetePadron,
    analizarArchivo, proponerMapeo,
    prepararUnion, aplicarUnion, hayUnionPrevia, deshacerUnion,
    analizarPadron, aplicarPadron
  };
})();
