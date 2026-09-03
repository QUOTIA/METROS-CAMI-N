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

El ancho (2,45 m) y alto (2,70 m) útiles del camión son editables en el panel
de la izquierda por si se usa con otro tipo de camión.

## Formato de medida

Cada artículo tiene tres casillas de medida (ancho, largo, alto) y un
selector de tipo (D/P/U):

- Los dos primeros valores (ancho y largo) son las medidas horizontales del
  pallet. La app prueba las dos orientaciones posibles (cuál va a lo ancho
  del camión y cuál a lo largo) y usa la que menos metros de largo ocupa —
  no importa en qué casilla pongas cuál, el resultado es el mismo.
- El tercer valor es la altura del pallet.
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
3. **Los pallets U nunca se combinan con nada.** Un pallet de tipo único (U)
   no se apila ni debajo ni encima de ningún otro, aunque la altura sobrante
   lo permitiría — cada uno ocupa su propia columna en solitario, igual que
   si fuera el único artículo de esa base.

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

## Archivos

- `index.html` — interfaz.
- `calc.js` — lógica de cálculo (reutilizable, sin dependencias del DOM).
- `calc.test.js` — pruebas de la lógica (`node calc.test.js`).
- `diagram.js` — dibuja el esquema en planta (SVG) de la disposición en el camión.
- `diagram.test.js` — pruebas del reparto de pallets por columnas (`node diagram.test.js`).

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
