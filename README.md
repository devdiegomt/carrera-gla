# Registro de Vueltas — Carrera Escolar

App para cronometrar vueltas con manillas NFC en una carrera de colegio.
Funciona sin internet, en el celular, y la usan profesores, no informáticos.

HTML, CSS y JavaScript sin frameworks ni librerías. Todo en español, hora de
Bogotá en formato 24 horas.

---

## 1. Tres palabras que hay que entender

Toda la app gira alrededor de estas tres. En pantalla no aparece ninguna otra
palabra técnica.

**GRUPO** — los que corren juntos. Cada grupo tiene sus propios dorsales,
manillas, vueltas y resultados. El dorsal 101 del grupo de la mañana y el 101
del grupo de la tarde son dos personas distintas, y la app nunca los mezcla.
Eso es lo que permite reutilizar los mismos petos y las mismas manillas todo
el día.

**SALIDA** — dentro de un grupo, los que arrancan al mismo tiempo. Si el grupo
sale escalonado (unos 30 o 40 segundos después de otros), se crea una salida
por cada arranque, y cada una guarda su propia hora. El tiempo de cada
corredor se cuenta desde la salida de *su* grupo, no desde la primera.

**MANILLA** — el chip NFC que lleva el corredor. La app recuerda de quién fue
cada manilla en cada grupo, y eso es lo que hace rápido volver a repartirlas.

---

## 2. Poner la app a funcionar

El sitio es estático: no hay que compilar nada.

**Publicar:** arrastra la carpeta a <https://app.netlify.com/drop>. Netlify
devuelve una dirección `https`, que es lo que el NFC exige. Desde Git: build
command vacío, publish directory `.`.

**En cada celular:**

1. Abre la dirección **en Chrome para Android** (no dentro de WhatsApp ni Gmail).
2. Menú ⋮ → «Instalar aplicación».
3. Ábrela una vez con internet: queda lista para funcionar sin señal.
4. Entra a **Ajustes → Revisión del sistema** y confirma que todo esté en verde.

Hace falta **Chrome para Android 124 o superior** con NFC activado. En iPhone o
en computador no hay NFC: la app arranca sola en modo teclado, que sirve
perfectamente de respaldo.

---

## 3. Inscribir corredores

Tres formas, en la pestaña **Inscritos**. Solo se ve una a la vez.

### Desde Excel (lo más práctico para 300 estudiantes)

1. **Descargar planilla** genera un archivo `.xlsx` de verdad, con las columnas
   ya puestas, ejemplos, anchos de columna y una hoja de instrucciones.
2. El colegio la llena en Excel o en Google Sheets.
3. **Subir planilla llena**. Antes de agregar nada, la app muestra cuántos
   encontró, cuáles ya existían y qué filas tienen problemas, fila por fila.

Las columnas son `Dorsal`, `Nombre`, `Categoría` y `Salida`. Solo las dos
primeras son obligatorias. La app encuentra los títulos aunque estén en otro
orden o unas filas más abajo, y también acepta archivos `.csv`.

### Repartir las manillas

Después de subir la planilla nadie tiene manilla todavía. En la tarjeta
**Inscritos** aparece el boton **Repartir manillas**, que abre una cadena de
montaje: la app muestra al siguiente corredor sin manilla, acercas la suya, la
asigna y pasa sola al siguiente. Un escaneo por persona, sin teclear nada.

Si alguien no esta en la fila, **Saltar** pasa al siguiente y **Ir a ese dorsal**
salta a uno concreto. Si la manilla ya es de otro corredor, avisa y ofrece
pasarsela con un toque. Para un caso suelto, la ficha de cada corredor tiene
**Asignarle una manilla**.

### Con manilla

Para repartir manillas reutilizadas. Enciendes el escaneo, acercas una manilla
y la app te dice **de quién fue antes** y propone ese mismo dorsal si está
libre. Solo escribes el nombre y sigues con la siguiente.

### A mano

Para uno o dos sueltos.

---

## 4. Reutilizar las manillas entre grupos

La pregunta que decide el método: **¿la manilla va pegada a un número fijo?**

**Si sí** — al crear el grupo nuevo, en «Reutilizar las manillas de» eliges el
grupo anterior. El grupo nace con todos los dorsales y sus manillas ya puestas
y los nombres en blanco. **No hay que escanear nada**: solo llega la planilla
de Excel con los nombres nuevos.

**Si no** — usas «Con manilla»: una manilla por persona, sin teclear números.

Si una manilla llega a la meta sin dueño, la vuelta **no se pierde**: se guarda
con su hora exacta en «Sin dorsal», y al ponerle el dorsal la vuelta cuenta con
esa hora y la manilla queda asignada de paso.

---

## 5. Varios profesores inscribiendo a la vez

1. Un celular crea el grupo y comparte la lista
   (**Ajustes → Lista de corredores → Compartir**).
2. Los demás la abren. La lista lleva el grupo adentro, así todos quedan
   inscribiendo sobre el mismo.
3. En cada celular, **Ajustes → Este celular → Inscribe dorsales desde/hasta**:
   CEL‑1 del 1 al 100, CEL‑2 del 101 al 200, CEL‑3 del 201 al 300.

Con el rango puesto, el número se autocompleta dentro de tu tramo y la app
avisa si te sales. Es la forma barata de que dos profesores no le den el mismo
número a dos estudiantes distintos.

---

## 6. El día de la carrera

**Antes de arrancar**

- **Ajustes → Verificar la hora** en todos los celulares a la vez. Si uno va
  adelantado, se cuelan vueltas repetidas y los tiempos quedan mal.
- Brillo al máximo, ahorro de energía apagado.
- En **Carrera**, toca **Activar lectura**. La pantalla ya no se apaga.

**Durante**

- **Salidas**: un botón grande por salida. Tócalo en el momento exacto del
  pito. Si se te olvidó, «Corregir» permite escribir la hora a mano. Basta con
  que **un** celular marque las salidas: al juntar los datos, la hora se pasa
  a los demás.
- Acerca la manilla a la parte de atrás del celular. El panel responde con
  **color, sonido y vibración distintos**: verde si la vuelta cuenta, ámbar si
  terminó, rojo si se rechaza, y el rojo dice siempre por qué.
- Respaldos: teclado numérico, **Anotar sin dorsal** (guarda la hora y le pones
  el dorsal después) y **Deshacer**.

**Entre un grupo y el siguiente**

1. Comparte la copia de seguridad de cada celular.
2. Crea el grupo siguiente reutilizando las manillas.
3. Sube la planilla con los nombres nuevos.

Los datos del grupo anterior siguen ahí: se consultan cambiando de grupo en la
barra de arriba.

**Al terminar**

1. En cada celular: **Resultados → Compartir resultados → Copia de seguridad**,
   alcance «Todos los grupos».
2. En uno solo: **Ajustes → Juntar los datos de los celulares**. Antes de
   aplicar nada muestra cuántas vueltas quedan, cuántas estaban repetidas, qué
   corredores tienen datos distintos en dos celulares y el detalle descargable
   de cada repetición. Se guarda una copia: **se puede deshacer**.
3. **Resultados** → filtra y comparte en CSV o Excel.

---

## 7. Cómo se evita contar dos veces la misma vuelta

> Una lectura se descarta si ese mismo dorsal ya marcó hace menos del **tiempo
> mínimo entre vueltas**, sin importar de qué celular venga.

Se aplica dos veces: al registrar en el celular, y otra vez al juntar los
archivos de todos. La comparación se hace por **grupo + dorsal**, que es lo que
hace seguro repetir números entre grupos. Cada grupo usa su propio tiempo
mínimo: ponlo un poco por debajo de lo que tarda en dar una vuelta el corredor
más rápido de ese grupo.

Los eventos se indexan en memoria por grupo y dorsal, así que cada lectura hace
una búsqueda binaria sobre las pocas vueltas de ese corredor. Medido con **3
grupos, 900 corredores y 15.300 vueltas**: carga completa 114 ms, comprobación
por lectura 0,0014 ms, tabla de 300 corredores 0,8 ms, juntar todo 13 ms.

### Orden de los resultados

Primero las vueltas, de mayor a menor. A igual número de vueltas:

- **Por tiempo** (por defecto): descuenta la salida de cada grupo. Es el orden
  justo cuando no todos arrancan a la vez.
- **Por llegada**: el orden en que cruzaron la meta.

Si una salida no tiene hora registrada, el tiempo se mide desde la primera
vuelta del grupo y aparece marcado con `*`, en pantalla y en el archivo.

---

## 8. Notas de diseño

Pensada para un celular de 360 px al sol, sostenido con una mano.

- **Sin emojis.** Todos los iconos son SVG de trazo que heredan el color del
  texto, así que funcionan igual en tema claro y oscuro.
- **Sin controles nativos de Android.** Los desplegables, los diálogos y el
  campo de hora son componentes propios (`js/ui.js`): una hoja que sube desde
  abajo, con opciones de 56 px y su explicación. Todo sigue el mismo patrón.
- **Nada se sale de la pantalla.** Verificado de forma automática: cero
  desbordes y cero scroll horizontal en las cuatro pantallas a 360 px.
- **Los resultados no son una tabla.** En un celular una tabla obliga a
  desplazarse de lado. Cada corredor es una tarjeta que cabe completa.
- **Una escala fija**: tres pesos de letra, siete tamaños, un solo verde de
  marca. El color solo comunica estado.
- Toque mínimo de 48 px; las acciones de carrera, 64 px.

---

## 9. Privacidad

- **Los datos nunca salen del celular** salvo cuando tú los compartes. No hay
  servidor ni analítica.
- Son **nombres de menores de edad**: compártelos solo por los canales que
  autorice el colegio y borra los celulares prestados al terminar
  (**Ajustes → Borrar todo**).
- Todo se guarda en IndexedDB en cada escritura, no al final: si el celular se
  apaga, no se pierde nada.
- El `.gitignore` excluye los archivos que la app exporta, para que una lista
  de estudiantes no termine por accidente en el repositorio.

### Modelo de datos (esquema v2)

```
config     { nombreCarrera, digitosDorsal, idDispositivo, nombrePuesto,
             tandaActiva, vueltasPorDefecto, ventanaPorDefecto,
             rangoDesde, rangoHasta, esquema }
tandas     { id ("T-4K9P"), nombre, vueltas, ventanaMinSeg, estado, creadaEn,
             oleadas: [ { id, nombre, horaSalida } ] }
corredores { id ("T-4K9P#101"), tanda, dorsal, nombre, categoria, uid, oleada }
eventos    { id, tanda, dorsal, ts, metodo, dispositivo }
pendientes { id, tanda, ts, uid }
respaldos  { id: 'union', tandas, corredores, eventos, config, descartes }
```

En el código se conservan los nombres `tanda` y `oleada`; en pantalla son
«grupo» y «salida». Si vienes de la versión anterior, la app migra sola al
abrirse.

---

## 10. Archivos

```
index.html        Esqueleto: la interfaz la construye el JavaScript
styles.css        Sistema de diseño: fichas de color, escala y componentes
sw.js             Service worker; sube VERSION al cambiar cualquier archivo
manifest.json     PWA          icons/   192 y 512
js/
  util.js         Hora de Bogotá, CSV, descargar, compartir, sonido
  ui.js           Componentes propios: hoja, selector, botones, iconos
  excel.js        Genera y lee .xlsx de verdad, sin librerías
  db.js           IndexedDB; una transacción por escritura
  estado.js       Grupos, salidas, deduplicación, tiempos, posiciones
  nfc.js          Web NFC y sus errores traducidos
  exportar.js     CSV, JSON, listas y juntar celulares
  carrera.js      Pantalla 1     inscripcion.js  Pantalla 2
  posiciones.js   Pantalla 3     tandas.js       Grupos y salidas
  ajustes.js      Pantalla 4     app.js          Arranque y navegación
```

`excel.js` arma el `.xlsx` como lo que es —un ZIP con XML adentro— usando
`CompressionStream` y `DecompressionStream`, que Chrome trae de fábrica. Por
eso no hace falta ninguna librería.

---

## 11. Si algo sale mal

| Síntoma | Qué hacer |
| ------- | --------- |
| «Este celular o navegador no tiene NFC» | Estás en iPhone, en computador o dentro de otra app. Abre en Chrome para Android. El teclado funciona igual. |
| El permiso de NFC quedó bloqueado | Toca el candado junto a la dirección → Permisos → NFC → Permitir. |
| La manilla no lee | Acércala al centro de la parte de atrás. La antena no está en el borde. |
| «El dorsal no está inscrito en…» | Estás en el grupo equivocado. Míralo en la barra de arriba. |
| Una vuelta buena se rechaza como repetida | El tiempo mínimo del grupo está muy alto. Bájalo; las vueltas ya guardadas no se tocan. |
| Los tiempos salen con `*` | A esa salida le falta la hora. Carrera → Salidas → Corregir. |
| El de la segunda salida aparece detrás injustamente | Estás viendo «Por llegada». Cambia a «Por tiempo». |
| Dos profesores usaron el mismo dorsal | Al juntar los datos la app lo reporta. Arréglalo a mano y repartan rangos la próxima vez. |
| Se apagó un celular | Sus datos siguen guardados. Cárgalo, abre la app y comparte su copia. |

**Para practicar antes:** Ajustes → Cargar datos de prueba crea un grupo de
ensayo con 40 corredores y 2 salidas separadas 35 segundos, para ver cómo
cambia la tabla entre «Por tiempo» y «Por llegada». Bórralo antes del día real.
