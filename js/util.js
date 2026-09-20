/* ============================================================
   util.js — formato de hora (Bogotá, 24 h), avisos, modales,
   sonido, vibración, descarga, compartir y portapapeles.
   ============================================================ */
'use strict';

const Util = (() => {

  const ZONA = 'America/Bogota';

  const fHora = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const fHoraMin = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, hour12: false, hour: '2-digit', minute: '2-digit'
  });
  const fFecha = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  const fArchivo = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  /** HH:MM:SS en hora de Bogotá. */
  function hora(ts) { return fHora.format(new Date(ts)); }
  function horaCorta(ts) { return fHoraMin.format(new Date(ts)); }
  function fecha(ts) { return fFecha.format(new Date(ts)); }

  /** Marca legible para nombres de archivo: 2026-09-19_1435 */
  function selloArchivo(ts) {
    const p = {};
    for (const x of fArchivo.formatToParts(new Date(ts))) p[x.type] = x.value;
    return `${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}`;
  }

  /** Duración en h:mm:ss o mm:ss. */
  function duracion(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return '—';
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const dd = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`;
  }

  function limpiarNombreArchivo(s) {
    return String(s || 'carrera')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'carrera';
  }

  /* ---------------- DOM ---------------- */

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function el(tag, props = {}, hijos = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'clase') n.className = v;
      else if (k === 'texto') n.textContent = v;
      else if (k === 'datos') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const h of [].concat(hijos)) if (h != null) n.append(h);
    return n;
  }

  /* ---------------- avisos ---------------- */

  function aviso(mensaje, tipo = '', ms = 3200) {
    const caja = $('#avisos');
    if (!caja) return;
    const n = el('div', { clase: 'aviso ' + tipo, texto: mensaje });
    caja.append(n);
    setTimeout(() => n.remove(), ms);
  }

  /* ---------------- modal ---------------- */

  let cerrarModalActual = null;

  /**
   * Modal genérico. botones: [{texto, clase, valor}]
   * Devuelve una promesa con el valor del botón pulsado (null si se cancela).
   */
  function modal(titulo, cuerpo, botones) {
    return new Promise(resolver => {
      const caja = $('#modal');
      $('#modal-titulo').textContent = titulo;
      const cuerpoN = $('#modal-cuerpo');
      cuerpoN.innerHTML = '';
      if (typeof cuerpo === 'string') {
        for (const linea of cuerpo.split('\n')) cuerpoN.append(el('p', { texto: linea }));
      } else if (cuerpo) {
        cuerpoN.append(cuerpo);
      }
      const botonesN = $('#modal-botones');
      botonesN.innerHTML = '';

      const terminar = valor => {
        caja.hidden = true;
        cerrarModalActual = null;
        document.removeEventListener('keydown', alPulsar);
        resolver(valor);
      };
      cerrarModalActual = () => terminar(null);

      for (const b of botones) {
        botonesN.append(el('button', {
          clase: 'btn ' + (b.clase || 'btn-secundario'),
          type: 'button',
          texto: b.texto,
          onclick: () => terminar(b.valor)
        }));
      }

      const alPulsar = ev => { if (ev.key === 'Escape') terminar(null); };
      document.addEventListener('keydown', alPulsar);

      caja.hidden = false;
      const primero = botonesN.querySelector('button');
      if (primero) primero.focus();
    });
  }

  // Tocar fuera de la caja cancela el modal.
  document.addEventListener('DOMContentLoaded', () => {
    const caja = $('#modal');
    if (!caja) return;
    caja.addEventListener('click', ev => {
      if (ev.target === caja && cerrarModalActual) cerrarModalActual();
    });
  });

  /** Confirmación explícita para acciones destructivas. */
  async function confirmar(titulo, mensaje, textoConfirmar = 'Sí, continuar', peligro = true) {
    const r = await modal(titulo, mensaje, [
      { texto: textoConfirmar, clase: peligro ? 'btn-peligro' : 'btn-primario', valor: true },
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null }
    ]);
    return r === true;
  }

  function alerta(titulo, mensaje) {
    return modal(titulo, mensaje, [{ texto: 'Entendido', clase: 'btn-primario', valor: true }]);
  }

  /* ---------------- sonido y vibración ---------------- */

  let ctxAudio = null;
  let audioListo = false;

  function prepararAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxAudio) ctxAudio = new AC();
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
      audioListo = true;
    } catch (_) { /* sin audio, seguimos con vibración */ }
  }

  /** notas: [[frecuencia, duraciónMs], ...] */
  function tono(notas, volumen = 0.22) {
    if (!audioListo || !ctxAudio) return;
    try {
      let t = ctxAudio.currentTime;
      for (const [frec, durMs] of notas) {
        const dur = durMs / 1000;
        const osc = ctxAudio.createOscillator();
        const gan = ctxAudio.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(frec, t);
        gan.gain.setValueAtTime(0, t);
        gan.gain.linearRampToValueAtTime(volumen, t + 0.008);
        gan.gain.setValueAtTime(volumen, t + dur - 0.02);
        gan.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(gan).connect(ctxAudio.destination);
        osc.start(t);
        osc.stop(t + dur);
        t += dur + 0.02;
      }
    } catch (_) { /* ignorar */ }
  }

  function vibrar(patron) {
    try { if (navigator.vibrate) navigator.vibrate(patron); } catch (_) { /* ignorar */ }
  }

  /** Retroalimentación distinta por tipo de lectura. */
  function retro(tipo) {
    if (tipo === 'ok') {            // vuelta válida: pitido corto agudo
      tono([[1320, 90]]);
      vibrar(60);
    } else if (tipo === 'final') {  // vuelta final: fanfarria ascendente
      tono([[880, 110], [1175, 110], [1568, 220]]);
      vibrar([90, 60, 90, 60, 240]);
    } else if (tipo === 'error') {  // rechazada: dos tonos graves
      tono([[196, 150], [147, 260]], 0.3);
      vibrar([220, 90, 220]);
    } else if (tipo === 'neutro') {
      tono([[660, 70]], 0.15);
      vibrar(30);
    }
  }

  /* ---------------- CSV ---------------- */

  function csvCampo(v) {
    const s = v == null ? '' : String(v);
    return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Genera CSV con BOM para que Excel respete los acentos. */
  function csv(filas) {
    return '﻿' + filas.map(f => f.map(csvCampo).join(',')).join('\r\n') + '\r\n';
  }

  /* ---------------- salida de datos ---------------- */

  function descargar(nombre, contenido, mime) {
    try {
      const blob = new Blob([contenido], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: nombre });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      aviso('Archivo descargado: ' + nombre, 'ok');
      return true;
    } catch (e) {
      aviso('No se pudo descargar: ' + e.message, 'error');
      return false;
    }
  }

  async function compartir(nombre, contenido, mime) {
    const blob = new Blob([contenido], { type: mime + ';charset=utf-8' });
    const archivo = new File([blob], nombre, { type: mime });
    try {
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
        return true;
      }
      if (navigator.share) {
        await navigator.share({ title: nombre, text: contenido.slice(0, 4000) });
        return true;
      }
      aviso('Este navegador no permite compartir. Usa Descargar.', 'error');
      return false;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      aviso('No se pudo compartir: ' + e.message, 'error');
      return false;
    }
  }

  async function copiar(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
      } else {
        const ta = el('textarea', {});
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      aviso('Copiado al portapapeles', 'ok');
      return true;
    } catch (e) {
      aviso('No se pudo copiar: ' + e.message, 'error');
      return false;
    }
  }

  function leerArchivo(archivo) {
    return new Promise((resolver, rechazar) => {
      const fr = new FileReader();
      fr.onload = () => resolver(String(fr.result));
      fr.onerror = () => rechazar(new Error('No se pudo leer ' + archivo.name));
      fr.readAsText(archivo, 'utf-8');
    });
  }

  /* ---------------- varios ---------------- */

  function esWebView() {
    const ua = navigator.userAgent || '';
    if (/\bwv\b/.test(ua)) return true;                        // Android WebView
    if (/(FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger)/i.test(ua)) return true;
    if (/(GSA|WhatsApp)/i.test(ua) && /Android/i.test(ua)) return true;
    // Chrome real en Android siempre expone "Chrome/" sin el token wv
    if (/Android/i.test(ua) && /Version\/\d+\.\d+/.test(ua) && /Chrome/i.test(ua)) return true;
    return false;
  }

  function idAleatorio(prefijo) {
    const n = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
    return prefijo + '-' + n;
  }

  return {
    ZONA, hora, horaCorta, fecha, selloArchivo, duracion, limpiarNombreArchivo,
    $, $$, el, aviso, modal, confirmar, alerta,
    prepararAudio, retro, vibrar,
    csv, csvCampo, descargar, compartir, copiar, leerArchivo,
    esWebView, idAleatorio
  };
})();
