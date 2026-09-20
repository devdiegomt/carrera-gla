/* ============================================================
   nfc.js — Web NFC. scan() debe llamarse dentro de un gesto del
   usuario; por eso iniciar() se invoca siempre desde un click.
   ============================================================ */
'use strict';

const NFC = (() => {

  let lector = null;
  let control = null;      // AbortController del scan en curso
  let activo = false;

  function disponible() { return typeof window.NDEFReader === 'function'; }

  /** Normaliza el UID para que sea idéntico en todos los celulares. */
  function normalizarUid(serial) {
    if (!serial) return null;
    const hex = String(serial).toUpperCase().replace(/[^0-9A-F]/g, '');
    if (!hex) return null;
    return hex.match(/.{1,2}/g).join(':');
  }

  /** Busca un número de dorsal dentro de los registros NDEF del chip. */
  function dorsalDesdeMensaje(mensaje) {
    if (!mensaje || !mensaje.records) return null;
    for (const reg of mensaje.records) {
      try {
        if (reg.recordType !== 'text' && reg.recordType !== 'url') continue;
        const dec = new TextDecoder(reg.encoding || 'utf-8');
        const txt = dec.decode(reg.data);
        const m = txt.match(/(\d{1,6})\s*$/);
        if (m) return Number(m[1]);
      } catch (_) { /* registro ilegible, seguimos */ }
    }
    return null;
  }

  /** Traduce los errores de la API a instrucciones accionables en español. */
  function mensajeError(e) {
    const nombre = e && e.name ? e.name : '';
    switch (nombre) {
      case 'NotAllowedError':
        return 'Permiso de NFC denegado. Abre los ajustes del sitio en Chrome ' +
               '(candado junto a la dirección → Permisos → NFC) y permítelo. ' +
               'Después vuelve a pulsar «Activar lectura NFC».';
      case 'NotSupportedError':
        return 'Este celular o navegador no tiene Web NFC. Usa Chrome para Android ' +
               '124 o superior en un equipo con NFC. Mientras tanto, registra con el ' +
               'teclado de respaldo.';
      case 'NotReadableError':
        return 'No se pudo acceder al lector NFC. Activa el NFC en los ajustes del ' +
               'celular (Ajustes → Conexiones → NFC), cierra otras apps que lo usen ' +
               '(pagos, transporte) y vuelve a intentar.';
      case 'AbortError':
        return 'La lectura se detuvo.';
      case 'InvalidStateError':
        return 'Ya hay una lectura activa. Desactívala y vuelve a activarla.';
      case 'SecurityError':
        return 'El NFC solo funciona en una página segura (https). Abre la app desde ' +
               'su dirección https, no desde un archivo local.';
      default:
        return 'Error de NFC: ' + ((e && e.message) || nombre || 'desconocido') +
               '. Usa el teclado de respaldo mientras lo resuelves.';
    }
  }

  /**
   * Arranca el escaneo. Debe llamarse dentro de un gesto del usuario.
   * alLeer({uid, dorsalEnChip, ts, evento})
   */
  async function iniciar(alLeer, alError) {
    if (activo) return true;
    if (!window.isSecureContext) {
      alError({ name: 'SecurityError' }, mensajeError({ name: 'SecurityError' }));
      return false;
    }
    if (!disponible()) {
      alError({ name: 'NotSupportedError' }, mensajeError({ name: 'NotSupportedError' }));
      return false;
    }
    try {
      lector = new NDEFReader();
      control = new AbortController();

      lector.addEventListener('reading', ev => {
        alLeer({
          uid: normalizarUid(ev.serialNumber),
          dorsalEnChip: dorsalDesdeMensaje(ev.message),
          ts: Date.now()
        });
      });

      lector.addEventListener('readingerror', () => {
        alError({ name: 'ReadingError' },
          'Chip ilegible. Acerca la manilla al centro de la parte trasera del ' +
          'celular y mantenla un segundo.');
      });

      await lector.scan({ signal: control.signal });
      activo = true;
      return true;
    } catch (e) {
      detener();
      alError(e, mensajeError(e));
      return false;
    }
  }

  function detener() {
    try { if (control) control.abort(); } catch (_) { /* ignorar */ }
    control = null;
    lector = null;
    activo = false;
  }

  function estaActivo() { return activo; }

  /** Estado del permiso de NFC, para el diagnóstico. */
  async function estadoPermiso() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return 'desconocido';
      const p = await navigator.permissions.query({ name: 'nfc' });
      return p.state; // granted | denied | prompt
    } catch (_) {
      return 'desconocido';
    }
  }

  return { disponible, iniciar, detener, estaActivo, mensajeError, estadoPermiso, normalizarUid };
})();
