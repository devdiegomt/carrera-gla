/* ============================================================
   ajustes.js — todo lo que no se toca durante la carrera.

   Se presenta como un menú corto: cada opción abre su propia
   hoja. Así el profesor no ve nunca más de una cosa a la vez.
   ============================================================ */
'use strict';

const Ajustes = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let caja;
  let relojInterval = null;

  /* ================= helpers de menú ================= */

  function opcionMenu({ icono, titulo, detalle, alPulsar, tono }) {
    return UI.el('button', {
      type: 'button',
      clase: 'fila' + (tono ? ' fila--' + tono : ''),
      onclick: alPulsar
    }, [
      UI.icono(icono),
      UI.el('div', { clase: 'fila__cuerpo' }, [
        UI.el('div', { clase: 'fila__titulo', texto: titulo }),
        detalle ? UI.el('div', { clase: 'fila__meta', texto: detalle }) : null
      ]),
      UI.icono('derecha')
    ]);
  }

  /* ================= grupo activo ================= */

  function tarjetaGrupo() {
    const t = est.tandaActiva;

    const cNombre = UI.campo({ etiqueta: 'Nombre del grupo', valor: t.nombre, maximo: 40 });
    const cVueltas = UI.contador({
      etiqueta: 'Vueltas para terminar', valor: t.vueltas, minimo: 1, maximo: 99
    });
    const cVentana = UI.contador({
      etiqueta: 'Tiempo mínimo entre vueltas',
      ayuda: 'Si la misma manilla se lee otra vez antes de este tiempo, no cuenta. ' +
             'Es lo que evita contar dos veces la misma vuelta. Ponlo un poco por debajo ' +
             'de lo que tarda el corredor más rápido en dar una vuelta.',
      valor: t.ventanaMinSeg, minimo: 5, maximo: 600, sufijo: 'segundos'
    });

    const guardar = UI.boton({
      texto: 'Guardar', icono: 'cheque', tipo: 'principal', ancho: 'completo',
      alPulsar: async () => {
        const vueltas = cVueltas.obtenerValor();
        if (vueltas !== t.vueltas) {
          const ok = await UI.confirmar({
            titulo: 'Cambiar las vueltas',
            mensaje: 'El grupo pasa de ' + t.vueltas + ' a ' + vueltas + ' vueltas.\n' +
                     'Las ' + est.totalEventos + ' pasadas ya registradas se conservan: ' +
                     'solo cambia quién aparece como terminado.',
            confirmar: 'Sí, cambiar', peligro: false
          });
          if (!ok) return;
        }
        await Estado.guardarTanda({
          nombre: cNombre.obtenerValor().trim() || t.nombre,
          vueltas,
          ventanaMinSeg: cVentana.obtenerValor()
        });
        await Estado.guardarConfig({
          vueltasPorDefecto: vueltas,
          ventanaPorDefecto: cVentana.obtenerValor()
        });
        UI.aviso('Guardado', 'ok');
        App.tandaCambio();
      }
    });

    return UI.tarjeta({
      titulo: 'Grupo activo',
      ayuda: 'Estos valores son solo de «' + t.nombre + '». Otro grupo puede correr otra distancia.',
      cuerpo: UI.el('div', {}, [cNombre, cVueltas, cVentana, guardar])
    });
  }

  /* ================= este celular ================= */

  async function abrirCelular() {
    const cNombre = UI.campo({
      etiqueta: 'Nombre de este celular',
      ayuda: 'Debe ser distinto en cada celular: CEL-1, CEL-2… Sirve para saber de dónde vino cada vuelta.',
      valor: est.config.idDispositivo, maximo: 40
    });
    const cPuesto = UI.campo({
      etiqueta: 'Puesto donde estás', valor: est.config.nombrePuesto,
      marcador: 'Meta izquierda', maximo: 40
    });
    const cEvento = UI.campo({
      etiqueta: 'Nombre del evento', valor: est.config.nombreCarrera, maximo: 60
    });
    const cDigitos = UI.contador({
      etiqueta: 'Dígitos del dorsal',
      ayuda: 'El teclado registra solo al completar esta cantidad de números.',
      valor: est.config.digitosDorsal, minimo: 1, maximo: 6
    });
    const cDesde = UI.campo({
      etiqueta: 'Inscribe dorsales desde', tipo: 'number',
      valor: est.config.rangoDesde || '', marcador: 'sin límite'
    });
    const cHasta = UI.campo({
      etiqueta: 'hasta', tipo: 'number',
      valor: est.config.rangoHasta || '', marcador: 'sin límite',
      ayuda: 'Repartan un tramo distinto a cada profesor (CEL-1: 1 a 100, CEL-2: 101 a 200…). ' +
             'Así varios inscriben al tiempo sin pisarse los números.'
    });

    const r = await UI.hoja({
      titulo: 'Este celular',
      cuerpo: UI.el('div', {}, [cNombre, cPuesto, cEvento, cDigitos, cDesde, cHasta]),
      acciones: [{ texto: 'Guardar', tipo: 'principal', valor: 'ok' }]
    });
    if (r !== 'ok') return;

    const desde = Number(cDesde.obtenerValor()) || null;
    const hasta = Number(cHasta.obtenerValor()) || null;
    if (desde && hasta && hasta < desde) { UI.aviso('El rango está al revés', 'error'); return; }

    await Estado.guardarConfig({
      idDispositivo: cNombre.obtenerValor().trim() || Util.idAleatorio('CEL'),
      nombrePuesto: cPuesto.obtenerValor().trim() || 'Meta',
      nombreCarrera: cEvento.obtenerValor().trim() || 'Carrera escolar',
      digitosDorsal: cDigitos.obtenerValor(),
      rangoDesde: desde, rangoHasta: hasta
    });
    UI.aviso('Guardado', 'ok');
    App.datosCambiaron();
    refrescar();
  }

  /* ================= verificar la hora ================= */

  function abrirReloj() {
    const hora = UI.el('div', { clase: 'reloj-grande__hora' });
    const fecha = UI.el('div', { clase: 'reloj-grande__fecha' });
    const tic = () => {
      hora.textContent = Util.hora(Date.now());
      fecha.textContent = Util.fecha(Date.now());
    };
    tic();
    clearInterval(relojInterval);
    relojInterval = setInterval(tic, 500);

    UI.hoja({
      titulo: 'Verificar la hora',
      descripcion: 'Pongan los celulares lado a lado y comparen. Si uno va adelantado, las vueltas ' +
                   'repetidas se pueden colar y los tiempos quedan mal. Actívenle a todos la hora automática.',
      cuerpo: UI.el('div', {}, [
        UI.el('div', { clase: 'reloj-grande' }, [hora, fecha]),
        UI.el('p', {
          clase: 'campo__ayuda', style: 'margin-top:12px',
          texto: 'Hora de Bogotá, formato 24 horas. Zona del celular: ' +
                 (Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida') + '.'
        })
      ])
    }).then(() => { clearInterval(relojInterval); relojInterval = null; });
  }

  /* ================= lista de corredores ================= */

  async function abrirLista() {
    const selAlcance = UI.selector({
      etiqueta: 'De qué grupos',
      opciones: [
        { valor: 'activa', texto: 'Solo «' + est.tandaActiva.nombre + '»' },
        { valor: 'todas', texto: 'Todos los grupos' }
      ],
      valor: 'activa'
    });
    const entrada = UI.el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    entrada.addEventListener('change', async ev => {
      const a = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (a) { UI.cerrarHoja(null); await importarLista(a); }
    });

    const r = await UI.hoja({
      titulo: 'Lista de corredores',
      descripcion: 'Inscribe en un celular, comparte la lista y ábrela en los demás. La lista lleva ' +
                   'el grupo adentro, así todos quedan inscribiendo sobre el mismo.',
      cuerpo: UI.el('div', {}, [selAlcance, entrada]),
      acciones: [
        { texto: 'Compartir la lista', icono: 'compartir', tipo: 'principal', valor: 'compartir' },
        { texto: 'Guardar archivo', icono: 'descargar', valor: 'descargar' },
        { texto: 'Abrir una lista recibida', icono: 'subir', valor: 'importar' }
      ]
    });
    if (!r) return;
    if (r === 'importar') { entrada.click(); return; }

    if (!est.todos.size) { UI.aviso('Todavía no hay corredores', 'error'); return; }
    const p = Exportar.paquetePadron(selAlcance.obtenerValor());
    if (r === 'descargar') Util.descargar(p.nombre, p.contenido, p.mime);
    else Util.compartir(p.nombre, p.contenido, p.mime);
  }

  async function importarLista(archivo) {
    let texto;
    try { texto = await Util.leerArchivo(archivo); }
    catch (e) { UI.alerta({ titulo: 'No se pudo leer', mensaje: e.message }); return; }

    const an = Exportar.analizarPadron(texto, archivo.name);
    if (!an.ok) { UI.alerta({ titulo: 'Lista no válida', mensaje: an.mensaje }); return; }

    const a = an.archivo;
    const cuerpo = UI.el('div', {}, [
      UI.el('ul', { clase: 'campo__ayuda', style: 'padding-left:20px' }, [
        UI.el('li', { texto: a.corredores.length + ' corredores en el archivo' }),
        UI.el('li', { texto: a.corredores.filter(c => c.uid).length + ' con manilla asignada' })
      ]),
      cajaMapeo(an.mapeo)
    ]);

    const modo = await UI.hoja({
      titulo: 'Abrir «' + archivo.name + '»',
      cuerpo,
      acciones: [
        { texto: 'Juntar con lo que ya tengo', tipo: 'principal', valor: 'fusionar' },
        { texto: 'Reemplazar lo que tengo', tipo: 'peligro', valor: 'reemplazar' }
      ]
    });
    if (!modo) return;

    if (modo === 'reemplazar') {
      const ok = await UI.confirmar({
        titulo: 'Reemplazar la lista',
        mensaje: 'Se borran los corredores que este celular tenga en esos grupos y quedan solo ' +
                 'los del archivo. Las vueltas ya registradas no se borran.',
        confirmar: 'Sí, reemplazar'
      });
      if (!ok) return;
    }

    const res = await Exportar.aplicarPadron(an, an.mapeo, modo);
    UI.aviso('Lista abierta: ' + res.total + ' corredores', 'ok');
    App.tandaCambio();
  }

  /** Elige a qué grupo local corresponde cada grupo del archivo. */
  function cajaMapeo(mapeo) {
    const caja = UI.el('div');
    for (const m of mapeo) {
      const opciones = [{ valor: '__nueva__', texto: 'Crear como grupo nuevo' }].concat(
        Array.from(est.tandas.values())
          .sort((a, b) => b.creadaEn - a.creadaEn)
          .map(t => ({ valor: t.id, texto: 'Juntar con «' + t.nombre + '»' })));
      caja.append(UI.selector({
        etiqueta: 'El grupo «' + m.nombre + '» del archivo',
        ayuda: m.motivo === 'no existe aquí' ? 'No existe en este celular.' : 'Reconocido: ' + m.motivo,
        opciones, valor: m.destino,
        alCambiar: v => { m.destino = v; }
      }));
    }
    return caja;
  }

  /* ================= juntar celulares ================= */

  async function abrirUnion() {
    const entrada = UI.el('input', { type: 'file', accept: 'application/json,.json', multiple: true, hidden: true });
    entrada.addEventListener('change', async ev => {
      const archivos = Array.from(ev.target.files || []);
      ev.target.value = '';
      if (archivos.length) { UI.cerrarHoja(null); await procesarUnion(archivos); }
    });

    const hayRespaldo = await Exportar.hayUnionPrevia();
    const acciones = [{ texto: 'Elegir los archivos', icono: 'subir', tipo: 'principal', valor: 'cargar' }];
    if (hayRespaldo) acciones.push({ texto: 'Deshacer la última vez', icono: 'deshacer', tipo: 'peligro', valor: 'deshacer' });

    const r = await UI.hoja({
      titulo: 'Juntar los datos de los celulares',
      descripcion: 'Al final de la carrera, cada profesor comparte su copia de seguridad. Aquí se ' +
                   'juntan todas, se quitan las vueltas repetidas y queda la tabla definitiva.',
      cuerpo: UI.el('div', {}, [entrada]),
      acciones
    });
    if (r === 'cargar') entrada.click();
    else if (r === 'deshacer') deshacerUnion();
  }

  async function procesarUnion(archivos) {
    const analizados = [];
    for (const a of archivos) {
      try { analizados.push(Exportar.analizarArchivo(await Util.leerArchivo(a), a.name)); }
      catch (e) { analizados.push({ ok: false, archivo: a.name, mensaje: e.message }); }
    }
    const buenos = analizados.filter(a => a.ok);
    if (!buenos.length) {
      UI.alerta({
        titulo: 'No se pudo usar ningún archivo',
        mensaje: analizados.map(a => a.archivo + ': ' + a.mensaje).join('\n')
      });
      return;
    }

    const mapeo = Exportar.proponerMapeo(buenos);
    const resumen = UI.el('div', {}, [
      UI.el('ul', { clase: 'campo__ayuda', style: 'padding-left:20px' },
        analizados.map(a => UI.el('li', {
          clase: a.ok ? '' : 'marca-mal',
          texto: a.ok ? a.archivo + ' — ' + a.dispositivo + ', ' + a.eventos.length + ' pasadas'
                      : a.archivo + ' — ' + a.mensaje
        }))),
      cajaMapeo(mapeo)
    ]);

    const r = await UI.hoja({
      titulo: 'Archivos leídos',
      cuerpo: resumen,
      acciones: [{ texto: 'Calcular', tipo: 'principal', valor: 'ok' }]
    });
    if (r !== 'ok') return;

    mostrarPlan(Exportar.prepararUnion(buenos, mapeo));
  }

  async function mostrarPlan(plan) {
    const cuerpo = UI.el('div');

    cuerpo.append(UI.el('div', { clase: 'cifras' }, [
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: String(plan.aceptados.length) }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Vueltas' })
      ]),
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: String(plan.descartes.length) }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Repetidas' })
      ]),
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: String(plan.corredores.length) }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Corredores' })
      ])
    ]));

    cuerpo.append(UI.el('p', {
      clase: 'campo__ayuda', style: 'margin-bottom:12px',
      texto: 'Se leyeron ' + plan.totalLeidos + ' pasadas en total. Las repetidas son las que el ' +
             'mismo corredor marcó dos veces seguidas en celulares distintos: se cuenta una sola.'
    }));

    if (plan.conflictos.length) {
      cuerpo.append(UI.nota({
        tono: 'ojo',
        texto: plan.conflictos.length + ' corredores tienen datos distintos en dos celulares ' +
               '(por ejemplo el mismo dorsal con dos nombres). Se conserva lo de este celular; ' +
               'revísalos después en Inscripción.'
      }));
    }
    if (plan.huerfanos.length) {
      cuerpo.append(UI.nota({
        tono: 'ojo',
        texto: 'Hay vueltas de dorsales que nadie inscribió: ' +
               plan.huerfanos.slice(0, 8).join(', ') + (plan.huerfanos.length > 8 ? '…' : '') +
               '. Se conservan, pero saldrán sin nombre.'
      }));
    }

    if (plan.porDispositivo.length) {
      cuerpo.append(UI.el('h3', { style: 'font-size:15px;margin:16px 0 8px', texto: 'Por celular' }));
      const lista = UI.el('div', { clase: 'lista' });
      for (const d of plan.porDispositivo) {
        lista.append(UI.el('div', { clase: 'fila' }, [
          UI.icono('celular'),
          UI.el('div', { clase: 'fila__cuerpo' }, [
            UI.el('div', { clase: 'fila__titulo', texto: d.dispositivo }),
            UI.el('div', { clase: 'fila__meta', texto: d.aceptados + ' vueltas · ' + d.descartados + ' repetidas' })
          ])
        ]));
      }
      cuerpo.append(lista);
    }

    if (plan.descartes.length) {
      cuerpo.append(UI.el('div', { style: 'height:12px' }));
      cuerpo.append(UI.boton({
        texto: 'Guardar el detalle de las repetidas', icono: 'descargar', ancho: 'completo',
        alPulsar: () => Util.descargar(
          'repetidas_' + Util.selloArchivo(Date.now()) + '.csv',
          Exportar.csvDescartes(plan.descartes), 'text/csv')
      }));
    }

    const r = await UI.hoja({
      titulo: 'Resultado de juntar',
      cuerpo,
      acciones: [{ texto: 'Aplicar y ver la tabla final', tipo: 'principal', valor: 'ok' }]
    });
    if (r !== 'ok') return;

    const ok = await UI.confirmar({
      titulo: 'Aplicar',
      mensaje: 'Los datos de este celular se reemplazan por el resultado.\n' +
               'Se guarda una copia: podrás deshacerlo.',
      confirmar: 'Sí, aplicar', peligro: false
    });
    if (!ok) return;

    const n = await Exportar.aplicarUnion(plan);
    UI.aviso('Listo: ' + n + ' vueltas', 'ok');
    App.tandaCambio();
    App.irA('posiciones');
  }

  async function deshacerUnion() {
    const ok = await UI.confirmar({
      titulo: 'Deshacer',
      mensaje: 'Se restaura lo que tenía este celular antes de juntar los datos.',
      confirmar: 'Sí, deshacer'
    });
    if (!ok) return;
    if (await Exportar.deshacerUnion()) {
      UI.aviso('Deshecho', 'ok');
      App.tandaCambio();
    } else UI.aviso('No hay nada que deshacer', 'error');
  }

  /* ================= revisión del sistema ================= */

  async function abrirRevision() {
    const cuerpo = UI.el('div', { clase: 'lista' });
    const punto = (estado, titulo, detalle) => cuerpo.append(UI.el('div', {
      clase: 'fila fila--' + (estado === 'ok' ? 'ok' : estado === 'error' ? 'error' : 'meta')
    }, [
      UI.icono(estado === 'ok' ? 'cheque' : 'alerta'),
      UI.el('div', { clase: 'fila__cuerpo' }, [
        UI.el('div', { clase: 'fila__titulo', texto: titulo }),
        UI.el('div', { clase: 'fila__meta', style: 'white-space:normal', texto: detalle })
      ])
    ]));

    punto(NFC.disponible() ? 'ok' : 'error', 'Lectura de manillas',
      NFC.disponible() ? 'Este celular puede leer manillas.'
        : 'Este navegador no lee NFC. Usa Chrome en un Android con NFC; mientras tanto, el teclado funciona.');

    punto(window.isSecureContext ? 'ok' : 'error', 'Conexión segura',
      window.isSecureContext ? 'La página se abrió de forma segura.'
        : 'Hay que abrir la app por su dirección https para que el NFC funcione.');

    const permiso = await NFC.estadoPermiso();
    punto(permiso === 'granted' ? 'ok' : permiso === 'denied' ? 'error' : 'aviso', 'Permiso de NFC',
      permiso === 'granted' ? 'Concedido.'
        : permiso === 'denied' ? 'Bloqueado. Toca el candado junto a la dirección y permite el NFC.'
        : 'Se pedirá la primera vez que actives la lectura.');

    punto(Util.esWebView() ? 'error' : 'ok', 'Navegador',
      Util.esWebView() ? 'Abriste la app dentro de otra aplicación. Ábrela en Chrome: menú ⋮ → Abrir en Chrome.'
        : 'Estás en un navegador normal.');

    try {
      const persistido = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      punto(persistido ? 'ok' : 'aviso', 'Guardado de datos',
        persistido ? 'El sistema no borrará los datos por falta de espacio.'
          : 'Instala la app en la pantalla de inicio para que el sistema no borre los datos.');
    } catch (_) { /* sin información */ }

    const sw = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    punto(sw ? 'ok' : 'aviso', 'Funciona sin internet',
      sw ? 'La app abre aunque no haya señal.' : 'Abre la app una vez con internet para que quede lista.');

    punto('wakeLock' in navigator ? 'ok' : 'aviso', 'Pantalla encendida',
      'wakeLock' in navigator ? 'La pantalla no se apaga mientras lees manillas.'
        : 'Sube el tiempo de apagado en los ajustes del celular.');

    const r = Estado.resumen();
    punto(r.sinChip ? 'aviso' : 'ok', 'Manillas asignadas',
      r.sinChip ? r.sinChip + ' de ' + r.inscritos + ' corredores no tienen manilla. Solo se pueden registrar con el teclado.'
        : r.inscritos ? 'Todos los inscritos tienen manilla.' : 'Todavía no hay corredores.');

    const sinSalida = Estado.oleadas().filter(o => !o.horaSalida);
    punto(sinSalida.length ? 'aviso' : 'ok', 'Horas de salida',
      sinSalida.length ? 'Falta marcar: ' + sinSalida.map(o => o.nombre).join(', ') + '.'
        : 'Todas las salidas tienen su hora.');

    let eventos = 0;
    for (const t of est.tandas.values()) eventos += Estado.resumenTanda(t.id).eventos;
    punto('ok', 'Datos guardados',
      est.tandas.size + (est.tandas.size === 1 ? ' grupo · ' : ' grupos · ') +
      est.todos.size + ' corredores · ' + eventos + ' pasadas');

    UI.hoja({ titulo: 'Revisión del sistema', cuerpo });
  }

  /* ================= zona de riesgo ================= */

  async function datosDePrueba() {
    const ok = await UI.confirmar({
      titulo: 'Cargar datos de prueba',
      mensaje: 'Crea un grupo de ensayo con 40 corredores, 2 salidas separadas 35 segundos y ' +
               'vueltas inventadas, para practicar.\nNo toca los grupos que ya tengas.',
      confirmar: 'Sí, cargar', peligro: false
    });
    if (!ok) return;

    const nombres = ['Ana', 'Luis', 'Sofía', 'Mateo', 'Valeria', 'Samuel', 'Isabella', 'Tomás',
                     'Camila', 'Emilio', 'Lucía', 'Daniel', 'Salomé', 'Andrés', 'Mariana', 'Felipe',
                     'Antonia', 'Nicolás', 'Juliana', 'Martín'];
    const apellidos = ['Gómez', 'Rodríguez', 'Martínez', 'López', 'Ramírez', 'Torres', 'Castro', 'Vargas'];
    const cats = ['Infantil', 'Juvenil', 'Mayores'];

    const total = 5, ventana = 60, ms = ventana * 1000;
    const tanda = await Estado.crearTanda({
      nombre: 'Prueba ' + Util.horaCorta(Date.now()),
      vueltas: total, ventanaMinSeg: ventana,
      oleadas: [
        { id: 1, nombre: 'Salida 1', horaSalida: null },
        { id: 2, nombre: 'Salida 2', horaSalida: null }
      ]
    });

    const salida1 = Date.now() - (total + 1) * ms;
    const salida2 = salida1 + 35000;
    await Estado.guardarTandaPorId(tanda.id, {
      oleadas: [
        { id: 1, nombre: 'Salida 1', horaSalida: salida1 },
        { id: 2, nombre: 'Salida 2', horaSalida: salida2 }
      ]
    });

    const corredores = [];
    for (let i = 0; i < 40; i++) {
      const dorsal = 101 + i;
      corredores.push({
        id: Estado.claveCorredor(tanda.id, dorsal),
        tanda: tanda.id, dorsal,
        nombre: nombres[i % nombres.length] + ' ' + apellidos[i % apellidos.length],
        categoria: cats[i % cats.length],
        uid: '04:' + ('0' + (i + 1).toString(16).toUpperCase()).slice(-2) + ':DE:MO',
        oleada: i < 20 ? 1 : 2
      });
    }
    await DB.ponerVarios('corredores', corredores);

    const eventos = [];
    for (const c of corredores) {
      const salida = c.oleada === 1 ? salida1 : salida2;
      const ritmo = ms * (1 + Math.random() * 0.6);
      const vueltas = Math.min(total, 1 + Math.floor(Math.random() * total));
      let t = salida;
      for (let v = 0; v < vueltas; v++) {
        t += ritmo;
        eventos.push({ tanda: tanda.id, dorsal: c.dorsal, ts: Math.round(t), metodo: 'nfc', dispositivo: est.config.idDispositivo });
      }
    }
    await DB.ponerVarios('eventos', eventos);

    Estado.reconstruirCorredores(await DB.todo('corredores'));
    Estado.reconstruirEventos(await DB.todo('eventos'));
    await Estado.activarTanda(tanda.id);
    UI.aviso('Grupo de prueba creado', 'ok');
    App.tandaCambio();
  }

  async function borrarVueltas() {
    const ok = await UI.confirmar({
      titulo: 'Borrar las vueltas de «' + est.tandaActiva.nombre + '»',
      mensaje: 'Se borran ' + est.totalEventos + ' pasadas y las horas de salida de este grupo.\n' +
               'Los corredores y sus manillas se conservan. Los otros grupos no se tocan.\n' +
               'No se puede deshacer: comparte una copia antes si la necesitas.',
      confirmar: 'Sí, borrar las vueltas'
    });
    if (!ok) return;
    await Estado.borrarVueltas();
    UI.aviso('Vueltas borradas', 'neutro');
    App.tandaCambio();
  }

  async function borrarTodo() {
    let eventos = 0;
    for (const t of est.tandas.values()) eventos += Estado.resumenTanda(t.id).eventos;
    const ok = await UI.confirmar({
      titulo: 'Borrar todo',
      mensaje: 'Se borra TODO lo de este celular: ' + est.tandas.size + ' grupos, ' +
               est.todos.size + ' corredores y ' + eventos + ' pasadas.',
      confirmar: 'Continuar'
    });
    if (!ok) return;
    const seguro = await UI.confirmar({
      titulo: '¿Seguro?',
      mensaje: 'Última confirmación. Si no compartiste una copia, se pierde todo.',
      confirmar: 'Borrar definitivamente'
    });
    if (!seguro) return;
    await Estado.borrarTodo();
    UI.aviso('Todo borrado', 'neutro');
    App.tandaCambio();
  }

  /* ================= pantalla ================= */

  function pintar() {
    caja.innerHTML = '';
    const t = est.tandaActiva;
    const salidas = Estado.oleadas();
    const r = Estado.resumen();

    caja.append(tarjetaGrupo());

    const menu = UI.el('div', { clase: 'lista' }, [
      opcionMenu({
        icono: 'capas', titulo: 'Grupos',
        detalle: est.tandas.size + (est.tandas.size === 1 ? ' grupo creado' : ' grupos creados'),
        alPulsar: () => UI.hoja({ titulo: 'Grupos', cuerpo: Tandas.panelGrupos() })
      }),
      opcionMenu({
        icono: 'salida', titulo: 'Salidas de este grupo',
        detalle: salidas.length === 1 ? 'Una sola salida' : salidas.length + ' salidas escalonadas',
        alPulsar: () => UI.hoja({ titulo: 'Salidas de «' + t.nombre + '»', cuerpo: Tandas.panelSalidas() })
      }),
      opcionMenu({
        icono: 'celular', titulo: 'Este celular',
        detalle: est.config.idDispositivo + ' · ' + est.config.nombrePuesto,
        alPulsar: abrirCelular
      }),
      opcionMenu({
        icono: 'reloj', titulo: 'Verificar la hora',
        detalle: 'Compárala con los otros celulares antes de arrancar',
        alPulsar: abrirReloj
      })
    ]);
    caja.append(UI.el('h2', { clase: 'seccion-titulo', texto: 'Configuración' }), menu);

    const compartir = UI.el('div', { clase: 'lista' }, [
      opcionMenu({
        icono: 'grupo', titulo: 'Lista de corredores',
        detalle: 'Pásala a los otros celulares o recíbela',
        alPulsar: abrirLista
      }),
      opcionMenu({
        icono: 'capas', titulo: 'Juntar los datos de los celulares',
        detalle: 'Al final de la carrera',
        alPulsar: abrirUnion
      })
    ]);
    caja.append(UI.el('h2', { clase: 'seccion-titulo', texto: 'Compartir' }), compartir);

    const ayuda = UI.el('div', { clase: 'lista' }, [
      opcionMenu({
        icono: 'info', titulo: 'Revisión del sistema',
        detalle: r.sinChip ? r.sinChip + ' corredores sin manilla' : 'Todo listo',
        alPulsar: abrirRevision
      }),
      opcionMenu({
        icono: 'rayo', titulo: 'Cargar datos de prueba',
        detalle: 'Para practicar antes del día de la carrera',
        alPulsar: datosDePrueba
      })
    ]);
    caja.append(UI.el('h2', { clase: 'seccion-titulo', texto: 'Ayuda' }), ayuda);

    caja.append(
      UI.el('h2', { clase: 'seccion-titulo', texto: 'Borrar' }),
      UI.tarjeta({
        tono: 'peligro',
        cuerpo: UI.el('div', { clase: 'acciones acciones--apilada' }, [
          UI.boton({ texto: 'Borrar las vueltas de este grupo', icono: 'basura', tipo: 'peligro', alPulsar: borrarVueltas }),
          UI.boton({ texto: 'Borrar todo', icono: 'basura', tipo: 'peligro', alPulsar: borrarTodo })
        ])
      }),
      UI.el('p', {
        clase: 'campo__ayuda',
        style: 'text-align:center;margin:20px 0 8px',
        texto: 'Los datos se quedan en este celular. Solo salen cuando tú los compartes.'
      })
    );
  }

  /* ================= ciclo de vida ================= */

  async function iniciar() {
    caja = $('#ajustes-contenido');
    pintar();
  }

  function refrescar() { if (caja) pintar(); }

  return { iniciar, refrescar };
})();
