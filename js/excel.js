/* ============================================================
   excel.js — genera y lee archivos .xlsx de verdad, sin ninguna
   librería externa.

   Un .xlsx es un ZIP con XML adentro. Para el ZIP se usan
   CompressionStream / DecompressionStream('deflate-raw'), que
   Chrome trae de fábrica; para el XML, DOMParser.

   Sirve para la planilla de inscripción: el colegio la llena en
   Excel o en Google Sheets y la sube a la app.
   ============================================================ */
'use strict';

const Excel = (() => {

  /* ================= utilidades binarias ================= */

  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = TABLA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  const utf8 = s => new TextEncoder().encode(s);

  async function desinflar(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function inflar(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  /** Fecha y hora en el formato MS-DOS que usa el ZIP. */
  function fechaDos(d) {
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora, fecha };
  }

  /* ================= ZIP: escritura ================= */

  async function crearZip(archivos) {
    const { hora, fecha } = fechaDos(new Date());
    const locales = [];
    const central = [];
    let desplazamiento = 0;

    for (const a of archivos) {
      const crudo = typeof a.contenido === 'string' ? utf8(a.contenido) : a.contenido;
      const comprimido = await desinflar(crudo);
      const usarDeflate = comprimido.length < crudo.length;
      const datos = usarDeflate ? comprimido : crudo;
      const metodo = usarDeflate ? 8 : 0;
      const nombre = utf8(a.nombre);
      const crc = crc32(crudo);

      const local = new Uint8Array(30 + nombre.length);
      const vl = new DataView(local.buffer);
      vl.setUint32(0, 0x04034b50, true);
      vl.setUint16(4, 20, true);
      vl.setUint16(6, 0x0800, true);      // nombres en UTF-8
      vl.setUint16(8, metodo, true);
      vl.setUint16(10, hora, true);
      vl.setUint16(12, fecha, true);
      vl.setUint32(14, crc, true);
      vl.setUint32(18, datos.length, true);
      vl.setUint32(22, crudo.length, true);
      vl.setUint16(26, nombre.length, true);
      vl.setUint16(28, 0, true);
      local.set(nombre, 30);
      locales.push(local, datos);

      const cab = new Uint8Array(46 + nombre.length);
      const vc = new DataView(cab.buffer);
      vc.setUint32(0, 0x02014b50, true);
      vc.setUint16(4, 20, true);
      vc.setUint16(6, 20, true);
      vc.setUint16(8, 0x0800, true);
      vc.setUint16(10, metodo, true);
      vc.setUint16(12, hora, true);
      vc.setUint16(14, fecha, true);
      vc.setUint32(16, crc, true);
      vc.setUint32(20, datos.length, true);
      vc.setUint32(24, crudo.length, true);
      vc.setUint16(28, nombre.length, true);
      vc.setUint32(42, desplazamiento, true);
      cab.set(nombre, 46);
      central.push(cab);

      desplazamiento += local.length + datos.length;
    }

    const tamCentral = central.reduce((n, c) => n + c.length, 0);
    const fin = new Uint8Array(22);
    const vf = new DataView(fin.buffer);
    vf.setUint32(0, 0x06054b50, true);
    vf.setUint16(8, archivos.length, true);
    vf.setUint16(10, archivos.length, true);
    vf.setUint32(12, tamCentral, true);
    vf.setUint32(16, desplazamiento, true);

    const partes = locales.concat(central, [fin]);
    const total = partes.reduce((n, p) => n + p.length, 0);
    const salida = new Uint8Array(total);
    let i = 0;
    for (const p of partes) { salida.set(p, i); i += p.length; }
    return salida;
  }

  /* ================= ZIP: lectura ================= */

  async function leerZip(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let fin = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error('El archivo no es un .xlsx válido (no se encontró el índice del ZIP).');

    const cantidad = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const entradas = {};

    for (let n = 0; n < cantidad; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true);
      const tamComprimido = v.getUint32(p + 20, true);
      const largoNombre = v.getUint16(p + 28, true);
      const largoExtra = v.getUint16(p + 30, true);
      const largoComentario = v.getUint16(p + 32, true);
      const desplazamiento = v.getUint32(p + 42, true);
      const nombre = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + largoNombre));

      const lNombre = v.getUint16(desplazamiento + 26, true);
      const lExtra = v.getUint16(desplazamiento + 28, true);
      const inicio = desplazamiento + 30 + lNombre + lExtra;
      const datos = bytes.subarray(inicio, inicio + tamComprimido);

      entradas[nombre] = metodo === 8 ? await inflar(datos) : datos;
      p += 46 + largoNombre + largoExtra + largoComentario;
    }
    return entradas;
  }

  /* ================= XML ================= */

  function escapar(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  const LETRAS = n => {
    let s = '';
    n += 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  };

  /** filas: [[valor, ...], ...]. La primera fila se pinta como encabezado. */
  function hojaXml(filas, anchos) {
    const cols = anchos && anchos.length
      ? '<cols>' + anchos.map((a, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('') + '</cols>'
      : '';

    const cuerpo = filas.map((fila, f) => {
      const celdas = fila.map((valor, c) => {
        const ref = LETRAS(c) + (f + 1);
        const estilo = f === 0 ? ' s="1"' : '';
        if (valor == null || valor === '') return `<c r="${ref}"${estilo}/>`;
        if (typeof valor === 'number' && isFinite(valor)) {
          return `<c r="${ref}"${estilo}><v>${valor}</v></c>`;
        }
        return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
      }).join('');
      return `<row r="${f + 1}">${celdas}</row>`;
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (filas.length ? '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '</sheetView></sheetViews>' : '') +
      cols + '<sheetData>' + cuerpo + '</sheetData></worksheet>';
  }

  const ESTILOS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F6F4A"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    // Sin este estilo con nombre, algunos lectores avisan de que falta el estilo por defecto.
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /** hojas: [{ nombre, filas, anchos }] */
  async function crearLibro(hojas) {
    const archivos = [];

    archivos.push({
      nombre: '[Content_Types].xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        ).join('') +
        '</Types>'
    });

    archivos.push({
      nombre: '_rels/.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });

    archivos.push({
      nombre: 'xl/workbook.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        hojas.map((h, i) =>
          `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
        ).join('') +
        '</sheets></workbook>'
    });

    archivos.push({
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        ).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    });

    archivos.push({ nombre: 'xl/styles.xml', contenido: ESTILOS });

    hojas.forEach((h, i) => {
      archivos.push({
        nombre: `xl/worksheets/sheet${i + 1}.xml`,
        contenido: hojaXml(h.filas, h.anchos)
      });
    });

    return crearZip(archivos);
  }

  /* ================= lectura de un libro ================= */

  function textoDeCelda(c, compartidas) {
    const tipo = c.getAttribute('t');
    if (tipo === 'inlineStr') {
      const is = c.getElementsByTagName('t');
      return is.length ? Array.from(is).map(t => t.textContent).join('') : '';
    }
    const v = c.getElementsByTagName('v')[0];
    if (!v) return '';
    if (tipo === 's') {
      const i = Number(v.textContent);
      return compartidas[i] != null ? compartidas[i] : '';
    }
    return v.textContent;
  }

  const COLUMNA = ref => {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return 0;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  /** Devuelve las filas de la primera hoja como arreglo de arreglos de texto. */
  async function leerLibro(bytes) {
    const entradas = await leerZip(bytes);
    const dec = new TextDecoder();
    const parser = new DOMParser();

    let compartidas = [];
    if (entradas['xl/sharedStrings.xml']) {
      const doc = parser.parseFromString(dec.decode(entradas['xl/sharedStrings.xml']), 'application/xml');
      compartidas = Array.from(doc.getElementsByTagName('si')).map(si =>
        Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''));
    }

    const nombreHoja = Object.keys(entradas)
      .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort()[0];
    if (!nombreHoja) throw new Error('El archivo de Excel no tiene ninguna hoja.');

    const doc = parser.parseFromString(dec.decode(entradas[nombreHoja]), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('No se pudo leer el contenido del archivo de Excel.');
    }

    const filas = [];
    for (const fila of Array.from(doc.getElementsByTagName('row'))) {
      const salida = [];
      for (const c of Array.from(fila.getElementsByTagName('c'))) {
        salida[COLUMNA(c.getAttribute('r'))] = textoDeCelda(c, compartidas).trim();
      }
      for (let i = 0; i < salida.length; i++) if (salida[i] == null) salida[i] = '';
      filas.push(salida);
    }
    return filas;
  }

  /* ================= CSV ================= */

  /** Analiza CSV respetando comillas y separadores , ; o tabulación. */
  function leerCsv(texto) {
    texto = texto.replace(/^﻿/, '');
    const primera = (texto.split(/\r?\n/)[0] || '');
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';'
              : (primera.indexOf('\t') >= 0 && primera.indexOf(',') < 0) ? '\t' : ',';

    const filas = [];
    let fila = [], campo = '', enComillas = false;

    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (enComillas) {
        if (ch === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else enComillas = false;
        } else campo += ch;
        continue;
      }
      if (ch === '"') { enComillas = true; continue; }
      if (ch === sep) { fila.push(campo.trim()); campo = ''; continue; }
      if (ch === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = ''; continue; }
      if (ch === '\r') continue;
      campo += ch;
    }
    if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
    return filas.filter(f => f.some(c => c !== ''));
  }

  /** Lee un archivo subido: .xlsx, .csv o texto pegado. */
  async function leerArchivo(archivo) {
    const nombre = (archivo.name || '').toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xlsm')) {
      return leerLibro(new Uint8Array(await archivo.arrayBuffer()));
    }
    if (nombre.endsWith('.xls')) {
      throw new Error('El formato .xls antiguo no se puede leer. Ábrelo en Excel y guárdalo como .xlsx.');
    }
    const texto = await archivo.text();
    return leerCsv(texto);
  }

  return { crearLibro, leerLibro, leerCsv, leerArchivo, crearZip, leerZip };
})();
