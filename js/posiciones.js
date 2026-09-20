/* ============================================================
   posiciones.js — tabla de posiciones, contadores y exportación.
   ============================================================ */
'use strict';

const Posiciones = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let categoria = '';
  let oleadaId = 0;
  let modo = 'neto';

  function pintarContadores() {
    const r = Estado.resumen();
    $('#cnt-inscritos').textContent = String(r.inscritos);
    $('#cnt-vueltas').textContent = String(r.vueltas);
    $('#cnt-terminados').textContent = String(r.terminados);
  }

  function pintarFiltros() {
    const selCat = $('#filtro-categoria');
    const cats = Estado.categorias();
    selCat.innerHTML = '';
    selCat.append(Util.el('option', { value: '', texto: 'Todas' }));
    for (const c of cats) selCat.append(Util.el('option', { value: c, texto: c }));
    selCat.value = cats.includes(categoria) ? categoria : '';
    categoria = selCat.value;

    const selOl = $('#filtro-oleada');
    const oleadas = Estado.oleadas();
    selOl.innerHTML = '';
    selOl.append(Util.el('option', { value: '', texto: 'Todas' }));
    for (const o of oleadas) selOl.append(Util.el('option', { value: String(o.id), texto: o.nombre }));
    selOl.value = oleadas.some(o => o.id === oleadaId) ? String(oleadaId) : '';
    oleadaId = Number(selOl.value) || 0;

    $('#sel-orden').value = modo;
  }

  function pintarAviso() {
    const caja = $('#aviso-posiciones');
    const oleadas = Estado.oleadas();
    const sinSalida = oleadas.filter(o => !o.horaSalida);

    if (!est.totalEventos) { caja.hidden = true; return; }

    if (sinSalida.length && oleadas.length > 1) {
      caja.hidden = false;
      caja.textContent = 'Sin hora de salida en: ' + sinSalida.map(o => o.nombre).join(', ') +
        '. Para esas oleadas el tiempo se mide desde la primera marca de la tanda, ' +
        'así que no es comparable. Márcalas en Carrera → Salidas (puedes corregir la hora a mano).';
    } else if (sinSalida.length) {
      caja.hidden = false;
      caja.textContent = 'Esta tanda no tiene hora de salida registrada: el tiempo se mide ' +
        'desde la primera marca. Puedes fijarla en Carrera → Salidas → Corregir.';
    } else {
      caja.hidden = true;
    }
  }

  function pintarTabla() {
    const caja = $('#tabla-posiciones');
    const total = Estado.vueltas();
    const filas = Estado.posiciones(categoria, oleadaId, modo);
    const oleadas = Estado.oleadas();
    const variasOleadas = oleadas.length > 1;
    caja.innerHTML = '';

    if (!filas.length) {
      caja.append(Util.el('div', { clase: 'item-vacio', texto: 'No hay corredores con ese filtro.' }));
      return;
    }

    const tabla = Util.el('table');
    const cabecera = [
      Util.el('th', { clase: 'num', texto: '#' }),
      Util.el('th', { clase: 'num', texto: 'Dorsal' }),
      Util.el('th', { texto: 'Nombre' }),
      Util.el('th', { texto: 'Categoría' })
    ];
    if (variasOleadas) cabecera.push(Util.el('th', { texto: 'Oleada' }));
    cabecera.push(
      Util.el('th', { clase: 'num', texto: 'Vueltas' }),
      Util.el('th', { texto: 'Última' }),
      Util.el('th', { texto: modo === 'neto' ? 'Tiempo neto' : 'Tiempo' }),
      Util.el('th', { texto: 'Estado' })
    );
    tabla.append(Util.el('tr', {}, cabecera));

    const cuerpo = document.createDocumentFragment();
    for (const f of filas) {
      const celdas = [
        Util.el('td', { clase: 'num pos', texto: String(f.posicion) }),
        Util.el('td', { clase: 'num', texto: String(f.dorsal) }),
        Util.el('td', { texto: f.nombre || '—' }),
        Util.el('td', { texto: f.categoria || '—' })
      ];
      if (variasOleadas) celdas.push(Util.el('td', { texto: f.nombreOleada || '—' }));
      celdas.push(
        Util.el('td', { clase: 'num', texto: f.vueltas + ' / ' + total }),
        Util.el('td', { texto: f.ultima ? Util.hora(f.ultima) : '—' }),
        Util.el('td', {
          texto: f.tiempo != null
            ? Util.duracion(f.tiempo) + (f.salidaEstimada ? ' *' : '')
            : '—'
        }),
        Util.el('td', { texto: f.terminado ? 'Terminado' : 'En carrera' })
      );
      cuerpo.append(Util.el('tr', { clase: f.terminado ? 'terminado' : '' }, celdas));
    }
    tabla.append(cuerpo);
    caja.append(tabla);

    if (filas.some(f => f.salidaEstimada)) {
      const t0 = Estado.inicioReferencia();
      caja.append(Util.el('p', {
        clase: 'nota',
        texto: '* Sin hora de salida propia: el tiempo se mide desde la primera marca de la tanda' +
               (t0 != null ? ' (' + Util.hora(t0) + ')' : '') + '.'
      }));
    }
  }

  function paqueteActual() {
    return Exportar.paquete($('#sel-exportar').value, {
      alcance: $('#sel-alcance').value,
      categoria, oleada: oleadaId, modo
    });
  }

  function iniciar() {
    $('#filtro-categoria').addEventListener('change', e => { categoria = e.target.value; pintarTabla(); });
    $('#filtro-oleada').addEventListener('change', e => { oleadaId = Number(e.target.value) || 0; pintarTabla(); });
    $('#sel-orden').addEventListener('change', e => { modo = e.target.value; pintarTabla(); });
    $('#btn-refrescar-pos').addEventListener('click', () => { refrescar(); Util.aviso('Tabla actualizada', 'ok'); });

    $('#btn-exp-descargar').addEventListener('click', () => {
      const p = paqueteActual();
      Util.descargar(p.nombre, p.contenido, p.mime);
    });
    $('#btn-exp-compartir').addEventListener('click', () => {
      const p = paqueteActual();
      Util.compartir(p.nombre, p.contenido, p.mime);
    });
    $('#btn-exp-copiar').addEventListener('click', () => {
      const p = paqueteActual();
      Util.copiar(p.contenido);
    });

    refrescar();
  }

  function refrescar() {
    pintarContadores();
    pintarFiltros();
    pintarAviso();
    pintarTabla();
  }

  return { iniciar, refrescar };
})();
