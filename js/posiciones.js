/* ============================================================
   posiciones.js — resultados.

   En un celular una tabla obliga a desplazarse de lado y el
   profesor pierde de vista quién va ganando. Aquí cada corredor
   es una tarjeta que cabe completa en la pantalla.
   ============================================================ */
'use strict';

const Posiciones = (() => {

  const $ = Util.$;
  const est = Estado.est;

  let categoria = '';
  let oleadaId = 0;
  let orden = 'neto';

  let cajaCifras, cajaControles, cajaLista;

  /* ================= cifras ================= */

  function pintarCifras() {
    const r = Estado.resumen();
    cajaCifras.innerHTML = '';
    const caja = UI.el('div', { clase: 'cifras' });
    for (const [num, etq] of [[r.inscritos, 'Inscritos'], [r.vueltas, 'Vueltas'], [r.terminados, 'Terminaron']]) {
      caja.append(UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: String(num) }),
        UI.el('span', { clase: 'cifra__etq', texto: etq })
      ]));
    }
    cajaCifras.append(caja);
  }

  /* ================= controles ================= */

  function filtrosActivos() {
    let n = 0;
    if (categoria) n++;
    if (oleadaId) n++;
    return n;
  }

  function pintarControles() {
    cajaControles.innerHTML = '';
    const salidas = Estado.oleadas();

    const seg = UI.segmentado({
      opciones: [
        { valor: 'neto', texto: 'Por tiempo' },
        { valor: 'llegada', texto: 'Por llegada' }
      ],
      valor: orden,
      alCambiar: v => { orden = v; pintarLista(); pintarControles(); }
    });

    const explicacion = UI.el('p', {
      clase: 'campo__ayuda',
      style: 'margin-top:8px',
      texto: orden === 'neto'
        ? 'Cuenta desde la salida de cada grupo. Es el orden justo cuando no todos salen a la vez.'
        : 'El orden en que cruzaron la meta, tal como lo vio el juez.'
    });

    const nActivos = filtrosActivos();
    const btnFiltros = UI.boton({
      texto: nActivos ? 'Filtros (' + nActivos + ')' : 'Filtrar',
      icono: 'filtro',
      ancho: 'completo',
      alPulsar: abrirFiltros
    });
    if (nActivos) btnFiltros.classList.add('esta-activo');

    const cuerpo = UI.el('div', {}, [seg, explicacion]);
    if (Estado.categorias().length || salidas.length > 1) {
      cuerpo.append(UI.el('div', { style: 'height:12px' }), btnFiltros);
    }
    cajaControles.append(UI.tarjeta({ cuerpo }));

    const sinSalida = salidas.filter(o => !o.horaSalida);
    if (est.totalEventos && sinSalida.length && orden === 'neto') {
      cajaControles.append(UI.nota({
        tono: 'ojo',
        texto: salidas.length > 1
          ? 'Sin hora de salida en: ' + sinSalida.map(o => o.nombre).join(', ') +
            '. El tiempo de esos corredores se mide desde la primera vuelta de alguien, ' +
            'así que todavía no es comparable. Márcala en Carrera → Salidas.'
          : 'Este grupo no tiene hora de salida, así que el tiempo se mide desde la primera ' +
            'vuelta registrada. Puedes ponerla en Carrera → Salidas.'
      }));
    }
  }

  async function abrirFiltros() {
    const cats = Estado.categorias();
    const salidas = Estado.oleadas();

    const selCat = UI.selector({
      etiqueta: 'Categoría',
      opciones: [{ valor: '', texto: 'Todas las categorías' }]
        .concat(cats.map(c => ({ valor: c, texto: c }))),
      valor: categoria
    });
    const selSalida = salidas.length > 1 ? UI.selector({
      etiqueta: 'Salida',
      opciones: [{ valor: 0, texto: 'Todas las salidas' }]
        .concat(salidas.map(o => ({ valor: o.id, texto: o.nombre }))),
      valor: oleadaId
    }) : null;

    const cuerpo = UI.el('div', {}, [cats.length ? selCat : null, selSalida]);

    const r = await UI.hoja({
      titulo: 'Filtrar resultados',
      cuerpo,
      acciones: [
        { texto: 'Aplicar', tipo: 'principal', valor: 'ok' },
        { texto: 'Quitar filtros', valor: 'limpiar' }
      ]
    });
    if (!r) return;
    if (r === 'limpiar') { categoria = ''; oleadaId = 0; }
    else {
      categoria = cats.length ? selCat.obtenerValor() : '';
      oleadaId = selSalida ? Number(selSalida.obtenerValor()) || 0 : 0;
    }
    pintarControles();
    pintarLista();
  }

  /* ================= lista ================= */

  function pintarLista() {
    cajaLista.innerHTML = '';
    const total = Estado.vueltas();
    const filas = Estado.posiciones(categoria, oleadaId, orden);
    const salidas = Estado.oleadas();

    if (!est.corredores.size) {
      cajaLista.append(UI.tarjeta({
        cuerpo: UI.vacio({
          icono: 'grupo',
          titulo: 'Todavía no hay corredores',
          mensaje: 'Inscríbelos para ver los resultados aquí.'
        })
      }));
      return;
    }
    if (!filas.length) {
      cajaLista.append(UI.tarjeta({
        cuerpo: UI.vacio({ icono: 'filtro', titulo: 'Ningún corredor con ese filtro' })
      }));
      return;
    }

    const lista = UI.el('div', { clase: 'lista' });
    for (const f of filas) {
      const meta = ['Dorsal ' + f.dorsal];
      if (f.categoria) meta.push(f.categoria);
      if (salidas.length > 1 && f.nombreOleada) meta.push(f.nombreOleada);

      const pct = total ? Math.min(100, Math.round(f.vueltas / total * 100)) : 0;

      lista.append(UI.el('button', {
        type: 'button',
        clase: 'puesto' +
               (f.terminado ? ' puesto--termino' : '') +
               (f.posicion <= 3 && f.vueltas > 0 ? ' puesto--podio' : ''),
        onclick: () => abrirDetalle(f)
      }, [
        UI.el('span', { clase: 'puesto__numero', texto: f.vueltas ? String(f.posicion) : '—' }),
        UI.el('span', { clase: 'puesto__cuerpo' }, [
          UI.el('span', { clase: 'puesto__nombre', texto: f.nombre || 'Dorsal ' + f.dorsal }),
          UI.el('span', { clase: 'puesto__meta', texto: meta.join(' · ') }),
          UI.el('span', { clase: 'progreso' }, [
            UI.el('span', { clase: 'progreso__relleno', style: 'width:' + pct + '%' })
          ])
        ]),
        UI.el('span', { clase: 'puesto__derecha' }, [
          UI.el('span', {
            clase: 'puesto__tiempo',
            texto: f.tiempo != null ? Util.duracion(f.tiempo) + (f.salidaEstimada ? '*' : '') : '—'
          }),
          UI.el('span', { clase: 'puesto__vueltas', texto: f.vueltas + ' de ' + total })
        ])
      ]));
    }
    cajaLista.append(lista);

    if (filas.some(f => f.salidaEstimada && f.tiempo != null)) {
      cajaLista.append(UI.nota({
        tono: 'info',
        texto: '* El tiempo de estos corredores no arranca en una hora de salida real, ' +
               'sino en la primera vuelta registrada del grupo.'
      }));
    }

    cajaLista.append(UI.el('div', { style: 'height:12px' }));
    cajaLista.append(UI.boton({
      texto: 'Compartir resultados', icono: 'compartir', tipo: 'principal',
      ancho: 'completo', alPulsar: abrirExportar
    }));
  }

  function abrirDetalle(f) {
    const eventos = Estado.eventosDe(f.dorsal);
    const total = Estado.vueltas();
    const salida = f.salida;

    const cuerpo = UI.el('div');
    cuerpo.append(UI.el('div', { clase: 'cifras' }, [
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: f.vueltas ? String(f.posicion) : '—' }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Puesto' })
      ]),
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: f.vueltas + '/' + total }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Vueltas' })
      ]),
      UI.el('div', { clase: 'cifra' }, [
        UI.el('span', { clase: 'cifra__num', texto: f.tiempo != null ? Util.duracion(f.tiempo) : '—' }),
        UI.el('span', { clase: 'cifra__etq', texto: 'Tiempo' })
      ])
    ]));

    if (salida != null) {
      cuerpo.append(UI.el('p', {
        clase: 'campo__ayuda', style: 'margin-bottom:12px',
        texto: (f.salidaEstimada ? 'Sin hora de salida real. Se cuenta desde ' : 'Salió a las ') +
               Util.hora(salida) + '.'
      }));
    }

    if (eventos.length) {
      cuerpo.append(UI.el('h3', { style: 'font-size:15px;margin-bottom:8px', texto: 'Vueltas' }));
      const lista = UI.el('div', { clase: 'lista' });
      eventos.forEach((ev, i) => {
        const desde = i === 0 ? salida : eventos[i - 1].ts;
        lista.append(UI.el('div', { clase: 'fila' }, [
          UI.el('span', { clase: 'fila__dorsal', texto: String(i + 1) }),
          UI.el('div', { clase: 'fila__cuerpo' }, [
            UI.el('div', { clase: 'fila__titulo', texto: Util.hora(ev.ts) }),
            UI.el('div', {
              clase: 'fila__meta',
              texto: (desde != null ? 'Vuelta en ' + Util.duracion(ev.ts - desde) : '') +
                     (ev.dispositivo ? ' · ' + ev.dispositivo : '')
            })
          ])
        ]));
      });
      cuerpo.append(lista);
    } else {
      cuerpo.append(UI.vacio({ icono: 'reloj', titulo: 'Todavía no ha pasado por la meta' }));
    }

    UI.hoja({ titulo: f.nombre || 'Dorsal ' + f.dorsal, descripcion: 'Dorsal ' + f.dorsal, cuerpo });
  }

  /* ================= exportar ================= */

  async function abrirExportar() {
    const selQue = UI.selector({
      etiqueta: 'Qué compartir',
      opciones: [
        { valor: 'pos-csv', texto: 'Resultados', ayuda: 'La tabla de posiciones, para abrir en Excel.' },
        { valor: 'ev-csv', texto: 'Todas las vueltas', ayuda: 'Una fila por vuelta, con su hora.' },
        { valor: 'padron-csv', texto: 'Lista de corredores', ayuda: 'Dorsales, nombres y manillas.' },
        { valor: 'json', texto: 'Copia de seguridad', ayuda: 'Para juntar con los otros celulares al final.' }
      ],
      valor: 'pos-csv'
    });
    const selAlcance = UI.selector({
      etiqueta: 'De qué grupos',
      opciones: [
        { valor: 'activa', texto: 'Solo «' + est.tandaActiva.nombre + '»' },
        { valor: 'todas', texto: 'Todos los grupos del día' }
      ],
      valor: 'activa'
    });

    const cuerpo = UI.el('div', {}, [
      selQue, selAlcance,
      UI.nota({
        tono: 'info', icono: 'candado',
        texto: 'Los datos solo salen de este celular cuando tú los compartes. ' +
               'Contienen nombres de menores de edad.'
      })
    ]);

    const r = await UI.hoja({
      titulo: 'Compartir resultados',
      cuerpo,
      acciones: [
        { texto: 'Compartir', icono: 'compartir', tipo: 'principal', valor: 'compartir' },
        { texto: 'Guardar archivo', icono: 'descargar', valor: 'descargar' },
        { texto: 'Copiar al portapapeles', icono: 'copiar', valor: 'copiar' }
      ]
    });
    if (!r) return;

    const p = Exportar.paquete(selQue.obtenerValor(), {
      alcance: selAlcance.obtenerValor(),
      categoria, oleada: oleadaId, modo: orden
    });
    if (r === 'descargar') Util.descargar(p.nombre, p.contenido, p.mime);
    else if (r === 'compartir') Util.compartir(p.nombre, p.contenido, p.mime);
    else Util.copiar(p.contenido);
  }

  /* ================= ciclo de vida ================= */

  function iniciar() {
    cajaCifras = $('#posiciones-cifras');
    cajaControles = $('#posiciones-controles');
    cajaLista = $('#posiciones-lista');
    refrescar();
  }

  function refrescar() {
    if (!cajaCifras) return;
    if (!Estado.categorias().includes(categoria)) categoria = '';
    if (!Estado.oleadas().some(o => o.id === oleadaId)) oleadaId = 0;
    pintarCifras();
    pintarControles();
    pintarLista();
  }

  return { iniciar, refrescar };
})();
