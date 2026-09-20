/* ============================================================
   ui.js — sistema de componentes propio.

   Nada de controles nativos de Android: los desplegables, los
   diálogos y los campos de hora son componentes de la app, para
   que todo se vea y se comporte igual.

   Todo componente aquí: toque mínimo de 48 px, foco visible,
   cierre con Escape y con toque fuera, y texto en español claro.
   ============================================================ */
'use strict';

const UI = (() => {

  const el = (tag, props, hijos) => {
    const n = document.createElement(tag);
    props = props || {};
    for (const [k, v] of Object.entries(props)) {
      if (k === 'clase') n.className = v;
      else if (k === 'texto') n.textContent = v;
      else if (k === 'datos') for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const h of [].concat(hijos || [])) if (h != null) n.append(h);
    return n;
  };

  /* ================= iconos =================
     Trazo de 2 px sobre una rejilla de 24. Heredan el color del
     texto, así que funcionan igual en tema claro y oscuro.        */

  const TRAZOS = {
    bandera:    'M4 21V4m0 0h12l-2 4 2 4H4',
    persona:    'M4 20a7 7 0 0 1 14 0M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
    podio:      'M3 21h18M7 21v-7h4v7M13 21V8h4v13',
    ajustes:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.6 7.9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    nfc:        'M5 8a14 14 0 0 1 0 8M9 6a20 20 0 0 1 0 12M13 4a26 26 0 0 1 0 16M18 3v18',
    teclado:    'M4 4h16v16H4zM8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M8 17h8',
    mas:        'M12 5v14M5 12h14',
    menos:      'M5 12h14',
    reloj:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
    deshacer:   'M3 8h11a5 5 0 0 1 0 10H8M3 8l4-4M3 8l4 4',
    descargar:  'M12 3v12M7 11l5 5 5-5M4 20h16',
    compartir:  'M12 3v13M8 7l4-4 4 4M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
    copiar:     'M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    subir:      'M12 20V8M7 12l5-5 5 5M4 4h16',
    buscar:     'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
    lapiz:      'M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16zM14 6l4 4',
    basura:     'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
    cheque:     'M4 12l6 6L20 6',
    equis:      'M6 6l12 12M18 6L6 18',
    alerta:     'M12 3L2 20h20zM12 9v5M12 17h.01',
    info:       'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
    abajo:      'M6 9l6 6 6-6',
    arriba:     'M6 15l6-6 6 6',
    derecha:    'M9 6l6 6-6 6',
    izquierda:  'M15 6l-6 6 6 6',
    excel:      'M4 3h16v18H4zM4 9h16M4 15h16M10 9v12',
    grupo:      'M3 20a6 6 0 0 1 12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 20a5 5 0 0 0-3-4.6M16 4.3a4 4 0 0 1 0 7.4',
    salida:     'M5 3v18M5 4h13l-3 4 3 4H5',
    manilla:    'M9 15l6-6M8.5 6.5l1-1a4 4 0 1 1 5.7 5.7l-1 1M15.5 17.5l-1 1a4 4 0 0 1-5.7-5.7l1-1',
    rayo:       'M13 2L4 14h7l-1 8 9-12h-7z',
    capas:      'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    refrescar:  'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
    filtro:     'M3 5h18l-7 8v6l-4 2v-8z',
    celular:    'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M10 19h4',
    candado:    'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4'
  };

  function icono(nombre, opciones) {
    const o = opciones || {};
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', o.grosor || 2);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icono' + (o.clase ? ' ' + o.clase : ''));
    if (o.tamano) svg.style.setProperty('--tam', o.tamano + 'px');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', TRAZOS[nombre] || TRAZOS.info);
    svg.append(p);
    return svg;
  }

  /* ================= botones ================= */

  /** tipo: 'principal' | 'normal' | 'peligro' | 'fantasma' */
  function boton({ texto, icono: ic, tipo, tamano, alPulsar, ancho, etiqueta, deshabilitado }) {
    const b = el('button', {
      type: 'button',
      clase: 'btn btn--' + (tipo || 'normal') +
             (tamano === 'grande' ? ' btn--grande' : '') +
             (tamano === 'chico' ? ' btn--chico' : '') +
             (ancho === 'completo' ? ' btn--completo' : ''),
      'aria-label': etiqueta || null
    });
    if (ic) b.append(icono(ic));
    if (texto) b.append(el('span', { clase: 'btn__texto', texto }));
    if (deshabilitado) b.disabled = true;
    if (alPulsar) b.addEventListener('click', alPulsar);
    return b;
  }

  /* ================= hoja inferior =================
     Sustituye a los diálogos nativos. Sube desde abajo, se cierra
     arrastrando el asa, tocando fuera o con Escape.               */

  let hojaAbierta = null;

  function cerrarHoja(valor) {
    if (!hojaAbierta) return;
    const { fondo, resolver } = hojaAbierta;
    hojaAbierta = null;
    fondo.classList.remove('esta-abierta');
    document.body.classList.remove('sin-scroll');
    setTimeout(() => fondo.remove(), 200);
    resolver(valor);
  }

  /**
   * hoja({ titulo, descripcion, cuerpo, acciones, cerrable })
   * acciones: [{ texto, icono, tipo, valor }]
   * Devuelve una promesa con el valor de la acción pulsada (null si se cierra).
   */
  function hoja({ titulo, descripcion, cuerpo, acciones, cerrable }) {
    if (hojaAbierta) cerrarHoja(null);
    return new Promise(resolver => {
      const panel = el('div', { clase: 'hoja', role: 'dialog', 'aria-modal': 'true' });
      const fondo = el('div', { clase: 'hoja-fondo' }, [panel]);

      panel.append(el('div', { clase: 'hoja__asa', 'aria-hidden': 'true' }));

      if (titulo) {
        const cab = el('div', { clase: 'hoja__cabecera' }, [
          el('h2', { clase: 'hoja__titulo', texto: titulo })
        ]);
        if (cerrable !== false) {
          cab.append(boton({
            icono: 'equis', tipo: 'fantasma', tamano: 'chico',
            etiqueta: 'Cerrar', alPulsar: () => cerrarHoja(null)
          }));
        }
        panel.append(cab);
      }
      if (descripcion) panel.append(el('p', { clase: 'hoja__descripcion', texto: descripcion }));

      const contenido = el('div', { clase: 'hoja__cuerpo' });
      if (typeof cuerpo === 'string') {
        for (const linea of cuerpo.split('\n')) {
          if (linea.trim()) contenido.append(el('p', { texto: linea }));
        }
      } else if (cuerpo) {
        contenido.append(cuerpo);
      }
      panel.append(contenido);

      if (acciones && acciones.length) {
        const pie = el('div', { clase: 'hoja__acciones' });
        for (const a of acciones) {
          pie.append(boton({
            texto: a.texto, icono: a.icono, tipo: a.tipo || 'normal',
            ancho: 'completo', alPulsar: () => cerrarHoja(a.valor)
          }));
        }
        panel.append(pie);
      }

      fondo.addEventListener('click', ev => {
        if (ev.target === fondo && cerrable !== false) cerrarHoja(null);
      });

      document.body.append(fondo);
      document.body.classList.add('sin-scroll');
      hojaAbierta = { fondo, resolver };
      // requestAnimationFrame no se ejecuta si la pestaña está en segundo plano:
      // sin el respaldo, la hoja quedaría montada pero invisible.
      const mostrar = () => fondo.classList.add('esta-abierta');
      requestAnimationFrame(mostrar);
      setTimeout(mostrar, 60);

      const primero = panel.querySelector('input, select, textarea, button');
      if (primero && !primero.classList.contains('btn--fantasma')) {
        setTimeout(() => primero.focus(), 220);
      }
    });
  }

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && hojaAbierta) cerrarHoja(null);
  });

  /* ================= diálogos ================= */

  async function confirmar({ titulo, mensaje, confirmar: txt, cancelar, peligro }) {
    const r = await hoja({
      titulo,
      cuerpo: mensaje,
      acciones: [
        { texto: txt || 'Continuar', tipo: peligro === false ? 'principal' : 'peligro', valor: true },
        { texto: cancelar || 'Cancelar', tipo: 'normal', valor: null }
      ]
    });
    return r === true;
  }

  function alerta({ titulo, mensaje, icono: ic }) {
    return hoja({
      titulo, cuerpo: mensaje,
      acciones: [{ texto: 'Entendido', tipo: 'principal', valor: true }]
    });
  }

  /** Pide un texto o un número con el teclado del sistema. */
  async function pedir({ titulo, descripcion, etiqueta, valor, tipo, marcador, confirmar: txt }) {
    const entrada = el('input', {
      clase: 'campo__entrada',
      type: tipo || 'text',
      inputmode: tipo === 'number' ? 'numeric' : null,
      value: valor == null ? '' : String(valor),
      placeholder: marcador || null
    });
    const cuerpo = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta }) : null,
      entrada
    ]);
    const r = await hoja({
      titulo, descripcion, cuerpo,
      acciones: [
        { texto: txt || 'Guardar', tipo: 'principal', valor: 'ok' },
        { texto: 'Cancelar', tipo: 'normal', valor: null }
      ]
    });
    return r === 'ok' ? entrada.value : null;
  }

  /* ================= avisos ================= */

  function aviso(mensaje, tipo, ms) {
    const caja = document.getElementById('avisos');
    if (!caja) return;
    const n = el('div', { clase: 'aviso aviso--' + (tipo || 'neutro'), role: 'status' }, [
      icono(tipo === 'error' ? 'alerta' : tipo === 'ok' ? 'cheque' : 'info'),
      el('span', { texto: mensaje })
    ]);
    caja.append(n);
    const mostrar = () => n.classList.add('esta-visible');
    requestAnimationFrame(mostrar);
    setTimeout(mostrar, 60);
    setTimeout(() => {
      n.classList.remove('esta-visible');
      setTimeout(() => n.remove(), 200);
    }, ms || 3400);
  }

  /* ================= selector =================
     Reemplazo del <select> nativo: un botón que abre una hoja con
     la lista de opciones, cada una con su descripción.            */

  function selector({ etiqueta, ayuda, opciones, valor, alCambiar, titulo, vacio }) {
    let actual = valor;
    let lista = opciones || [];

    const texto = el('span', { clase: 'selector__valor' });
    const boton_ = el('button', { type: 'button', clase: 'selector' }, [
      texto, icono('abajo', { clase: 'selector__flecha' })
    ]);

    function pintar() {
      const o = lista.find(x => String(x.valor) === String(actual));
      texto.textContent = o ? o.texto : (vacio || 'Elegir…');
      boton_.classList.toggle('selector--vacio', !o);
    }

    boton_.addEventListener('click', async () => {
      const caja = el('div', { clase: 'opciones' });
      for (const o of lista) {
        const activa = String(o.valor) === String(actual);
        caja.append(el('button', {
          type: 'button',
          clase: 'opcion' + (activa ? ' opcion--activa' : ''),
          onclick: () => { cerrarHoja(o.valor); }
        }, [
          el('span', { clase: 'opcion__cuerpo' }, [
            el('span', { clase: 'opcion__texto', texto: o.texto }),
            o.ayuda ? el('span', { clase: 'opcion__ayuda', texto: o.ayuda }) : null
          ]),
          activa ? icono('cheque', { clase: 'opcion__marca' }) : null
        ]));
      }
      const r = await hoja({ titulo: titulo || etiqueta || 'Elegir', cuerpo: caja });
      if (r != null) {
        actual = r;
        pintar();
        if (alCambiar) alCambiar(r);
      }
    });

    pintar();

    const campo = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta }) : null,
      boton_,
      ayuda ? el('p', { clase: 'campo__ayuda', texto: ayuda }) : null
    ]);

    campo.fijarOpciones = (nuevas, nuevoValor) => {
      lista = nuevas;
      if (nuevoValor !== undefined) actual = nuevoValor;
      if (!lista.some(x => String(x.valor) === String(actual))) {
        actual = lista[0] ? lista[0].valor : null;
      }
      pintar();
      return actual;
    };
    campo.fijarValor = v => { actual = v; pintar(); };
    campo.obtenerValor = () => actual;
    return campo;
  }

  /* ================= control segmentado =================
     Para elegir entre dos o tres opciones cortas sin abrir nada.  */

  function segmentado({ opciones, valor, alCambiar, etiqueta }) {
    let actual = valor;
    const caja = el('div', { clase: 'segmentado', role: 'tablist' });

    function pintar() {
      caja.innerHTML = '';
      for (const o of opciones) {
        const activa = String(o.valor) === String(actual);
        caja.append(el('button', {
          type: 'button', role: 'tab',
          'aria-selected': activa ? 'true' : 'false',
          clase: 'segmentado__opcion' + (activa ? ' esta-activa' : ''),
          texto: o.texto,
          onclick: () => {
            if (String(o.valor) === String(actual)) return;
            actual = o.valor;
            pintar();
            if (alCambiar) alCambiar(o.valor);
          }
        }));
      }
    }
    pintar();

    const campo = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta }) : null,
      caja
    ]);
    campo.fijarValor = v => { actual = v; pintar(); };
    campo.obtenerValor = () => actual;
    return campo;
  }

  /* ================= campo de texto ================= */

  function campo({ etiqueta, ayuda, tipo, valor, marcador, id, maximo, inputmode, alEscribir }) {
    const entrada = el('input', {
      clase: 'campo__entrada',
      type: tipo || 'text',
      id: id || null,
      inputmode: inputmode || (tipo === 'number' ? 'numeric' : null),
      value: valor == null ? '' : String(valor),
      placeholder: marcador || null,
      maxlength: maximo || null,
      autocomplete: 'off'
    });
    if (alEscribir) entrada.addEventListener('input', () => alEscribir(entrada.value));
    const caja = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta, for: id || null }) : null,
      entrada,
      ayuda ? el('p', { clase: 'campo__ayuda', texto: ayuda }) : null
    ]);
    caja.entrada = entrada;
    caja.obtenerValor = () => entrada.value;
    return caja;
  }

  /** Campo numérico con botones grandes de más y menos: sin teclado. */
  function contador({ etiqueta, ayuda, valor, minimo, maximo, alCambiar, sufijo }) {
    let actual = Number(valor) || minimo || 0;
    const visor = el('span', { clase: 'contador__valor' });

    function pintar() {
      visor.textContent = actual + (sufijo ? ' ' + sufijo : '');
      menos.disabled = actual <= (minimo != null ? minimo : -Infinity);
      mas.disabled = actual >= (maximo != null ? maximo : Infinity);
    }
    function mover(d) {
      const nuevo = Math.min(maximo != null ? maximo : Infinity,
                     Math.max(minimo != null ? minimo : -Infinity, actual + d));
      if (nuevo === actual) return;
      actual = nuevo;
      pintar();
      if (alCambiar) alCambiar(actual);
    }
    const menos = boton({ icono: 'menos', etiqueta: 'Restar', alPulsar: () => mover(-1) });
    const mas = boton({ icono: 'mas', etiqueta: 'Sumar', alPulsar: () => mover(1) });
    pintar();

    const caja = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta }) : null,
      el('div', { clase: 'contador' }, [menos, visor, mas]),
      ayuda ? el('p', { clase: 'campo__ayuda', texto: ayuda }) : null
    ]);
    caja.obtenerValor = () => actual;
    caja.fijarValor = v => { actual = Number(v) || 0; pintar(); };
    return caja;
  }

  /** Hora en tres ruedas, sin el selector de hora de Android. */
  function campoHora({ etiqueta, ayuda, horas, minutos, segundos }) {
    const partes = [
      { clave: 'h', max: 23, valor: horas || 0 },
      { clave: 'm', max: 59, valor: minutos || 0 },
      { clave: 's', max: 59, valor: segundos || 0 }
    ];
    const caja = el('div', { clase: 'hora' });

    for (const p of partes) {
      const visor = el('span', { clase: 'hora__valor' });
      const pintar = () => { visor.textContent = String(p.valor).padStart(2, '0'); };
      const mover = d => {
        p.valor = (p.valor + d + (p.max + 1)) % (p.max + 1);
        pintar();
      };
      pintar();
      caja.append(el('div', { clase: 'hora__rueda' }, [
        boton({ icono: 'arriba', tipo: 'fantasma', etiqueta: 'Subir', alPulsar: () => mover(1) }),
        visor,
        boton({ icono: 'abajo', tipo: 'fantasma', etiqueta: 'Bajar', alPulsar: () => mover(-1) })
      ]));
      if (p.clave !== 's') caja.append(el('span', { clase: 'hora__dospuntos', texto: ':' }));
    }

    const campo_ = el('div', { clase: 'campo' }, [
      etiqueta ? el('label', { clase: 'campo__etiqueta', texto: etiqueta }) : null,
      caja,
      ayuda ? el('p', { clase: 'campo__ayuda', texto: ayuda }) : null
    ]);
    campo_.obtenerValor = () => ({ horas: partes[0].valor, minutos: partes[1].valor, segundos: partes[2].valor });
    return campo_;
  }

  /* ================= estructura ================= */

  function tarjeta({ titulo, ayuda, cuerpo, tono }) {
    return el('section', { clase: 'tarjeta' + (tono ? ' tarjeta--' + tono : '') }, [
      titulo ? el('h2', { clase: 'tarjeta__titulo', texto: titulo }) : null,
      ayuda ? el('p', { clase: 'tarjeta__ayuda', texto: ayuda }) : null,
      cuerpo
    ]);
  }

  /** Bloque plegable propio, sin <details>. */
  function plegable({ titulo, insignia, cuerpo, abierto }) {
    const flecha = icono('abajo', { clase: 'plegable__flecha' });
    const cab = el('button', { type: 'button', clase: 'plegable__cabecera', 'aria-expanded': abierto ? 'true' : 'false' }, [
      el('span', { clase: 'plegable__titulo', texto: titulo }),
      insignia != null ? el('span', { clase: 'insignia', texto: String(insignia) }) : null,
      flecha
    ]);
    const caja = el('div', { clase: 'plegable__cuerpo' }, [cuerpo]);
    const raiz = el('section', { clase: 'tarjeta plegable' + (abierto ? ' esta-abierto' : '') }, [cab, caja]);
    cab.addEventListener('click', () => {
      const ahora = !raiz.classList.contains('esta-abierto');
      raiz.classList.toggle('esta-abierto', ahora);
      cab.setAttribute('aria-expanded', ahora ? 'true' : 'false');
    });
    raiz.fijarInsignia = v => {
      const n = cab.querySelector('.insignia');
      if (n) n.textContent = String(v);
    };
    raiz.cuerpo = caja;
    return raiz;
  }

  function vacio({ titulo, mensaje, icono: ic, accion }) {
    return el('div', { clase: 'vacio' }, [
      ic ? icono(ic, { tamano: 32, clase: 'vacio__icono' }) : null,
      el('p', { clase: 'vacio__titulo', texto: titulo }),
      mensaje ? el('p', { clase: 'vacio__mensaje', texto: mensaje }) : null,
      accion || null
    ]);
  }

  /** Aviso en línea dentro de una pantalla. tono: 'info'|'ojo'|'error' */
  function nota({ texto, tono, icono: ic }) {
    return el('div', { clase: 'nota nota--' + (tono || 'info') }, [
      icono(ic || (tono === 'error' ? 'alerta' : tono === 'ojo' ? 'alerta' : 'info')),
      el('p', { texto })
    ]);
  }

  return {
    el, icono, boton, hoja, cerrarHoja, confirmar, alerta, pedir, aviso,
    selector, segmentado, campo, contador, campoHora,
    tarjeta, plegable, vacio, nota, TRAZOS
  };
})();
