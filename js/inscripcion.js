/* ============================================================
   inscripcion.js — agregar corredores al grupo activo.

   Tres formas, una sola a la vez para no abrumar:
     1. Con manilla  — escanear y escribir el nombre.
     2. A mano       — para uno o dos sueltos.
     3. Desde Excel  — descargar la planilla, llenarla y subirla.
   ============================================================ */
'use strict';

const Inscripcion = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let modo = 'manilla';
  let filtro = '';
  let soloSinManilla = false;

  // modo manilla
  let expresActivo = false;
  let chipLeido = null;
  let btnEscanear, textoEscaneo, cajaFormularioChip;

  // modo excel
  let planImportado = null;

  let cajaAgregar, cajaLista;

  /* ================= plantilla de Excel ================= */

  const COLUMNAS = ['Dorsal', 'Nombre', 'Categoría', 'Salida'];

  function filasDeEjemplo() {
    const salidas = Estado.oleadas();
    const nombreSalida = salidas[0] ? salidas[0].nombre : 'Salida 1';
    const otra = salidas[1] ? salidas[1].nombre : nombreSalida;
    return [
      [101, 'María Gómez Ruiz', 'Infantil', nombreSalida],
      [102, 'Juan Pérez Díaz', 'Infantil', nombreSalida],
      [103, 'Ana Torres León', 'Juvenil', otra]
    ];
  }

  async function descargarPlantilla() {
    const salidas = Estado.oleadas().map(o => o.nombre).join(', ');
    const filas = [COLUMNAS].concat(filasDeEjemplo());
    // filas en blanco para que el profesor solo tenga que escribir encima
    for (let i = 0; i < 60; i++) filas.push(['', '', '', '']);

    const instrucciones = [
      ['Cómo llenar esta planilla'],
      [''],
      ['1. Escribe un corredor por fila en la hoja "Corredores".'],
      ['2. No cambies los títulos de las columnas ni el orden.'],
      ['3. Borra las tres filas de ejemplo antes de subir el archivo.'],
      ['4. Guarda el archivo y súbelo en la app: Inscripción → Desde Excel.'],
      [''],
      ['Columna', 'Qué va ahí', '¿Obligatoria?'],
      ['Dorsal', 'El número que lleva el corredor en el peto. No se puede repetir.', 'Sí'],
      ['Nombre', 'Nombre y apellido del estudiante.', 'Sí'],
      ['Categoría', 'Por ejemplo: Infantil, Juvenil, Mayores. Sirve para filtrar los resultados.', 'No'],
      ['Salida', 'Solo si el grupo sale escalonado. Escribe el nombre de la salida.', 'No'],
      [''],
      ['Salidas disponibles en este grupo:', salidas],
      [''],
      ['Este archivo no lleva datos de la carrera, solo la lista de corredores.'],
      ['Contiene nombres de menores de edad: manéjalo con cuidado.']
    ];

    try {
      const bytes = await Excel.crearLibro([
        { nombre: 'Corredores', filas, anchos: [10, 34, 16, 16] },
        { nombre: 'Instrucciones', filas: instrucciones, anchos: [40, 52, 14] }
      ]);
      const nombre = 'Planilla_' + Util.limpiarNombreArchivo(est.tandaActiva.nombre) + '.xlsx';
      Util.descargar(nombre, bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      UI.alerta({ titulo: 'No se pudo crear la planilla', mensaje: e.message });
    }
  }

  /* ================= importar desde Excel ================= */

  /** Para títulos de columna: sin tildes, sin espacios y sin dígitos. */
  function normalizarTitulo(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]/g, '');
  }

  /** Para valores: conserva los dígitos, si no «Salida 1» y «Salida 2»
      se volverían el mismo texto. */
  function normalizarValor(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function resolverSalida(texto) {
    const lista = Estado.oleadas();
    const t = String(texto || '').trim();
    if (!t) return lista[0] ? lista[0].id : 1;
    const n = Number(t);
    if (Number.isFinite(n) && lista.some(o => o.id === n)) return n;
    const porNombre = lista.find(o => normalizarValor(o.nombre) === normalizarValor(t));
    return porNombre ? porNombre.id : (lista[0] ? lista[0].id : 1);
  }

  function analizarFilas(filas) {
    const errores = [];
    if (!filas.length) return { validos: [], errores: ['El archivo está vacío.'], nuevos: [], actualiza: [] };

    // Busca la fila de títulos en las primeras cinco.
    let iCabecera = -1;
    for (let i = 0; i < Math.min(5, filas.length); i++) {
      const t = filas[i].map(normalizarTitulo);
      if (t.includes('dorsal') && t.includes('nombre')) { iCabecera = i; break; }
    }
    if (iCabecera < 0) {
      return {
        validos: [], nuevos: [], actualiza: [],
        errores: ['No se encontraron las columnas «Dorsal» y «Nombre». ' +
                  'Descarga la planilla y úsala sin cambiar los títulos.']
      };
    }

    const titulos = filas[iCabecera].map(normalizarTitulo);
    const col = {
      dorsal: titulos.indexOf('dorsal'),
      nombre: titulos.indexOf('nombre'),
      categoria: titulos.findIndex(t => t === 'categoria'),
      salida: titulos.findIndex(t => t === 'salida' || t === 'oleada')
    };

    const validos = [];
    const vistos = new Set();

    for (let i = iCabecera + 1; i < filas.length; i++) {
      const f = filas[i];
      const linea = i + 1;
      const crudoDorsal = (f[col.dorsal] || '').toString().trim();
      const nombre = (col.nombre >= 0 ? (f[col.nombre] || '') : '').toString().trim();
      if (!crudoDorsal && !nombre) continue;   // fila en blanco

      const dorsal = Number(crudoDorsal);
      if (!Number.isFinite(dorsal) || dorsal <= 0 || Math.floor(dorsal) !== dorsal) {
        errores.push('Fila ' + linea + ': «' + crudoDorsal + '» no es un número de dorsal válido.');
        continue;
      }
      if (!nombre) { errores.push('Fila ' + linea + ': falta el nombre del dorsal ' + dorsal + '.'); continue; }
      if (vistos.has(dorsal)) {
        errores.push('Fila ' + linea + ': el dorsal ' + dorsal + ' está repetido en el archivo.');
        continue;
      }
      if (Estado.fueraDeRango(dorsal)) {
        errores.push('Fila ' + linea + ': el dorsal ' + dorsal + ' está fuera del rango de este celular (' + textoRango() + ').');
      }
      vistos.add(dorsal);
      validos.push({
        dorsal, nombre,
        categoria: col.categoria >= 0 ? (f[col.categoria] || '').toString().trim() : '',
        oleada: resolverSalida(col.salida >= 0 ? f[col.salida] : '')
      });
    }

    return {
      validos, errores,
      nuevos: validos.filter(c => !est.corredores.has(c.dorsal)),
      actualiza: validos.filter(c => est.corredores.has(c.dorsal))
    };
  }

  async function alSubirArchivo(archivo, caja) {
    caja.innerHTML = '';
    caja.hidden = false;
    caja.append(UI.el('p', { texto: 'Leyendo ' + archivo.name + '…' }));
    try {
      planImportado = analizarFilas(await Excel.leerArchivo(archivo));
    } catch (e) {
      caja.hidden = true;
      UI.alerta({ titulo: 'No se pudo leer el archivo', mensaje: e.message });
      return;
    }
    pintarPrevia(caja, archivo.name);
  }

  function pintarPrevia(caja, nombreArchivo) {
    const p = planImportado;
    caja.innerHTML = '';
    caja.hidden = false;

    caja.append(UI.el('h3', { texto: nombreArchivo }));
    caja.append(UI.el('ul', {}, [
      UI.el('li', { clase: p.nuevos.length ? 'marca-bien' : '', texto: p.nuevos.length + ' corredores nuevos' }),
      UI.el('li', { texto: p.actualiza.length + ' ya existían y se actualizan (conservan manilla y vueltas)' }),
      UI.el('li', { clase: p.errores.length ? 'marca-mal' : '', texto: p.errores.length + ' filas con problema' })
    ]));

    if (p.errores.length) {
      caja.append(UI.el('h3', { clase: 'marca-mal', texto: 'Revisa estas filas' }));
      const ul = UI.el('ul');
      for (const e of p.errores.slice(0, 25)) ul.append(UI.el('li', { texto: e }));
      if (p.errores.length > 25) ul.append(UI.el('li', { texto: '…y ' + (p.errores.length - 25) + ' más.' }));
      caja.append(ul);
    }

    if (p.validos.length) {
      const salidas = Estado.oleadas();
      caja.append(UI.el('h3', { texto: 'Primeros corredores' }));
      const lista = UI.el('div', { clase: 'lista' });
      for (const c of p.validos.slice(0, 6)) {
        const o = salidas.find(x => x.id === c.oleada);
        lista.append(UI.el('div', { clase: 'fila' }, [
          UI.el('span', { clase: 'fila__dorsal', texto: String(c.dorsal) }),
          UI.el('div', { clase: 'fila__cuerpo' }, [
            UI.el('div', { clase: 'fila__titulo', texto: c.nombre }),
            UI.el('div', { clase: 'fila__meta', texto: [c.categoria || 'Sin categoría', salidas.length > 1 && o ? o.nombre : null].filter(Boolean).join(' · ') })
          ])
        ]));
      }
      caja.append(lista);
      if (p.validos.length > 6) {
        caja.append(UI.el('p', { clase: 'campo__ayuda', texto: '…y ' + (p.validos.length - 6) + ' más.' }));
      }
      caja.append(UI.boton({
        texto: 'Agregar ' + p.validos.length + ' corredores', icono: 'cheque',
        tipo: 'principal', ancho: 'completo', alPulsar: () => confirmarImportacion(caja)
      }));
    }
  }

  async function confirmarImportacion(caja) {
    const p = planImportado;
    if (!p || !p.validos.length) return;
    const ok = await UI.confirmar({
      titulo: 'Agregar al grupo «' + est.tandaActiva.nombre + '»',
      mensaje: 'Se agregan ' + p.nuevos.length + ' corredores nuevos y se actualizan ' +
               p.actualiza.length + '.',
      confirmar: 'Sí, agregar', peligro: false
    });
    if (!ok) return;

    const idTanda = est.tandaActiva.id;
    const finales = p.validos.map(c => {
      const prev = est.corredores.get(c.dorsal);
      return {
        id: Estado.claveCorredor(idTanda, c.dorsal),
        tanda: idTanda, dorsal: c.dorsal, nombre: c.nombre,
        categoria: c.categoria, uid: prev ? (prev.uid || null) : null, oleada: c.oleada
      };
    });
    await DB.ponerVarios('corredores', finales);
    for (const c of finales) {
      est.todos.set(c.id, c);
      est.corredores.set(c.dorsal, c);
      if (c.uid) est.porUid.set(c.uid, c.dorsal);
    }
    UI.aviso(finales.length + ' corredores agregados', 'ok');
    planImportado = null;
    caja.hidden = true;
    App.datosCambiaron();
  }

  /* ================= modo manilla ================= */

  async function alternarEscaneo() {
    Util.prepararAudio();
    if (expresActivo) {
      NFC.detener();
      expresActivo = false;
      pintarBotonEscaneo();
      textoEscaneo.textContent = 'Escaneo apagado.';
      return;
    }
    if (!NFC.disponible()) {
      UI.alerta({ titulo: 'Sin NFC', mensaje: NFC.mensajeError({ name: 'NotSupportedError' }) });
      return;
    }
    if (NFC.estaActivo()) { NFC.detener(); Carrera.refrescar(); }

    textoEscaneo.textContent = 'Pidiendo permiso…';
    const ok = await NFC.iniciar(alLeerManilla, (e, mensaje) => {
      textoEscaneo.textContent = mensaje;
      if (e && e.name !== 'ReadingError') {
        expresActivo = false;
        pintarBotonEscaneo();
        UI.alerta({ titulo: 'Sin NFC', mensaje });
      } else Util.retro('error');
    });
    if (ok) {
      expresActivo = true;
      App.mantenerPantalla();
      textoEscaneo.textContent = 'Acerca la primera manilla.';
    }
    pintarBotonEscaneo();
  }

  function pintarBotonEscaneo() {
    if (!btnEscanear) return;
    btnEscanear.classList.toggle('esta-activo', expresActivo);
    btnEscanear.classList.toggle('btn--principal', !expresActivo);
    // El texto largo se recortaba dentro de la tarjeta en pantallas de 360 px.
    btnEscanear.querySelector('.btn__texto').textContent = expresActivo
      ? 'Escaneando — parar'
      : 'Escanear manilla';
  }

  function alLeerManilla({ uid }) {
    if (!uid) {
      textoEscaneo.textContent = 'Esa manilla no se pudo identificar.';
      Util.retro('error');
      return;
    }
    if (!cajaFormularioChip.hidden) {
      textoEscaneo.textContent = 'Termina con la manilla anterior antes de leer otra.';
      Util.retro('error');
      return;
    }
    chipLeido = { uid, hist: Estado.historialDeChip(uid) };
    Util.retro('ok');
    pintarFormularioChip();
  }

  function pintarFormularioChip() {
    const { uid, hist } = chipLeido;
    const caja = cajaFormularioChip;
    caja.innerHTML = '';
    caja.hidden = false;

    let dorsalSugerido = null;
    let categoria = '';

    if (hist.actual) {
      caja.append(UI.nota({
        tono: 'ojo',
        texto: 'Esta manilla ya es del dorsal ' + hist.actual.dorsal +
               (hist.actual.nombre ? ' (' + hist.actual.nombre + ')' : '') +
               ' en este grupo. Si la guardas con otro dorsal, se la quitas a esa persona.'
      }));
      dorsalSugerido = hist.actual.dorsal;
      categoria = hist.actual.categoria || '';
    } else if (hist.previos.length) {
      const previo = hist.previos[0];
      const libre = !est.corredores.has(previo.dorsal);
      caja.append(UI.nota({
        tono: libre ? 'ok' : 'ojo',
        texto: 'Esta manilla fue del dorsal ' + previo.dorsal +
               (previo.nombre ? ' (' + previo.nombre + ')' : '') +
               ' en ' + hist.nombreTanda(previo.tanda) + '. ' +
               (libre ? 'Ese dorsal está libre aquí, así que se propone el mismo.'
                      : 'Ese dorsal ya está ocupado aquí, así que se propone el siguiente libre.')
      }));
      if (libre) dorsalSugerido = previo.dorsal;
      categoria = previo.categoria || '';
    }

    const cDorsal = UI.campo({
      etiqueta: 'Dorsal', tipo: 'number',
      valor: dorsalSugerido || Estado.siguienteDorsal()
    });
    const cNombre = UI.campo({ etiqueta: 'Nombre', marcador: 'Nombre y apellido', maximo: 80 });
    const cCategoria = UI.campo({ etiqueta: 'Categoría', valor: categoria, maximo: 40 });
    const salidas = Estado.oleadas();
    const cSalida = salidas.length > 1 ? UI.selector({
      etiqueta: 'Salida',
      opciones: salidas.map(o => ({ valor: o.id, texto: o.nombre })),
      valor: salidas[0].id
    }) : null;

    caja.append(cDorsal, cNombre, cCategoria);
    if (cSalida) caja.append(cSalida);
    caja.append(UI.el('div', { clase: 'acciones' }, [
      UI.boton({
        texto: 'Guardar y seguir', icono: 'cheque', tipo: 'principal',
        alPulsar: () => guardarChip(cDorsal, cNombre, cCategoria, cSalida)
      }),
      UI.boton({
        texto: 'Descartar',
        alPulsar: () => {
          cerrarFormularioChip();
          textoEscaneo.textContent = expresActivo ? 'Acerca la siguiente manilla.' : '';
        }
      })
    ]));
    caja.append(UI.el('p', { clase: 'codigo', style: 'margin-top:10px', texto: 'Manilla ' + uid }));

    textoEscaneo.textContent = 'Manilla leída. Escribe el nombre y guarda.';
    cNombre.entrada.focus();
  }

  async function guardarChip(cDorsal, cNombre, cCategoria, cSalida) {
    if (!chipLeido) return;
    const dorsal = Number(cDorsal.obtenerValor());
    const nombre = cNombre.obtenerValor().trim();
    if (!dorsal || dorsal <= 0) { UI.aviso('Escribe un dorsal válido', 'error'); return; }
    if (!await avisarSiFueraDeRango(dorsal)) return;

    const ocupado = est.corredores.get(dorsal);
    if (ocupado && ocupado.nombre && ocupado.nombre !== nombre) {
      const ok = await UI.confirmar({
        titulo: 'Dorsal ocupado',
        mensaje: 'El dorsal ' + dorsal + ' ya es de ' + ocupado.nombre + ' en este grupo. ¿Reemplazar sus datos?',
        confirmar: 'Sí, reemplazar', peligro: false
      });
      if (!ok) return;
    }

    await Estado.guardarCorredor({
      dorsal, nombre,
      categoria: cCategoria.obtenerValor().trim(),
      oleada: cSalida ? cSalida.obtenerValor() : undefined
    });
    const v = await Estado.vincularUid(dorsal, chipLeido.uid, true);
    if (!v.ok) { UI.aviso(v.mensaje, 'error'); return; }

    Util.retro('final');
    UI.aviso('Dorsal ' + dorsal + (nombre ? ' · ' + nombre : '') + ' listo', 'ok');
    cerrarFormularioChip();
    textoEscaneo.textContent = expresActivo ? 'Listo. Acerca la siguiente manilla.' : 'Guardado.';
    App.datosCambiaron();
  }

  function cerrarFormularioChip() {
    chipLeido = null;
    if (cajaFormularioChip) { cajaFormularioChip.hidden = true; cajaFormularioChip.innerHTML = ''; }
  }

  /* ================= modo a mano ================= */

  function textoRango() {
    const d = Number(est.config.rangoDesde) || null;
    const h = Number(est.config.rangoHasta) || null;
    if (d && h) return d + ' a ' + h;
    if (d) return 'desde ' + d;
    if (h) return 'hasta ' + h;
    return 'sin límite';
  }

  async function avisarSiFueraDeRango(dorsal) {
    if (!Estado.fueraDeRango(dorsal)) return true;
    return UI.confirmar({
      titulo: 'Dorsal fuera de tu rango',
      mensaje: 'A este celular le tocan los dorsales ' + textoRango() + '.\n' +
               'Usar el ' + dorsal + ' puede chocar con otro profesor al juntar los datos.',
      confirmar: 'Usarlo igual', peligro: false
    });
  }

  function construirManual(caja) {
    const cDorsal = UI.campo({ etiqueta: 'Dorsal', tipo: 'number', valor: Estado.siguienteDorsal() });
    const cNombre = UI.campo({ etiqueta: 'Nombre', marcador: 'Nombre y apellido', maximo: 80 });
    const cCategoria = UI.campo({ etiqueta: 'Categoría', marcador: 'Infantil, Juvenil…', maximo: 40 });
    const salidas = Estado.oleadas();
    const cSalida = salidas.length > 1 ? UI.selector({
      etiqueta: 'Salida',
      opciones: salidas.map(o => ({ valor: o.id, texto: o.nombre })),
      valor: salidas[0].id
    }) : null;

    caja.append(cDorsal, cNombre, cCategoria);
    if (cSalida) caja.append(cSalida);
    caja.append(UI.boton({
      texto: 'Agregar corredor', icono: 'mas', tipo: 'principal', ancho: 'completo',
      alPulsar: async () => {
        const dorsal = Number(cDorsal.obtenerValor());
        const nombre = cNombre.obtenerValor().trim();
        if (!dorsal || dorsal <= 0) { UI.aviso('Escribe un dorsal válido', 'error'); return; }
        if (!nombre) { UI.aviso('Escribe el nombre', 'error'); return; }
        if (!await avisarSiFueraDeRango(dorsal)) return;

        const previo = est.corredores.get(dorsal);
        if (previo && previo.nombre) {
          const ok = await UI.confirmar({
            titulo: 'Dorsal ocupado',
            mensaje: 'El dorsal ' + dorsal + ' ya es de ' + previo.nombre +
                     '. ¿Reemplazar sus datos? La manilla y las vueltas se conservan.',
            confirmar: 'Sí, reemplazar', peligro: false
          });
          if (!ok) return;
        }

        await Estado.guardarCorredor({
          dorsal, nombre,
          categoria: cCategoria.obtenerValor().trim(),
          oleada: cSalida ? cSalida.obtenerValor() : undefined
        });
        UI.aviso('Agregado: ' + dorsal + ' · ' + nombre, 'ok');
        cNombre.entrada.value = '';
        cDorsal.entrada.value = String(Estado.siguienteDorsal());
        cNombre.entrada.focus();
        App.datosCambiaron();
      }
    }));

    if (Number(est.config.rangoDesde) || Number(est.config.rangoHasta)) {
      caja.append(UI.el('p', {
        clase: 'campo__ayuda', style: 'margin-top:10px',
        texto: 'A este celular le tocan los dorsales ' + textoRango() + '.'
      }));
    }
  }

  /* ================= construcción de la pantalla ================= */

  function pintarAgregar() {
    cajaAgregar.innerHTML = '';

    const selectorModo = UI.segmentado({
      opciones: [
        { valor: 'manilla', texto: 'Con manilla' },
        { valor: 'mano', texto: 'A mano' },
        { valor: 'excel', texto: 'Desde Excel' }
      ],
      valor: modo,
      alCambiar: v => { modo = v; pintarAgregar(); }
    });

    const cuerpo = UI.el('div');

    if (modo === 'manilla') {
      btnEscanear = UI.boton({
        texto: 'Escanear manilla', icono: 'nfc', tipo: 'principal',
        tamano: 'grande', ancho: 'completo', alPulsar: alternarEscaneo
      });
      if (!NFC.disponible()) btnEscanear.disabled = true;
      textoEscaneo = UI.el('p', { clase: 'campo__ayuda', style: 'margin:8px 0' });
      cajaFormularioChip = UI.el('div', { hidden: true, style: 'margin-top:12px' });

      cuerpo.append(
        UI.el('p', {
          clase: 'campo__ayuda', style: 'margin-bottom:12px',
          texto: 'Acerca la manilla: si ya se usó antes, la app te dice de quién era y ' +
                 'propone el mismo dorsal. Solo escribes el nombre.'
        }),
        btnEscanear, textoEscaneo, cajaFormularioChip
      );
      pintarBotonEscaneo();
      if (!NFC.disponible()) {
        textoEscaneo.textContent = 'Este celular no tiene NFC. Usa «A mano» o «Desde Excel».';
      }

    } else if (modo === 'mano') {
      construirManual(cuerpo);

    } else {
      const previa = UI.el('div', { clase: 'previa', hidden: true });
      const entradaArchivo = UI.el('input', {
        type: 'file',
        accept: '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        hidden: true,
        onchange: ev => {
          const a = ev.target.files && ev.target.files[0];
          ev.target.value = '';
          if (a) alSubirArchivo(a, previa);
        }
      });

      cuerpo.append(
        UI.el('ol', { clase: 'campo__ayuda', style: 'margin:0 0 14px;padding-left:20px;line-height:1.7' }, [
          UI.el('li', { texto: 'Descarga la planilla y ábrela en Excel o Google Sheets.' }),
          UI.el('li', { texto: 'Escribe un corredor por fila y borra los ejemplos.' }),
          UI.el('li', { texto: 'Guarda y sube el archivo aquí mismo.' })
        ]),
        UI.boton({
          texto: 'Descargar planilla', icono: 'excel', tipo: 'principal',
          ancho: 'completo', alPulsar: descargarPlantilla
        }),
        UI.el('div', { style: 'height:8px' }),
        UI.boton({
          texto: 'Subir planilla llena', icono: 'subir', ancho: 'completo',
          alPulsar: () => entradaArchivo.click()
        }),
        entradaArchivo,
        UI.el('p', {
          clase: 'campo__ayuda', style: 'margin-top:10px',
          texto: 'Acepta archivos de Excel (.xlsx) y CSV. Antes de agregar nada te muestra qué encontró.'
        }),
        previa
      );
    }

    cajaAgregar.append(UI.tarjeta({
      titulo: 'Agregar corredores',
      cuerpo: UI.el('div', {}, [selectorModo, cuerpo])
    }));
  }

  function pintarLista() {
    cajaLista.innerHTML = '';

    const todos = Array.from(est.corredores.values()).sort((a, b) => a.dorsal - b.dorsal);
    const r = Estado.resumen();
    const q = filtro.trim().toLowerCase();
    const visibles = todos.filter(c => {
      if (soloSinManilla && c.uid) return false;
      if (!q) return true;
      return String(c.dorsal).includes(q) ||
             (c.nombre || '').toLowerCase().includes(q) ||
             (c.categoria || '').toLowerCase().includes(q);
    });

    const cuerpo = UI.el('div');

    const busqueda = UI.campo({ marcador: 'Buscar por dorsal, nombre o categoría', tipo: 'search' });
    busqueda.entrada.addEventListener('input', () => { filtro = busqueda.entrada.value; pintarLista(); });
    busqueda.entrada.value = filtro;
    cuerpo.append(busqueda);

    cuerpo.append(UI.segmentado({
      opciones: [
        { valor: 'todos', texto: 'Todos (' + todos.length + ')' },
        { valor: 'sin', texto: 'Sin manilla (' + r.sinChip + ')' }
      ],
      valor: soloSinManilla ? 'sin' : 'todos',
      alCambiar: v => { soloSinManilla = v === 'sin'; pintarLista(); }
    }));

    if (!todos.length) {
      cuerpo.append(UI.vacio({
        icono: 'grupo',
        titulo: 'Todavía no hay corredores',
        mensaje: 'Agrégalos con la manilla, a mano o subiendo la planilla de Excel.'
      }));
    } else if (!visibles.length) {
      cuerpo.append(UI.vacio({ icono: 'buscar', titulo: 'Ninguno coincide', mensaje: 'Prueba con otra búsqueda.' }));
    } else {
      const salidas = Estado.oleadas();
      const lista = UI.el('div', { clase: 'lista', style: 'margin-top:12px' });
      for (const c of visibles.slice(0, 80)) {
        const vueltas = Estado.vueltasDe(c.dorsal);
        const o = salidas.find(x => x.id === c.oleada);
        const meta = [c.categoria || 'Sin categoría'];
        if (salidas.length > 1) meta.push(o ? o.nombre : 'Sin salida');
        meta.push(vueltas === 1 ? '1 vuelta' : vueltas + ' vueltas');

        lista.append(UI.el('button', { clase: 'fila', type: 'button', onclick: () => abrirCorredor(c.dorsal) }, [
          UI.el('span', { clase: 'fila__dorsal', texto: String(c.dorsal) }),
          UI.el('div', { clase: 'fila__cuerpo' }, [
            UI.el('div', { clase: 'fila__titulo', texto: c.nombre || 'Sin nombre' }),
            UI.el('div', { clase: 'fila__meta', texto: meta.join(' · ') })
          ]),
          UI.icono(c.uid ? 'manilla' : 'derecha', { clase: c.uid ? 'tiene-manilla' : '' })
        ]));
      }
      cuerpo.append(lista);
      if (visibles.length > 80) {
        cuerpo.append(UI.el('p', {
          clase: 'campo__ayuda', style: 'margin-top:10px',
          texto: 'Se muestran 80 de ' + visibles.length + '. Usa el buscador para encontrar a alguien.'
        }));
      }
    }

    cajaLista.append(UI.tarjeta({ titulo: 'Inscritos', cuerpo }));
  }

  /* ================= ficha de un corredor ================= */

  async function abrirCorredor(dorsal) {
    const c = est.corredores.get(dorsal);
    if (!c) return;

    const cDorsal = UI.campo({ etiqueta: 'Dorsal', tipo: 'number', valor: c.dorsal });
    const cNombre = UI.campo({ etiqueta: 'Nombre', valor: c.nombre, maximo: 80 });
    const cCategoria = UI.campo({ etiqueta: 'Categoría', valor: c.categoria, maximo: 40 });
    const salidas = Estado.oleadas();
    const cSalida = salidas.length > 1 ? UI.selector({
      etiqueta: 'Salida',
      opciones: salidas.map(o => ({ valor: o.id, texto: o.nombre })),
      valor: c.oleada
    }) : null;

    const cuerpo = UI.el('div', {}, [cDorsal, cNombre, cCategoria]);
    if (cSalida) cuerpo.append(cSalida);
    cuerpo.append(UI.nota({
      tono: c.uid ? 'ok' : 'info',
      icono: 'manilla',
      texto: c.uid ? 'Tiene manilla asignada.' : 'Sin manilla. Solo se puede registrar con el teclado.'
    }));
    const vueltas = Estado.vueltasDe(dorsal);
    if (vueltas) {
      cuerpo.append(UI.el('p', { clase: 'campo__ayuda', texto: 'Lleva ' + vueltas + (vueltas === 1 ? ' vuelta.' : ' vueltas.') }));
    }

    const acciones = [{ texto: 'Guardar cambios', tipo: 'principal', valor: 'guardar' }];
    if (c.uid) acciones.push({ texto: 'Quitar la manilla', valor: 'desvincular' });
    acciones.push({ texto: 'Eliminar del grupo', tipo: 'peligro', valor: 'borrar' });

    const r = await UI.hoja({ titulo: 'Dorsal ' + c.dorsal, cuerpo, acciones });
    if (!r) return;

    if (r === 'desvincular') {
      await Estado.guardarCorredor(Object.assign({}, c, { uid: null }));
      UI.aviso('Manilla liberada', 'ok');
      App.datosCambiaron();
      return;
    }

    if (r === 'borrar') {
      const ok = await UI.confirmar({
        titulo: 'Eliminar a ' + (c.nombre || 'dorsal ' + c.dorsal),
        mensaje: 'Se quita del grupo «' + est.tandaActiva.nombre + '».' +
                 (vueltas ? '\nSus ' + vueltas + ' vueltas quedan registradas pero sin nombre.' : '') +
                 '\nNo se puede deshacer.',
        confirmar: 'Sí, eliminar'
      });
      if (!ok) return;
      await Estado.borrarCorredor(dorsal);
      UI.aviso('Corredor eliminado', 'neutro');
      App.datosCambiaron();
      return;
    }

    const nuevoDorsal = Number(cDorsal.obtenerValor());
    const nombre = cNombre.obtenerValor().trim();
    if (!nombre) { UI.aviso('El nombre no puede quedar vacío', 'error'); return; }
    if (!nuevoDorsal || nuevoDorsal <= 0) { UI.aviso('Dorsal inválido', 'error'); return; }

    if (nuevoDorsal !== c.dorsal) {
      if (est.corredores.has(nuevoDorsal)) { UI.aviso('El dorsal ' + nuevoDorsal + ' ya está ocupado', 'error'); return; }
      if (vueltas > 0) { UI.aviso('No se puede cambiar el dorsal: ya tiene vueltas', 'error'); return; }
      await Estado.borrarCorredor(c.dorsal);
    }
    await Estado.guardarCorredor({
      dorsal: nuevoDorsal, nombre,
      categoria: cCategoria.obtenerValor().trim(),
      uid: c.uid || null,
      oleada: cSalida ? cSalida.obtenerValor() : c.oleada
    });
    UI.aviso('Cambios guardados', 'ok');
    App.datosCambiaron();
  }

  /* ================= ciclo de vida ================= */

  function iniciar() {
    cajaAgregar = $('#inscripcion-agregar');
    cajaLista = $('#inscripcion-lista');
    refrescar();
  }

  function refrescar() {
    if (!cajaAgregar) return;
    pintarAgregar();
    pintarLista();
  }

  function sincronizar() {
    const real = NFC.estaActivo();
    if (expresActivo !== real) { expresActivo = real; pintarBotonEscaneo(); }
  }

  function alCambiarTanda() {
    cerrarFormularioChip();
    planImportado = null;
    filtro = '';
    sincronizar();
    refrescar();
  }

  return { iniciar, refrescar, sincronizar, alCambiarTanda, analizarFilas };
})();
