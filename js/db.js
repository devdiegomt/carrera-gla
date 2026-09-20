/* ============================================================
   db.js — IndexedDB. Una transacción por escritura: nada se
   pierde si el navegador se cierra a mitad de la carrera.

   Esquema v2: los datos cuelgan de una TANDA. Dorsales y chips
   se reutilizan entre tandas sin mezclarse.
   ============================================================ */
'use strict';

const DB = (() => {

  const NOMBRE = 'carrera-vueltas';
  const VERSION_IDB = 2;   // versión del almacén IndexedDB
  const ESQUEMA = 2;       // versión del esquema de datos (viaja en cada export)

  let conexion = null;

  function crearEstructura(db) {
    if (!db.objectStoreNames.contains('config')) {
      db.createObjectStore('config', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('tandas')) {
      db.createObjectStore('tandas', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('corredores')) {
      const s = db.createObjectStore('corredores', { keyPath: 'id' });
      s.createIndex('tanda', 'tanda', { unique: false });
      s.createIndex('uid', 'uid', { unique: false });
    }
    if (!db.objectStoreNames.contains('eventos')) {
      const s = db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true });
      s.createIndex('tanda', 'tanda', { unique: false });
      s.createIndex('ts', 'ts', { unique: false });
    }
    if (!db.objectStoreNames.contains('pendientes')) {
      db.createObjectStore('pendientes', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('respaldos')) {
      db.createObjectStore('respaldos', { keyPath: 'id' });
    }
  }

  /**
   * v1 -> v2. El almacén de corredores cambia de clave (dorsal -> id
   * compuesto), así que hay que releerlo, recrearlo y reescribirlo.
   * Todo lo existente se asigna a la tanda 'T-1'.
   */
  function migrar1a2(db, tx) {
    const TANDA = 'T-1';

    const sCorr = tx.objectStore('corredores');
    const leerCorr = sCorr.getAll();
    leerCorr.onsuccess = () => {
      const viejos = leerCorr.result || [];
      db.deleteObjectStore('corredores');
      const nuevo = db.createObjectStore('corredores', { keyPath: 'id' });
      nuevo.createIndex('tanda', 'tanda', { unique: false });
      nuevo.createIndex('uid', 'uid', { unique: false });
      for (const c of viejos) {
        nuevo.put({
          id: TANDA + '#' + c.dorsal,
          tanda: TANDA,
          dorsal: c.dorsal,
          nombre: c.nombre || '',
          categoria: c.categoria || '',
          uid: c.uid || null,
          oleada: 1
        });
      }

      const sEv = tx.objectStore('eventos');
      if (!sEv.indexNames.contains('tanda')) sEv.createIndex('tanda', 'tanda', { unique: false });
      const leerEv = sEv.getAll();
      leerEv.onsuccess = () => {
        for (const e of leerEv.result || []) {
          if (!e.tanda) sEv.put(Object.assign({}, e, { tanda: TANDA }));
        }
        const sPen = tx.objectStore('pendientes');
        const leerPen = sPen.getAll();
        leerPen.onsuccess = () => {
          for (const p of leerPen.result || []) {
            if (!p.tanda) sPen.put(Object.assign({}, p, { tanda: TANDA }));
          }
        };
      };
    };
  }

  function abrir() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((resolver, rechazar) => {
      let sol;
      try {
        sol = indexedDB.open(NOMBRE, VERSION_IDB);
      } catch (e) {
        rechazar(new Error('Este navegador bloquea el almacenamiento local: ' + e.message));
        return;
      }
      sol.onupgradeneeded = ev => {
        const db = sol.result;
        const tx = sol.transaction;
        if (ev.oldVersion >= 1 && ev.oldVersion < 2) {
          crearEstructura(db);      // crea 'tandas' si falta
          migrar1a2(db, tx);
        } else {
          crearEstructura(db);
        }
      };
      sol.onsuccess = () => {
        conexion = sol.result;
        conexion.onversionchange = () => { conexion.close(); conexion = null; };
        resolver(conexion);
      };
      sol.onerror = () => rechazar(sol.error || new Error('No se pudo abrir la base de datos'));
      sol.onblocked = () => rechazar(new Error('Hay otra pestaña de la app abierta. Ciérrala y recarga.'));
    });
  }

  function tx(almacenes, modo) {
    return abrir().then(db => db.transaction(almacenes, modo));
  }

  function esperar(sol) {
    return new Promise((resolver, rechazar) => {
      sol.onsuccess = () => resolver(sol.result);
      sol.onerror = () => rechazar(sol.error);
    });
  }

  function confirmarTx(t) {
    return new Promise((resolver, rechazar) => {
      t.oncomplete = () => resolver();
      t.onerror = () => rechazar(t.error);
      t.onabort = () => rechazar(t.error || new Error('Transacción cancelada'));
    });
  }

  async function todo(almacen) {
    const t = await tx([almacen], 'readonly');
    return esperar(t.objectStore(almacen).getAll());
  }

  async function obtener(almacen, clave) {
    const t = await tx([almacen], 'readonly');
    return esperar(t.objectStore(almacen).get(clave));
  }

  /** Lee por índice (por ejemplo, todos los eventos de una tanda). */
  async function porIndice(almacen, indice, valor) {
    const t = await tx([almacen], 'readonly');
    return esperar(t.objectStore(almacen).index(indice).getAll(valor));
  }

  /** Escribe y espera a que la transacción se confirme en disco. */
  async function poner(almacen, valor) {
    const t = await tx([almacen], 'readwrite');
    const sol = t.objectStore(almacen).put(valor);
    const clave = await esperar(sol);
    await confirmarTx(t);
    return clave;
  }

  async function ponerVarios(almacen, valores) {
    if (!valores.length) return;
    const t = await tx([almacen], 'readwrite');
    const s = t.objectStore(almacen);
    for (const v of valores) s.put(v);
    await confirmarTx(t);
  }

  async function borrar(almacen, clave) {
    const t = await tx([almacen], 'readwrite');
    t.objectStore(almacen).delete(clave);
    await confirmarTx(t);
  }

  async function borrarVarios(almacen, claves) {
    if (!claves.length) return;
    const t = await tx([almacen], 'readwrite');
    const s = t.objectStore(almacen);
    for (const c of claves) s.delete(c);
    await confirmarTx(t);
  }

  async function limpiar(almacenes) {
    const lista = [].concat(almacenes);
    const t = await tx(lista, 'readwrite');
    for (const a of lista) t.objectStore(a).clear();
    await confirmarTx(t);
  }

  async function reemplazar(almacen, valores) {
    const t = await tx([almacen], 'readwrite');
    const s = t.objectStore(almacen);
    s.clear();
    for (const v of valores) s.put(v);
    await confirmarTx(t);
  }

  async function agregarEvento(evento) {
    const t = await tx(['eventos'], 'readwrite');
    const id = await esperar(t.objectStore('eventos').add(evento));
    await confirmarTx(t);
    return Object.assign({}, evento, { id });
  }

  async function agregarPendiente(pendiente) {
    const t = await tx(['pendientes'], 'readwrite');
    const id = await esperar(t.objectStore('pendientes').add(pendiente));
    await confirmarTx(t);
    return Object.assign({}, pendiente, { id });
  }

  async function pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      }
    } catch (_) { /* ignorar */ }
    return false;
  }

  return {
    ESQUEMA, VERSION_IDB, NOMBRE,
    abrir, todo, obtener, porIndice, poner, ponerVarios,
    borrar, borrarVarios, limpiar, reemplazar,
    agregarEvento, agregarPendiente, pedirPersistencia
  };
})();
