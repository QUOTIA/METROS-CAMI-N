# Calculadora de metros de camión

App web (sin dependencias, sin instalación) para calcular cuántos metros lineales
de camión ocupan los pallets de un pedido.

## Uso

Abre `index.html` en el navegador (doble clic, o `python3 -m http.server` y entrar
a `http://localhost:8000`). Por cada artículo del pedido:

1. (Opcional) ponle una referencia o nombre.
2. Introduce su volumen con el formato `ANCHOxLARGOxALTOxTIPO`,
   por ejemplo `090X172X141XU` (medidas en cm) o `0,80x1,20x1,00xP` (medidas en m).
3. Introduce la cantidad de pallets de ese artículo.
4. Añade tantos artículos como tenga el pedido con "+ Añadir artículo".

El total de metros de largo de todos los artículos se muestra abajo y se
actualiza automáticamente al escribir.

El ancho (2,45 m) y alto (2,70 m) útiles del camión son editables en el panel
de la izquierda por si se usa con otro tipo de camión.

## Formato de medida

`ANCHO x LARGO x ALTO x TIPO`

- Los dos primeros números son las dos medidas horizontales del pallet. La app
  prueba las dos orientaciones posibles (cuál va a lo ancho del camión y cuál
  a lo largo) y usa la que menos metros de largo ocupa — no hace falta indicar
  cuál es "ancho" y cuál es "largo" al escribir la medida.
- El tercer número es la altura del pallet.
- La letra final indica cómo se puede apilar:
  - **U — único**: no se puede poner un pallet encima de otro. Siempre 1 nivel.
  - **R — remontable**: se pueden apilar pallets uno encima de otro hasta donde
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
3. Según el tipo (U/R/P) se calcula cuántos pallets caben en total en esa fila
   considerando el apilado en altura (ver arriba).
4. Se calcula cuántas filas (`slots`) hacen falta para la cantidad pedida, y el
   largo de camión que ocupan esas filas (`filas × largo de esa orientación`).
5. Se elige, de las dos orientaciones, la que da **menos metros de largo total**
   para esa cantidad — a veces girar el pallet aunque quepan menos pallets por
   fila da un resultado mejor si la fila resultante es más profunda (aprovecha
   mejor los "huecos" de la última fila incompleta).

El largo total del pedido es la suma de los largos calculados de cada artículo
por separado (no se mezclan artículos de medidas distintas en la misma fila).

## Archivos

- `index.html` — interfaz.
- `calc.js` — lógica de cálculo (reutilizable, sin dependencias del DOM).
- `calc.test.js` — pruebas de la lógica (`node calc.test.js`).

## Supuestos de negocio (a confirmar si cambian las reglas reales)

- El apilado piramidal (P) solo llega a 2 niveles (base N + (N-1) encima), nunca
  a 3 o más, aunque la altura del pallet permitiría más niveles.
- No hay límite de largo total de camión configurado en esta versión — solo se
  calculan y muestran los metros necesarios, sin avisar si superan la longitud
  real de un tráiler.
- Cada medida de pallet distinta dentro de un pedido se calcula por separado
  (con su propia orientación óptima) y los resultados se suman; no se intenta
  combinar dos medidas distintas en la misma fila de ancho.
