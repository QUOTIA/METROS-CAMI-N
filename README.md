# Calculadora de metros de camión

App web (sin dependencias, sin instalación) para calcular cuántos metros lineales
de camión ocupan los pallets de un pedido.

## Uso

Abre `index.html` en el navegador (doble clic, o `python3 -m http.server` y entrar
a `http://localhost:8000`). Por cada artículo del pedido:

1. (Opcional) ponle una referencia o nombre.
2. Introduce el ancho, el largo y el alto del pallet, cada uno en su propia
   casilla (en cm, p. ej. `90`, o en metros, p. ej. `0,90`).
3. Marca su tipo de apilado con los botones **D** / **P** / **U**.
4. Introduce la cantidad de pallets de ese artículo.
5. Añade tantos artículos como tenga el pedido con "+ Añadir artículo".

El total de metros de largo se muestra abajo y se actualiza automáticamente al
escribir. Cuando dos (o más) artículos caben juntos a lo ancho del camión, la
app los combina en el mismo tramo de largo en vez de ponerlos uno detrás de
otro — así el largo total puede ser menor que la simple suma de cada artículo
por separado. La fila de cada artículo indica cuando esto ocurre ("comparte
hueco de ancho con otro artículo").

Debajo del total se dibuja un esquema en planta (vista desde arriba) del
camión con la disposición real de los pallets: cada artículo tiene un color,
cada recuadro es un pallet (o una columna apilada, con un `×N` si lleva varios
niveles), y las zonas discontinuas marcan hueco de ancho, de pirámide o de
largo sin usar (cuando un artículo comparte tramo con otro que necesita más
recorrido, su carril se queda "corto" dentro de ese mismo tramo).

Si dos o más artículos tienen exactamente la misma base (mismo ancho x largo,
aunque tengan distinta altura o tipo de apilado), la app va más allá y mezcla
sus pallets dentro de las mismas columnas — puede que en una sola casilla del
diagrama veas dos colores distintos, uno encima de otro, porque ahí caben
pallets de dos referencias distintas.

El panel "Camión" de la izquierda no se elige a mano: la app decide sola qué
camión usar para el pedido actual, entre el estándar (2,45 x 2,70 m, sin
límite de largo en esta app) y el furgo de Iulian (2,10 x 2,00 m, con un
límite real de 4,20 m de largo). Prueba primero el furgo — recalculando todo
el pedido con su ancho y alto — y solo lo elige si cabe en su largo máximo
**y además no necesita más metros que el estándar**: al ser más bajo, el
furgo puede perder un nivel de apilado (D) o un apilado vertical entre
artículos distintos que sí cabría con el alto del estándar, y en ese caso no
compensa usarlo aunque quepa — minimizar los metros del pedido pesa más que
usar el camión pequeño. Si no cabe, si necesitaría más metros, o si algún
pallet ni siquiera entra por ancho o alto en el furgo, se usa el estándar.
El panel muestra qué camión se ha asignado, sus medidas, y un aviso
explicando por qué se descartó el furgo cuando no es el elegido.

Cuando existe una segunda disposición distinta de la mejor —igual o más
metros que la mejor opción—, se muestra al lado (a la derecha, a la misma
altura, sin necesidad de bajar en la página) con su propio total y su propio
diagrama, bajo el título "Segunda opción de colocación" (indica si mide lo
mismo o más que la primera). Esto no requiere varios artículos: un único
artículo también puede tener dos disposiciones físicas distintas que midan
exactamente lo mismo (p. ej. 3 pallets a lo ancho x 4 filas frente a 2 a lo
ancho x 6 filas) y ambas se muestran. Si solo hay una forma razonable de
colocarlos, esta sección no aparece.

## Formato de medida

Cada artículo tiene tres casillas de medida (ancho, largo, alto) y un
selector de tipo (D/P/U):

- Los dos primeros valores (ancho y largo) son las medidas horizontales del
  pallet. La app prueba las dos orientaciones posibles (cuál va a lo ancho
  del camión y cuál a lo largo) y usa la que menos metros de largo ocupa —
  no importa en qué casilla pongas cuál, el resultado es el mismo.
- El tercer valor es la altura del pallet. Si supera la altura útil del
  camión, la fila muestra un aviso ("no cabe de ninguna forma") en vez de
  un resultado — un pallet así no cabe ni siquiera en un único nivel, sea
  cual sea su tipo de apilado.
- El botón de tipo indica cómo se puede apilar:
  - **U — único**: no se puede poner un pallet encima de otro. Siempre 1 nivel.
  - **D — remontable**: se pueden apilar pallets uno encima de otro hasta donde
    llegue la altura útil del camión (2,70 m por defecto). Ej.: un pallet de
    1,00 m de alto permite 2 niveles (2,00 m ≤ 2,70 m), pero no 3 (3,00 m > 2,70 m).
  - **P — pirámide**: se apilan en base de N pallets uno junto a otro, con
    (N-1) pallets encajados encima (p. ej. base de 3 + 2 encima = 5 pallets en el
    hueco de una sola medida de largo). Solo se hace un segundo nivel piramidal;
    si la altura del camión no permite 2 niveles, o la base es de 1 solo pallet,
    se queda en un único nivel sin apilar.

Los números pueden escribirse en centímetros (`090`, `172`, `141`, valores ≥ 10)
o en metros con coma o punto decimal (`0,90`, `1.72`, valores < 10); la app
detecta automáticamente cuál es cuál.

## Cómo se calcula el largo de cada línea de pedido

Para cada medida + cantidad del pedido:

1. Se calculan las dos orientaciones posibles del pallet (girado o no).
2. Para cada orientación, se calcula cuántos pallets caben en una fila a lo
   ancho del camión (`N = ancho útil del camión ÷ ancho del pallet`, redondeado
   hacia abajo).
3. Según el tipo (U/D/P) se calcula cuántos pallets caben en total en esa fila
   considerando el apilado en altura (ver arriba).
4. Se calcula cuántas filas (`slots`) hacen falta para la cantidad pedida, y el
   largo de camión que ocupan esas filas (`filas × largo de esa orientación`).
5. Se elige, de las dos orientaciones, la que da **menos metros de largo total**
   para esa cantidad — a veces girar el pallet aunque quepan menos pallets por
   fila da un resultado mejor si la fila resultante es más profunda (aprovecha
   mejor los "huecos" de la última fila incompleta).

Para U y D, además de probar cada orientación por separado, también se
prueba MEZCLAR las dos orientaciones en el mismo tramo de ancho — por
ejemplo, un pallet con el lado largo a lo ancho y otro (del mismo artículo)
con el lado corto, si entre los dos aprovechan el ancho del camión mejor que
usando una sola orientación para todos (p. ej. 1,30 + 0,80 = 2,10 m encaja
exacto donde 2×0,80 = 1,60 m deja medio metro suelto sin poder meter una
tercera columna igual).

Al mezclar, las columnas de cada orientación NO se tratan como si fueran
intercambiables entre sí — cada una ocupa un largo por unidad distinto, así
que cada grupo de columnas se apila de forma **independiente**, empezando
las dos a la vez desde el principio del tramo, y el largo total es el
**máximo** de los dos grupos (no una fila compartida de largo uniforme, que
desperdiciaría la columna más corta). La cantidad se reparte entre los dos
grupos buscando el reparto que minimice ese máximo — y encontrarlo bien
importa: no cualquier reparto da el mejor resultado.

Ejemplo real: 9 pallets de 0,86 x 1,30 m (tipo U) en un camión de 2,45 m de
ancho. Solo caben 2 columnas de 0,86 m (3 columnas serían 2,58 m, no caben),
dando 5 filas de 1,30 m = 6,50 m. Pero 1 columna de 0,86 m + 1 de 1,30 m sí
caben juntas (2,16 m ≤ 2,45 m); repartiendo 3 pallets en la de 0,86 m (3
filas de 1,30 m = 3,90 m) y 6 en la de 1,30 m (6 filas de 0,86 m = 5,16 m),
cada una funcionando en paralelo, el resultado es 5,16 m — el máximo de las
dos — muy por debajo de los 6,50 m de la orientación pura. El diagrama
dibuja cada columna con su propio número de filas; la más corta muestra el
hueco sin usar hasta llegar al largo de la más profunda. (Los pallets de
tipo P no mezclan orientación: la base de la pirámide necesita columnas del
mismo ancho para que la fila de arriba encaje.)

Además de mezclar las dos orientaciones EN PARALELO (columnas de cada una
conviviendo a la vez, cada una a su propio ancho parcial, como en el ejemplo
anterior), a veces compensa más repartirlas EN SERIE: un tramo entero
usando TODO el ancho disponible con una orientación, seguido de otro tramo
usando todo el ancho con la otra — en vez de que ambas convivan todo el
rato ocupando solo una parte del ancho cada una. Compensa cuando las
cantidades caben justas en un tramo completo de cada orientación, ya que
usar el ancho entero por turnos necesita menos filas que ir con columnas
parciales todo el tiempo.

Ejemplo real: 10 pallets de 0,80 x 1,20 m (tipo D, 2 niveles) en un camión
estándar. En paralelo (1 columna de 0,80 m + 1 de 1,20 m, cada una a su
propio largo) da 2,40 m. Pero en serie — un tramo de 3 columnas de 0,80 m
(todo el ancho, no solo 1) para 6 pallets (3 columnas × 2 niveles = justo
una fila de 1,20 m), seguido de otro tramo de 2 columnas de 1,20 m para los
4 restantes (2 columnas × 2 niveles = justo una fila de 0,80 m) — da
1,20 + 0,80 = 2,00 m, menos que en paralelo. La app calcula ambos modelos
(`isSplitMixed` en paralelo e `isSequentialMixed` en serie) como opciones
distintas y usa el que dé menos metros en cada caso; ninguno sustituye al
otro, porque cada uno gana en circunstancias distintas (en paralelo suele
ganar con cantidades grandes que necesitan muchas filas de cada
orientación; en serie, cuando las cantidades caben justas en un tramo
completo de cada una).

## Cómo se combinan varios artículos en el mismo tramo

Si dos (o tres) artículos caben juntos a lo ancho del camión —aunque sea
usando una disposición distinta a la que cada uno usaría en solitario—, la
app los coloca en el mismo tramo de largo, en paralelo, en vez de uno detrás
de otro:

1. Para cada artículo se generan **todas** las combinaciones posibles de
   orientación + número de columnas (no solo la que minimiza su propio largo
   en solitario — usar menos columnas ocupa menos ancho pero necesita más
   filas, es decir, más largo *para ese artículo solo*).
2. Se busca la partición óptima de todos los artículos del pedido en grupos
   de hasta 3 (que comparten tramo) tal que, para cada grupo, exista una
   combinación de disposiciones cuyo ancho conjunto quepa en el camión, y que
   la suma de los largos de cada tramo (el largo de un tramo es el mayor
   largo que necesite cualquier artículo del grupo) sea la mínima posible.
   Se calcula por programación dinámica sobre subconjuntos: es una búsqueda
   **exacta**, no una heurística — encuentra el óptimo real dentro de este
   modelo (hasta 14 artículos distintos; con más, se usa una heurística
   voraz más rápida pero no garantizada óptima, ya que el número de
   combinaciones crece demasiado para calcularlas todas al instante).
3. El largo total del pedido es la suma de los largos de todos los tramos
   resultantes.
4. La misma búsqueda guarda también, para cada artículo o grupo, hasta dos
   disposiciones DISTINTAS (no solo la de menor largo) — así, si un artículo
   por sí solo tiene dos formas de colocarse que miden exactamente lo mismo
   (p. ej. 3 columnas de un largo o 2 columnas de otro largo, dando el mismo
   total), o si dos particiones distintas del pedido dan el mismo total o
   uno mayor, esa segunda disposición queda disponible para mostrarla como
   "segunda opción de colocación".

Por ejemplo, dos artículos que "en solitario" ocupan cada uno 2 columnas y no
caben juntos (sus anchos naturales suman más de 2,45 m) sí pueden caber
juntos si cada uno usa solo 1 columna — aunque eso signifique más filas (más
largo) para cada uno por separado, el largo combinado (el máximo de los dos)
puede ser bastante menor que la suma de sus largos por separado.

## Artículos con la misma base (mezcla vertical)

Cuando dos o más artículos comparten EXACTAMENTE la misma base (mismo ancho x
largo, en cualquier orden; la altura y el tipo de apilado pueden ser
distintos), la app va un paso más allá de "compartir tramo lado a lado": los
trata como un único bloque en dos etapas:

1. **Pirámides completas primero.** Los pallets de tipo P forman, con su
   propia cantidad, tantas filas piramidales completas (base de N + (N-1)
   encima) como se pueda — esa es su disposición natural, no una pila
   directa. Por ejemplo, con 6 pallets P y N=3, se forma 1 pirámide completa
   (3+2=5) y queda 1 P suelto.
2. **El resto, apilado por altura — pero solo entre D.** Los pallets D, más
   los P sueltos que no llegan a completar una pirámide (se apilan entonces
   como si fueran D), se reparten libremente en columnas: cada columna puede
   llevar pallets de referencias distintas apiladas una encima de otra,
   mientras la suma de sus alturas quepa en el camión. El reparto usa un
   algoritmo de empaquetado por alturas (First-Fit-Decreasing): ordena los
   pallets de mayor a menor altura y va llenando columnas.
3. **Los pallets U nunca se combinan con otro de la MISMA base.** Dentro de
   este bloque (artículos con idéntico ancho x largo), un pallet único (U) no
   se apila ni debajo ni encima de ningún otro, aunque la altura sobrante lo
   permitiría — cada uno ocupa su propia columna en solitario. (Un U sí puede
   servir de base a un artículo de base DISTINTA — ver la siguiente sección.)

Se calcula así el menor número de filas posible para colocar todos los
pallets de las referencias combinadas, respetando esa regla. En el diagrama,
una misma casilla puede mostrar dos colores (dos referencias D, o una D y un
P suelto) apiladas — es intencional: significa que ahí caben pallets de
ambas. Una casilla de un pallet U, en cambio, nunca aparece mezclada con
otro color.

Esto no es una búsqueda exhaustiva de todas las formas de repartir alturas
(sería un problema de empaquetado en contenedores, NP-difícil en general),
pero cubre bien el caso típico de referencias con bases idénticas y alturas
parecidas.

## Apilado vertical entre artículos de base DISTINTA

La sección anterior cubre artículos que comparten EXACTAMENTE la misma base.
Pero dos artículos con bases distintas también pueden ir uno encima del
otro — por ejemplo, un pallet ancho y alto que deja hueco de altura de sobra
puede servir de base a un pallet más pequeño, en vez de dejar ese hueco
vacío y llevarlos en tramos separados.

Reglas de quién puede ser base y quién puede ir encima:

- **U puede ser base**, pero nunca puede ir encima de otro artículo ni
  doblarse consigo mismo — coherente con que "no se puede remontar" se
  refiera a remontar el propio U, no a que el hueco de altura que le sobra
  deba quedar vacío.
- **D puede ser base o ir encima.**
- **P mantiene su propio modelo** (base + fila piramidal encima, con nidos
  entre las propias columnas de su base) y no entra en este apilado cruzado
  con otro artículo — su geometría no es una pila simple de dos cajas.

Para que la combinación sea válida, el artículo de encima debe caber dentro
de la huella del de abajo (en alguna orientación) y la suma de sus alturas
no puede superar el alto útil del camión. La búsqueda es voraz: en cada paso
prueba todas las parejas posibles entre artículos de base distinta y aplica
la que más metros ahorre frente a llevarlos por separado, repitiendo hasta
que ninguna combinación compense ya — no es una búsqueda exhaustiva de todos
los emparejamientos posibles a la vez (eso sería en sí mismo un problema de
asignación), pero cubre bien el caso típico de "una base con hueco de altura
de sobra para un artículo más pequeño encima". Si sobran unidades de
cualquiera de los dos (porque sus cantidades no coinciden), esas unidades
sueltas se calculan aparte, igual que cualquier otro artículo.

Ejemplo real: un camión de 2,40 x 2,50 m con 3 pallets U de 1,00 x 0,80 x
1,50 m y 3 pallets D de 0,80 x 0,60 x 1,00 m. Por separado necesitarían 1,00
m (el U) + 0,60 m (el D) = 1,60 m. Combinados — el D encima del U, ya que
1,50 + 1,00 = 2,50 m cabe justo — solo hace falta 1,00 m: un ahorro real de
0,60 m que la versión anterior de la app, al no considerar bases distintas
para el apilado vertical, no encontraba.

## Vista 3D de la disposición

Además de la vista en planta (2D), el panel "Disposición en el camión" tiene
un interruptor 2D/3D. La vista 3D dibuja cada pallet como una caja real con
Three.js (cargado por CDN), en un sistema de coordenadas X = ancho del
camión, Y = alto (suelo en 0, apilando hacia arriba con la altura REAL de
cada pallet, no una escala arbitraria) y Z = largo (0 = cabecera, hacia las
puertas) — el mismo sentido que el eje vertical del SVG en planta, así que
la disposición en X/Z coincide exactamente entre las dos vistas. Se puede
rotar arrastrando con el ratón y hacer zoom con la rueda (controles propios,
sin depender de `OrbitControls.js`).

Cada referencia:

- lleva su propio color (la misma paleta y el mismo orden que la leyenda de
  la vista 2D), y
- va numerada 1, 2, 3… según el orden en que aparece en la tabla de
  artículos (1 = la primera fila).

Cada pila física (una columna, o un tramo de columna con varios niveles
apilados) lleva una etiqueta con su número de referencia, su ancho x largo,
y su alto — así se ve de un vistazo qué pallets van remontados y cuántos
niveles lleva cada pila, algo que en la vista 2D solo se insinuaba con la
opacidad del relleno.

La geometría (`diagram3d.js`, función `buildPalletBoxes`) recorre el mismo
`packResult` de `calc.js` que la vista 2D (`diagram.js`), traduciendo cada
tipo de colocación (rejilla U/D, pirámide P, columnas independientes en
paralelo de `isSplitMixed`, tramos consecutivos a todo el ancho de
`isSequentialMixed`, bloque combinado por huella compartida y apilado
vertical entre huellas distintas) a cajas 3D con la altura real de cada
pallet — no
depende del DOM ni de Three.js, así que se puede probar con Node igual que
`distributeColumns` (`diagram3d.test.js`).

## Transportistas (en preparación)

La ruedita ⚙ junto al título abre un panel de ajustes, oculto del flujo
normal, con la lista de transportistas: nombre, largo máximo de su camión y,
si su camión tiene otro ancho o alto útil distinto del estándar (2,45 x 2,70
m), esos valores también. Ancho/alto en blanco significan "camión estándar".
Se guarda en el navegador (`localStorage`), no en el pedido. Incluye de
partida a los 8 transportistas ya dados de alta; Iulian tiene un camión más
pequeño (el "furgo": 4,20 x 2,10 x 2,00 m), que es justo el que la app usa
para decidir automáticamente entre estándar y furgo en el panel "Camión"
(ver más arriba). De momento este panel de transportistas solo sirve para
mantener esos datos; todavía no se usa para nada más en el cálculo — la idea
es, más adelante, extender la misma decisión automática a todos los
transportistas dados de alta, no solo al estándar y al furgo.

## Archivos

- `index.html` — interfaz.
- `calc.js` — lógica de cálculo (reutilizable, sin dependencias del DOM).
- `calc.test.js` — pruebas de la lógica (`node calc.test.js`).
- `diagram.js` — dibuja el esquema en planta (SVG) de la disposición en el camión.
- `diagram.test.js` — pruebas del reparto de pallets por columnas (`node diagram.test.js`).
- `diagram3d.js` — traduce el resultado del cálculo a cajas 3D y monta la vista 3D interactiva (Three.js).
- `diagram3d.test.js` — pruebas de la geometría 3D, sin DOM ni Three.js (`node diagram3d.test.js`).

## Supuestos de negocio (a confirmar si cambian las reglas reales)

- El apilado piramidal (P) solo llega a 2 niveles (base N + (N-1) encima), nunca
  a 3 o más, aunque la altura del pallet permitiría más niveles.
- No hay límite de largo total de camión configurado en esta versión — solo se
  calculan y muestran los metros necesarios, sin avisar si superan la longitud
  real de un tráiler.
- Los tramos combinan como máximo 3 artículos/bloques distintos a la vez (en
  la práctica, más de 3 pallets distintos rara vez caben juntos a lo ancho de
  un camión). La búsqueda es exacta hasta 14 artículos/bloques distintos en
  el pedido; con más, se usa una heurística voraz que no garantiza el óptimo (ver
  "Cómo se combinan varios artículos en el mismo tramo").
