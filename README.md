# Registro de Vueltas — Carrera Escolar

PWA offline-first para cronometrar vueltas con manillas NFC (NTAG213) en una
carrera de atletismo escolar. HTML, CSS y JavaScript sin frameworks ni
dependencias. Todo en español, hora local de Bogotá en formato 24 h.

Pensada para: varios grupos de ~300 corredores que corren uno después de otro
reutilizando las mismas manillas y los mismos dorsales, con salidas escalonadas,
varios profesores leyendo en la meta y sin wifi ni datos en la cancha.

---

## 1. Los tres conceptos

Antes de tocar nada conviene tener claros estos tres, porque todo lo demás se
deriva de ellos.

### TANDA — un grupo que corre junto

Una tanda es una carrera completa: sus corredores, sus dorsales, sus manillas y
sus vueltas. **El dorsal 101 de la tanda de la mañana y el 101 de la tanda de la
tarde son dos personas distintas**, y la app los trata como tales: los eventos,
la deduplicación y la tabla de posiciones nunca se cruzan entre tandas.

Eso es lo que permite reutilizar dorsales y manillas: creas una tanda nueva y
los mismos números vuelven a estar libres, sin borrar ni pisar los datos de la
anterior.

La tanda activa se elige en la barra que está justo debajo de la cabecera, y
está visible en todas las pantallas. Cada tanda tiene su propio número de
vueltas y su propia ventana de deduplicación: un grupo de pequeños puede correr
3 vueltas y el de mayores 6.

Cada tanda tiene un código corto (`T-4K9P`). Ese código es lo que hace que
todos los celulares sepan que están trabajando sobre la misma tanda, y viaja
dentro del padrón y de cada exportación.

### OLEADA — una salida escalonada dentro de una tanda

Si el grupo sale por tandas de 30–40 segundos, crea una oleada por salida. Cada
oleada tiene su propia **hora de salida**, y el tiempo de cada corredor se mide
desde la salida de SU oleada.

Sin esto, el que salió primero gana siempre por 35 segundos regalados. Con esto,
la tabla puede ordenarse de dos maneras:

- **Tiempo neto** — descuenta la salida de cada oleada. Es la clasificación justa.
- **Hora de llegada** — el orden tal como se cruza la meta. Es lo que ve el juez.

Ejemplo real de la app, con dos oleadas separadas 35 s y todos con 2 vueltas:

| Corredor | Oleada | Cruza la meta | Tiempo neto |
| -------- | ------ | ------------- | ----------- |
| A | 1 | 08:03:20 | 3:20 |
| C | 2 | 08:03:35 | **3:00** |
| B | 1 | 08:04:00 | 4:00 |
| D | 2 | 08:04:55 | 4:20 |

Por llegada gana A. Por tiempo neto gana C, que es quien realmente corrió más
rápido. Los dos órdenes están disponibles y se exportan.

### MANILLA — el chip, que va y viene

La app guarda el **historial completo de cada manilla**: a qué dorsal y a qué
persona perteneció en cada tanda. Ese historial es lo que hace rápida la
reinscripción (sección 3).

---

## 2. Despliegue en Netlify

El sitio es estático: no hay build ni dependencias.

**Arrastrando la carpeta:** entra a <https://app.netlify.com/drop> y arrastra la
carpeta `carrera-vueltas` completa. Netlify entrega la URL en https, que es lo
que Web NFC exige.

**Desde Git:** build command vacío, publish directory `.`.

`netlify.toml` y `_headers` ya traen las cabeceras necesarias: `sw.js` sin caché
(para que las actualizaciones lleguen) y cabeceras de seguridad básicas.

**Después de desplegar**, en cada celular:

1. Abre la URL **en Chrome para Android** (no dentro de WhatsApp ni Gmail).
2. Menú ⋮ → «Instalar aplicación» / «Añadir a pantalla de inicio».
3. Ábrela una vez con red: el service worker precarga todo y a partir de ahí
   funciona completa sin conexión.
4. Ve a **Ajustes → Diagnóstico** y confirma que todo esté en verde.

**Requisitos:** Chrome para Android 124 o superior con NFC activado. Web NFC no
existe en iPhone ni en Chrome de escritorio; ahí la app arranca automáticamente
en **modo teclado**, que sirve perfectamente como respaldo.

---

## 3. Reutilizar las manillas entre tandas

Hay dos caminos. Cuál te sirve depende de una sola pregunta: **¿la manilla va
pegada a un número de dorsal fijo?**

### Camino A — la manilla y el dorsal van juntos (el rápido)

Si la manilla lleva impreso o pegado su número, y ese número se reparte con su
peto correspondiente, entonces la pareja dorsal↔manilla nunca cambia. En ese
caso **no hay que volver a escanear nada**.

1. **Ajustes → Tandas → Nueva tanda**.
2. En «Reutilizar manillas de», elige la tanda anterior.
3. Crear.

La tanda nueva nace con todos los dorsales y todas sus manillas ya vinculadas, y
los nombres en blanco. Los organizadores solo escriben los nombres (o ni
siquiera: la app funciona con dorsales sin nombre y los nombres se pueden pegar
después con la carga masiva).

Si es literalmente la misma gente corriendo otra vez, marca también «Copiar
también los nombres» y la tanda queda lista de una.

### Camino B — las manillas se reparten al azar (el exprés)

Si las manillas se entregan como salgan, usa **Inscripción → Inscripción exprés
por manilla**:

1. Pulsa «Escanear manilla e inscribir». El lector queda encendido.
2. Acerca una manilla. La app la reconoce y te muestra a quién perteneció en
   las tandas anteriores, y **propone ese mismo dorsal si está libre**.
3. Escribes el nombre y pulsas «Guardar y seguir».
4. El formulario se cierra solo y queda listo para la siguiente manilla.

Es una manilla por persona, sin escribir números salvo que quieras cambiarlos.
Mientras el formulario está abierto, la app ignora otras lecturas para que una
manilla suelta no te pise el registro a medias.

### Si sobra o falta

- Una manilla ya vinculada en la tanda activa se avisa en rojo antes de que la
  reasignes.
- Una manilla que llega a la meta sin estar vinculada **no pierde la vuelta**:
  se guarda como marca pendiente con su hora exacta y con el UID. Cuando después
  le pones el dorsal, la app registra la vuelta con la hora original **y de paso
  vincula la manilla** a ese corredor.

---

## 4. Varios organizadores inscribiendo a la vez

Reinscribir 300 personas entre tandas es el cuello de botella. La app está
pensada para repartirlo entre los mismos profesores que luego leen en la meta.

**Antes de repartir el trabajo:**

1. Un celular crea la tanda y exporta el padrón
   (**Ajustes → Padrón → Exportar**).
2. Los demás lo importan (**Importar padrón desde archivo → Fusionar**). Como el
   padrón lleva el código de la tanda dentro, todos quedan inscribiendo sobre la
   **misma** tanda, y la unión posterior no tiene que adivinar nada.
3. En cada celular, **Ajustes → Configuración → Inscribe dorsales desde / hasta**:
   CEL-1 del 1 al 100, CEL-2 del 101 al 200, CEL-3 del 201 al 300.

Con el rango puesto, el dorsal se autoincrementa dentro de tu tramo y la app
avisa si escribes uno fuera de él. Es la forma barata de que dos organizadores
no le den el mismo número a dos personas distintas.

**Al terminar de inscribir**, cada uno exporta su JSON y se unen igual que los
resultados (sección 5, paso 7). La unión reporta cualquier choque que haya
quedado: mismo dorsal con dos nombres distintos, o la misma manilla en dos
dorsales. Conserva siempre lo que ya tenía el celular que une y lista el resto
para que lo arregles a mano.

---

## 5. Flujo del día de la carrera

### Antes (días previos, con wifi)

**Paso 1 — Crear la primera tanda** (Ajustes → Tandas → Nueva tanda): nombre,
vueltas, ventana mínima y cuántas oleadas tendrá.

**Paso 2 — Inscribir y vincular** en un celular, o repartido entre varios como
explica la sección 4. Formas de cargar gente:

- Uno a uno en **Inscribir a mano**.
- **Carga masiva**: pega `dorsal,nombre,categoria,oleada` (una línea por
  corredor; la oleada es opcional), pulsa **Vista previa**, revisa los avisos y
  confirma.
- **Inscripción exprés por manilla** (sección 3, camino B).

Si las oleadas se reparten por número de dorsal, usa
**Ajustes → Oleadas → Repartir inscritos entre oleadas** e indica desde qué
dorsal empieza cada una.

**Paso 3 — Ajustes de cada celular:**

| Campo | Qué significa |
| ----- | ------------- |
| Nombre del evento | El día completo: «Día del deporte 2026». |
| Nombre de la tanda activa | El grupo: «Primaria mañana». |
| Vueltas para terminar | De esta tanda. Cambiarlo **nunca borra eventos**. |
| Ventana mínima entre vueltas | Segundos que deben pasar para aceptar otra marca del mismo dorsal. Ponla algo por debajo del tiempo de vuelta del corredor más rápido de esa tanda. |
| Dígitos del dorsal | Cuántos dígitos tiene un dorsal; el teclado registra al completarlos. |
| Nombre del puesto | «Meta izquierda», «Meta derecha»… |
| Identificador del dispositivo | **Distinto en cada celular** (CEL-1, CEL-2…). Viaja en cada evento y sale en el reporte de descartes. |
| Inscribe dorsales desde / hasta | El tramo de este organizador (sección 4). |

**Paso 4 — Exportar el padrón e importarlo en los demás celulares.** Después de
importar, verifica en cada uno su identificador de dispositivo y su puesto: el
padrón no los sobrescribe.

### El día, antes de arrancar

**Paso 5 — Verificar relojes.** Abre **Ajustes → Verificar hora** en todos los
celulares a la vez y compara el reloj gigante. La deduplicación entre
dispositivos y los tiempos netos comparan horas: si un celular va 30 segundos
adelantado, marcas repetidas pueden colarse como vueltas distintas. Activa «hora
automática de la red» en todos.

**Paso 6 — Preparar cada celular.** Brillo al máximo, ahorro de energía
desactivado, y en **Carrera** pulsa **Activar lectura NFC**. La app mantiene la
pantalla encendida mientras la lectura está activa.

### Durante la carrera

**Dar las salidas.** En **Carrera → Salidas** hay un botón grande por oleada.
Púlsalo **en el momento exacto del disparo**. Queda la hora y un cronómetro en
vivo. Si se te olvidó, «Corregir» permite escribir la hora a mano.

Basta con que **un** celular marque las salidas: al unir, la hora se propaga a
los demás.

**Leer.** Acerca la manilla al centro de la parte trasera del celular. El panel
grande responde con **color, sonido y vibración distintos**:

- **Verde**, pitido corto: vuelta válida. Muestra «Vuelta N de M», la oleada y
  el tiempo neto.
- **Ámbar**, fanfarria ascendente: vuelta final, el corredor terminó.
- **Rojo**, dos tonos graves: rechazada, con el motivo (repetida, no inscrito,
  ya terminó) y la hora y el celular de la marca anterior.

**Respaldos:** teclado numérico si una manilla no lee, «Marcar sin identificar»
si alguien pasa sin que alcances a leerlo (guarda la hora exacta y le pones el
dorsal después), «Deshacer último» y el historial de las últimas diez lecturas.

### Entre una tanda y la siguiente

1. Exporta el JSON de cada celular (paso 7). Hazlo **antes** de cambiar de
   tanda; así si algo sale mal tienes el respaldo.
2. Crea la tanda siguiente heredando las manillas (sección 3).
3. Exporta el padrón nuevo y compártelo con los demás celulares.
4. Reinscribe.

Los datos de la tanda anterior siguen ahí: se consultan cambiando la tanda
activa en la barra superior.

### Al terminar

**Paso 7 — Exportar cada dispositivo.** En cada celular:
**Posiciones → Exportar → Respaldo completo (JSON)**, alcance **Todas las
tandas**, y **Descargar** (o **Compartir**). Hazlo en **todos**, incluido el que
va a hacer la unión.

**Paso 8 — Unir.** En un solo celular (o en un computador con la misma URL):
**Ajustes → Unir dispositivos → Cargar archivos JSON** y selecciona todos.

Primero la app muestra **a qué tanda corresponde cada grupo**. Si todos
importaron el mismo padrón, ya viene resuelto y solo hay que seguir; solo se
toca si alguien creó la tanda por su cuenta. Pulsa **Calcular la unión** y verás,
antes de aplicar nada:

- cuántas vueltas quedan válidas y cuántas se descartan;
- los **conflictos de inscripción** (mismo dorsal con dos nombres, misma manilla
  en dos dorsales);
- el resumen por tanda y por dispositivo;
- el **reporte de descartes**: tanda, dorsal, las dos horas y los dos
  dispositivos, descargable en CSV;
- aviso si hay marcas de dorsales que nadie inscribió.

Pulsa **Aplicar unión**. Se guarda un respaldo automático: **Deshacer la última
unión** revierte todo si algo salió mal.

**Paso 9 — Resultados.** En **Posiciones**: filtra por categoría y por oleada,
elige el orden (tiempo neto o llegada) y exporta **Posiciones (CSV)**,
**Eventos (CSV)**, **Padrón con manillas (CSV)** o el **JSON completo**, por
descarga, Compartir o copia al portapapeles.

---

## 6. Cómo funciona la deduplicación

> Una lectura de un dorsal se descarta si ese mismo dorsal ya tiene un evento
> dentro de `ventanaMinSeg` segundos, **sin importar de qué dispositivo venga**.

Se aplica en dos momentos:

1. **Al registrar en el dispositivo.** Los eventos están indexados en memoria
   por tanda y dorsal (`Map dorsal → array ordenado por hora`). Cada lectura
   hace una búsqueda binaria sobre las pocas vueltas de ese dorsal, no un
   recorrido del arreglo completo. Se mira hacia atrás **y hacia adelante**,
   porque una marca pendiente asignada más tarde puede caer entre dos eventos ya
   guardados.

2. **Al unir los archivos de todos los dispositivos.** Se mezcla todo (incluido
   lo del celular que une), se descartan duplicados exactos por
   `dispositivo + tanda + id`, se ordena cronológicamente y se conserva la
   **primera** marca de cada `tanda + dorsal` en cada ventana. El resto va al
   reporte de descartes.

La agrupación por `tanda + dorsal` es lo que hace seguro reutilizar números: el
101 de la mañana nunca descarta una marca del 101 de la tarde. Cada tanda aplica
además **su propia** ventana.

Medido en el navegador con **3 tandas, 900 corredores y 15.300 eventos**:

| Operación | Tiempo |
| --------- | ------ |
| Carga e indexado completo | ~114 ms |
| Comprobación de conflicto por lectura | ~0,0014 ms |
| Tabla de posiciones de 300 corredores | ~0,8 ms |
| Cambiar de tanda activa | ~0,2 ms |
| Deduplicación global de 15.300 eventos | ~13 ms |

### Orden de la tabla

Siempre vueltas descendente primero. A igual número de vueltas:

- **Tiempo neto** (por defecto): desde la salida de su oleada hasta su última
  marca, ascendente.
- **Hora de llegada**: hora de la última marca, ascendente.

Si una oleada no tiene hora de salida registrada, su tiempo se mide desde la
primera marca de la tanda y aparece marcado con `*`, tanto en pantalla como en
el CSV (columna `salida_estimada`). La pestaña Posiciones avisa en amarillo
cuando eso pasa.

---

## 7. Datos y privacidad

- **Los datos nunca salen del dispositivo** salvo cuando tú exportas. No hay
  servidor, ni analítica, ni peticiones de red después de la primera carga.
- Son **nombres de menores de edad**: comparte los archivos solo por los canales
  que autorice el colegio y borra los datos de los celulares prestados al
  terminar (**Ajustes → Borrar todo**).
- Todo se guarda en **IndexedDB**, en cada escritura (no al final): si el
  navegador se cierra o el celular se apaga, no se pierde nada.
- La app pide **almacenamiento persistente** para que el sistema no libere los
  datos por falta de espacio. El estado se ve en Diagnóstico.

### Modelo de datos (esquema v2)

```
config     { nombreCarrera, digitosDorsal, idDispositivo, nombrePuesto,
             tandaActiva, vueltasPorDefecto, ventanaPorDefecto,
             rangoDesde, rangoHasta, esquema }

tandas     { id ("T-4K9P"), nombre, vueltas, ventanaMinSeg, estado, creadaEn,
             oleadas: [ { id, nombre, horaSalida } ] }

corredores { id ("T-4K9P#101"), tanda, dorsal, nombre, categoria, uid, oleada }

eventos    { id, tanda, dorsal, ts (epoch ms),
             metodo: 'nfc'|'teclado'|'asignada', dispositivo }

pendientes { id, tanda, ts, uid }

respaldos  { id: 'union', tandas, corredores, eventos, config, descartes }
```

Cada archivo exportado lleva el campo `esquema`. Si un archivo viene de una
versión más nueva que la app, la importación se rechaza con un mensaje claro en
vez de corromper los datos.

**Actualización desde la v1:** si ya habías usado la versión anterior, la app
migra sola al abrirse. Los corredores y eventos existentes se agrupan en una
tanda llamada como la carrera, y las vueltas y la ventana de la v1 pasan a ser
los valores por defecto de las tandas nuevas. No hay que hacer nada.

---

## 8. Estructura de archivos

```
carrera-vueltas/
├── index.html          # Las cuatro pantallas
├── styles.css          # Alto contraste, tema claro y oscuro, toques de 56 px
├── manifest.json       # PWA
├── sw.js               # Service worker: precarga todo, offline-first
├── netlify.toml        # Cabeceras de despliegue
├── _headers            # Equivalente para Netlify Drop
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── js/
│   ├── util.js         # Hora de Bogotá 24 h, avisos, modales, sonido,
│   │                   # vibración, CSV, descarga / Share / portapapeles
│   ├── db.js           # IndexedDB, una transacción por escritura, migración v1→v2
│   ├── estado.js       # Tandas, oleadas, índice por dorsal, deduplicación,
│   │                   # historial de manillas, posiciones y tiempos netos
│   ├── nfc.js          # Web NFC y traducción de errores al español
│   ├── exportar.js     # CSV, JSON, padrón, unión de dispositivos y su deshacer
│   ├── carrera.js      # Pantalla 1: lectura, salidas de oleada, pendientes
│   ├── inscripcion.js  # Pantalla 2: exprés por manilla, alta, lista, masiva
│   ├── posiciones.js   # Pantalla 3: tabla, filtros, orden y exportación
│   ├── tandas.js       # Selector de tanda, gestión de tandas y oleadas
│   ├── ajustes.js      # Pantalla 4: config, padrón, unión, diagnóstico
│   └── app.js          # Arranque, navegación, Wake Lock, service worker
└── README.md
```

**Al modificar cualquier archivo, sube `VERSION` en `sw.js`.** Es lo que fuerza
a los celulares a descargar la versión nueva.

---

## 9. Problemas frecuentes

| Síntoma | Qué hacer |
| ------- | --------- |
| «Este navegador no tiene Web NFC» | Estás en iPhone, en escritorio o en un navegador incrustado. Abre en Chrome para Android. La app funciona igual con el teclado. |
| Banner «Estás en un navegador incrustado» | Abriste el enlace dentro de WhatsApp o Gmail. Menú ⋮ → «Abrir en Chrome». |
| «Permiso de NFC denegado» | Candado junto a la dirección → Permisos → NFC → Permitir. |
| «No se pudo acceder al lector NFC» | Activa el NFC en Ajustes → Conexiones y cierra apps de pago o transporte. |
| La manilla no lee | Acércala al centro de la parte trasera y mantenla un segundo. La antena NFC no está en el borde. |
| «Dorsal no está inscrito en …» | Estás en la tanda equivocada. Revisa el selector de tanda en la barra superior. |
| Una vuelta legítima se rechaza como repetida | La ventana mínima de esa tanda está muy alta. Bájala en Ajustes; los eventos ya guardados no se tocan. |
| Los tiempos salen con `*` | Esa oleada no tiene hora de salida. Carrera → Salidas → Corregir. |
| El de la segunda oleada aparece detrás injustamente | Estás viendo el orden por «Hora de llegada». Cambia a «Tiempo neto» en Posiciones. |
| Dos organizadores usaron el mismo dorsal | La unión lo reporta como conflicto. Arréglalo a mano y reparte rangos de dorsales la próxima vez. |
| La pantalla se apaga en plena carrera | Activa la lectura NFC (activa el Wake Lock) y sube el tiempo de apagado del celular. |
| Un celular se quedó sin batería | Sus datos siguen guardados. Cárgalo, abre la app, exporta el JSON y únelo con el resto. |

### Antes del evento

Practica con **Ajustes → Cargar datos de prueba**: crea una tanda de ensayo con
40 corredores en 2 oleadas separadas 35 segundos y vueltas simuladas, para ver
cómo cambia la tabla entre tiempo neto y hora de llegada. Borra todo antes del
día real.
