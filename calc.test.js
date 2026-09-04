const assert = require('assert');
const { computeLineResult, packArticles, parsePalletCode, toMeters } = require('./calc.js');

const truck = { width: 2.45, height: 2.70 };

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, `${msg}: esperado ${b}, obtenido ${a}`);
}

// --- parsing ---
{
  const p = parsePalletCode('090X172x141xU');
  approx(p.dimA, 0.90, 'dimA cm->m');
  approx(p.dimB, 1.72, 'dimB cm->m');
  approx(p.height, 1.41, 'height cm->m');
  assert.strictEqual(p.type, 'U');
}
{
  const p = parsePalletCode('0,80x1,20x1,00xP');
  approx(p.dimA, 0.80, 'dimA comma-meters');
  approx(p.dimB, 1.20, 'dimB comma-meters');
  approx(p.height, 1.00, 'height comma-meters');
  assert.strictEqual(p.type, 'P');
}

// --- U: 90x172x141xU, elige orientación que minimiza largo ---
{
  const r = computeLineResult('090X172X141XU', 4, truck);
  // orientación 0.90 ancho -> 2 por fila, 2 filas de 1.72 = 3.44
  // orientación 1.72 ancho -> 1 por fila, 4 filas de 0.90 = 3.60
  approx(r.best.length, 3.44, 'U 4 pallets mejor orientación');
  assert.strictEqual(r.best.N, 2);
  assert.strictEqual(r.best.levels, 1);
}

// --- Un pallet más alto que el camión no cabe de ninguna forma, sea cual
// sea su tipo de apilado (ni un único nivel de U, D o P) ---
{
  assert.throws(
    () => computeLineResult('090x120x300xU', 1, truck),
    /más que el alto útil del camión/,
    'un pallet U de 3,00 m con camión de 2,70 m de alto debe rechazarse'
  );
  assert.throws(
    () => packArticles([{ id: 1, name: 'Alto', code: '090x120x300xD', quantity: 2 }], truck),
    /más que el alto útil del camión/,
    'packArticles también debe rechazar un pallet más alto que el camión'
  );
}

// --- P: 0.80x1.20x1.00xP -> 0.80 a lo ancho, 3 a lo ancho (2.4m), piramide 3+2=5 ---
{
  const r = computeLineResult('0,80x1,20x1,00xP', 5, truck);
  assert.strictEqual(r.best.N, 3);
  assert.strictEqual(r.best.perSlot, 5);
  approx(r.best.length, 1.20, '5 pallets piramide caben en 1 fila de 1.20m');
}
{
  // Para 6 pallets P, la orientación 3+2 (base 3) desperdicia hueco (2 filas de 1.20m = 2.40m
  // con capacidad para 10 pero solo 6 usados). Girando el pallet, la base de 2 (piramide 2+1=3)
  // encaja exacta en 2 filas de 0.80m = 1.60m, que es menos largo total: esa es la orientación óptima.
  const r = computeLineResult('0,80x1,20x1,00xP', 6, truck);
  assert.strictEqual(r.best.N, 2);
  assert.strictEqual(r.best.perSlot, 3);
  assert.strictEqual(r.best.slots, 2);
  approx(r.best.length, 1.60, '6 pallets piramide -> mejor orientación da 1.60m');
}

// --- D: mismas medidas pero remontable -> 3 base + 3 encima = 6 por fila ---
{
  const r = computeLineResult('0,80x1,20x1,00xD', 6, truck);
  assert.strictEqual(r.best.N, 3);
  assert.strictEqual(r.best.levels, 2);
  assert.strictEqual(r.best.perSlot, 6);
  approx(r.best.length, 1.20, '6 pallets remontables caben en 1 fila de 1.20m (2 niveles)');
}

// --- pallet que no cabe en el camión ---
{
  assert.throws(() => computeLineResult('300x300x100xU', 1, truck), /no cabe/);
}

// --- packArticles: dos artículos que no caben juntos con su ancho "natural",
// pero sí si uno de los dos usa menos columnas (comparte el hueco libre) ---
{
  // A: 080x130x120xD, 8 uds -> natural: 3 a lo ancho (2.40m), 2 filas de 1.30m = 2.60m
  // B: 138x146x110xD, 14 uds -> natural: 1 a lo ancho (1.46m), 7 filas de 1.38m = 9.66m
  // Solos y en secuencia: 2.60 + 9.66 = 12.26m.
  // Combinados: B se queda con su tramo natural (9.66m, usa 1.46m de ancho),
  // A usa solo 1 columna (0.80m de ancho, cabe en el 0.99m libre) y "cabalga"
  // dentro del mismo tramo de 9.66m -> total combinado = 9.66m.
  const items = [
    { id: 1, name: 'A', code: '080x130x120xD', quantity: 8 },
    { id: 2, name: 'B', code: '138x146x110xD', quantity: 14 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 9.66, 'combinación A+B comparten un único tramo de 9.66m');
  assert.strictEqual(result.bins.length, 1, 'A y B deben caer en el mismo tramo');
  const bin = result.bins[0];
  approx(bin.usedWidth, 1.46 + 0.80, 'ancho usado combinado en el tramo');
}

// --- packArticles: artículos que no caben juntos de ninguna manera -> tramos separados ---
{
  // Dos artículos de 2,00 m de ancho (mínimo posible en cualquier orientación)
  // nunca caben juntos en los 2,45 m del camión: cada uno necesita su propio tramo.
  const items = [
    { id: 1, name: 'Ancho1', code: '200x100x100xU', quantity: 2 }, // natural: 2.00 m
    { id: 2, name: 'Ancho2', code: '200x080x100xU', quantity: 2 }, // natural: 1.60 m
  ];
  const result = packArticles(items, truck);
  assert.strictEqual(result.bins.length, 2, 'no caben juntos, deben ir en tramos separados');
  approx(result.totalLength, 3.60, 'suma de los dos tramos independientes (2.00 + 1.60)');
}

// --- packArticles: caso reportado donde la heurística voraz antigua fallaba.
// Ninguno de los dos artículos cabe junto a otro usando su ancho "natural"
// (2 columnas cada uno), pero SÍ cabe una combinación donde ambos usan solo
// 1 columna (con una orientación distinta a la suya "natural" cada uno) ---
{
  // A: 085x131x125xD, 7 uds -> natural: 2 a lo ancho (1.70m), length 2.62m
  // B: 090x130x125xD, 9 uds -> natural: 2 a lo ancho (1.80m), length 3.90m
  // Naturales no caben juntos (1.70+1.80=3.50 > 2.45) -> en secuencia: 6.52m.
  // Óptimo real: A a 1 columna de 0.85m (largo 5.24m) + B a 1 columna pero
  // GIRADO (1.30m de ancho, largo 0.90m -> largo total 4.50m), combinados
  // (0.85+1.30=2.15 <= 2.45) en un único tramo de max(5.24,4.50) = 5.24m.
  const items = [
    { id: 1, name: 'A', code: '085x131x125xD', quantity: 7 },
    { id: 2, name: 'B', code: '090x130x125xD', quantity: 9 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 5.24, 'combinación óptima real (no la heurística ingenua de 6.52m)');
  assert.strictEqual(result.bins.length, 1, 'A y B deben caer en el mismo tramo');
}

// --- packArticles: artículos con la MISMA base (huella) se combinan en un
// único bloque. Los P forman primero pirámides completas (su disposición
// natural); el resto (D y los P sueltos que no completan pirámide) se
// apilan en filas normales, mezclando referencias en la misma columna ---
{
  // Las tres referencias comparten base 0.80x1.20:
  // ref1: P, altura 0.92, 6 uds. ref2: D, altura 1.00, 3 uds. ref3: D, altura 1.35, 2 uds.
  // Sin combinar (una columna por referencia): 1.60 + 1.20 = 2.80m.
  // Combinado: 1 fila en pirámide (3 base + 2 encima, las 5 primeras de ref1)
  // + 1 fila normal con el resto (2×ref3, 3×ref2, 1×ref1 sobrante) repartido
  // en 3 columnas de 2 -> 2 filas de 1.20m = 2.40m.
  const items = [
    { id: 1, name: 'ref1', code: '080x120x092xP', quantity: 6 },
    { id: 2, name: 'ref2', code: '080x120x100xD', quantity: 3 },
    { id: 3, name: 'ref3', code: '080x120x135xD', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 2.40, 'combinación por huella compartida');
  assert.strictEqual(result.bins.length, 1, 'las tres referencias caen en el mismo bloque');
  const placement = result.bins[0].items[0];
  assert.ok(placement.isFamily, 'el bloque combinado debe marcarse como familia de huella compartida');
  assert.strictEqual(placement.members.length, 3, 'las tres referencias deben ser miembros de la familia');

  const opt = placement.option;
  assert.strictEqual(opt.pyramidGroups.length, 1, 'debe formarse 1 fila piramidal completa');
  const pyramid = opt.pyramidGroups[0];
  assert.strictEqual(pyramid.base.length, 3, 'la base de la pirámide es de 3');
  assert.strictEqual(pyramid.top.length, 2, 'encima de la pirámide van 2');
  assert.ok(
    [...pyramid.base, ...pyramid.top].every((p) => p.id === 1),
    'la pirámide se forma solo con la referencia P (ref1)'
  );

  const totalPalletsPlaced =
    pyramid.base.length + pyramid.top.length +
    opt.columnBins.reduce((sum, col) => sum + col.length, 0);
  assert.strictEqual(totalPalletsPlaced, 11, 'los 11 pallets (6+3+2) deben quedar todos colocados');

  // El pallet suelto de ref1 (el 6º, que no entra en la pirámide) debe
  // aparecer apilado en una de las columnas de la fila normal.
  const leftoverInPlainRow = opt.columnBins.some((col) => col.some((p) => p.id === 1));
  assert.ok(leftoverInPlainRow, 'el pallet sobrante de ref1 se apila en la fila normal, no se pierde');
}

// --- packFootprintFamily: los pallets U (único) NUNCA se combinan con nada,
// ni entre sí ni con otras referencias, aunque compartan base y la altura
// sobrante lo permitiría. Caso reportado: 4 referencias de base 080x120,
// una D y tres U ---
{
  const items = [
    { id: 1, name: 'ref1', code: '080x120x116xD', quantity: 6 },
    { id: 2, name: 'ref2', code: '080x120x159xU', quantity: 3 },
    { id: 3, name: 'ref3', code: '080x120x143xU', quantity: 4 },
    { id: 4, name: 'ref4', code: '080x120x155xU', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  const opt = result.bins[0].items[0].option;

  // Solo la D (6 uds, altura 1.16) puede apilarse consigo misma: 2 por
  // columna (2×1.16=2.32<=2.70) -> 3 columnas. Los 9 U (3+4+2) van cada uno
  // en su propia columna: 3+9=12 columnas -> ceil(12/3)=4 filas de 1.20m.
  approx(opt.rows * opt.lengthDim, 4.80, 'los U nunca se combinan: 4 filas, no 2');
  assert.strictEqual(opt.pyramidGroups.length, 0, 'no hay pallets P en este pedido');

  for (const col of opt.columnBins) {
    if (col.length > 1) {
      assert.ok(
        col.every((p) => p.id === 1),
        'una columna con más de un pallet solo puede ser la referencia D (nunca un U combinado)'
      );
    }
  }
  const uColumnCount = opt.columnBins.filter((col) => col.length === 1 && col[0].id !== 1).length;
  assert.strictEqual(uColumnCount, 9, 'los 9 pallets U (3+4+2) van cada uno solo en su columna');
}

// --- packArticles: además de la mejor partición, debe devolver la segunda
// mejor partición DISTINTA (más metros o, si hay empate, los mismos) ---
{
  const items = [
    { id: 1, name: 'A', code: '100x100x050xU', quantity: 3 },
    { id: 2, name: 'B', code: '100x150x050xU', quantity: 2 },
    { id: 3, name: 'C', code: '145x100x050xU', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 4.45, 'mejor combinación: A+B juntos, C solo');
  assert.ok(result.alternative, 'debe existir una segunda opción de colocación');
  assert.ok(
    result.alternative.totalLength >= result.totalLength - 1e-6,
    'la alternativa nunca debe medir menos que la mejor opción'
  );
  // Puede agrupar los mismos artículos en el mismo tramo y aun así ser una
  // disposición físicamente distinta (p. ej. el artículo C usando columnas
  // de dos anchos distintos en vez de dos columnas iguales) — la
  // comparación debe fijarse en la forma real, no solo en qué ids comparten
  // tramo.
  const shapeOf = (sol) => JSON.stringify(sol.bins.map((b) => b.items.map((i) => i.option.columnWidths || i.option.width)));
  assert.notStrictEqual(
    shapeOf(result),
    shapeOf(result.alternative),
    'la alternativa debe ser una disposición físicamente distinta'
  );
}

// --- packArticles: para D/U, además de cada orientación por separado, se
// prueba también MEZCLAR las dos orientaciones en el mismo tramo de ancho —
// pero cada grupo de columnas (una orientación cada uno) se apila de forma
// INDEPENDIENTE, con su propio número de filas, no una fila compartida de
// largo uniforme (eso desperdiciaría la columna más corta). Repartir bien
// la cantidad entre los dos grupos puede BATIR a la mejor orientación pura,
// no solo empatar con ella. ---
{
  // Camión del furgo de Iulian: 2,10 x 2,00 m. 6 pallets de 0,80 x 1,30 x
  // 1,20 D: la mejor disposición pura es 2 columnas de 0,80 m, 3 filas de
  // 1,30 m = 3,90 m. Pero 1 columna de 0,80 m + 1 de 1,30 m (que sí llena
  // los 2,10 m exactos), con 2 pallets en la columna de 0,80 m (2 filas de
  // 1,30 m = 2,60 m) y 4 en la de 1,30 m (4 filas de 0,80 m = 3,20 m),
  // funcionando cada una en paralelo desde el principio del tramo, solo
  // necesita 3,20 m — menos que cualquier disposición pura.
  const furgo = { width: 2.1, height: 2.0 };
  const result = packArticles([{ id: 1, name: 'Solo', code: '080x130x120xD', quantity: 6 }], furgo);
  approx(result.totalLength, 3.2, 'columnas independientes: máximo de 2,60 m y 3,20 m en paralelo');
  const opt = result.bins[0].items[0].option;
  assert.ok(opt.isSplitMixed, 'la disposición ganadora debe ser la mezcla en columnas independientes');

  // Cada columna mezclada debe llevar SU PROPIO ancho y largo (el que le
  // corresponde a su propia orientación), no el largo de la fila entera —
  // una columna de 1,30 m de ancho mide 0,80 m de largo, no 1,30 (eso sería
  // inventarse la medida y confundiría el dibujo).
  const pairs = opt.columnWidths.map((w, i) => [w, opt.columnLengths[i]]).sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(pairs, [[0.8, 1.3], [1.3, 0.8]], 'cada columna mezclada lleva su propio largo, no el de la fila');

  assert.ok(result.alternative, 'debe existir una segunda disposición distinta (aunque mida más)');
  approx(result.alternative.totalLength, 3.9, 'la siguiente mejor disposición es la orientación pura (2 columnas de 0,80 m)');
}

// --- packArticles: un solo artículo SÍ puede tener una segunda disposición
// distinta con más metros, aunque no se combine con nada más (p. ej. 2
// columnas de 1,20 m de largo vs. 1 columna de 2,40 m de largo) ---
{
  const items = [{ id: 1, name: 'Solo', code: '090x120x100xD', quantity: 5 }];
  const result = packArticles(items, truck);
  approx(result.totalLength, 1.8, 'mejor disposición: 2 columnas de 1,20 m de ancho, 0,90 m de largo');
  assert.ok(result.alternative, 'debe existir una segunda disposición distinta para el mismo artículo');
  assert.ok(
    result.alternative.totalLength >= result.totalLength - 1e-6,
    'la alternativa nunca debe medir menos que la mejor opción'
  );
}

// --- packArticles: un artículo con una única disposición posible (por
// tamaño/orientación) no tiene ninguna alternativa que ofrecer ---
{
  const items = [{ id: 1, name: 'Solo', code: '240x240x100xU', quantity: 5 }];
  const result = packArticles(items, truck);
  assert.strictEqual(result.alternative, null, 'con una única disposición posible no hay segunda opción');
}

// --- packArticles: caso real reportado — un solo artículo (U, qty 12,
// 1,20x0,80 m) tiene dos disposiciones que miden EXACTAMENTE lo mismo
// (2 columnas de 0,80 m de ancho x 6 filas de 1,20 m, o 3 columnas de 1,20 m
// de ancho x 4 filas de 0,80 m: ambas dan 4,80 m) — deben mostrarse las dos,
// no solo una ---
{
  const items = [{ id: 1, name: 'Solo', code: '120x080x200xU', quantity: 12 }];
  const result = packArticles(items, truck);
  approx(result.totalLength, 4.8, 'primera disposición: 4,80 m');
  assert.ok(result.alternative, 'debe existir una segunda disposición con el mismo empate de metros');
  approx(result.alternative.totalLength, 4.8, 'la alternativa empata exactamente en metros');
  assert.notStrictEqual(
    result.bins[0].items[0].option.N,
    result.alternative.bins[0].items[0].option.N,
    'la alternativa debe usar un número de columnas distinto (disposición física distinta)'
  );
}

// --- packFootprintFamily: artículos con distinta base NO deben agruparse ---
{
  const { footprintKey, parsePalletCode } = require('./calc.js');
  const p1 = parsePalletCode('080x120x092xP');
  const p2 = parsePalletCode('090x130x125xD');
  assert.notStrictEqual(footprintKey(p1), footprintKey(p2), 'bases distintas deben dar claves distintas');
  const p3 = parsePalletCode('120x080x100xD'); // misma base que p1, medidas en otro orden
  assert.strictEqual(footprintKey(p1), footprintKey(p3), 'misma base en otro orden debe dar la misma clave');
}

// --- toMeters heuristic ---
{
  approx(toMeters('090'), 0.90, 'toMeters cm');
  approx(toMeters('0,90'), 0.90, 'toMeters comma meters');
  approx(toMeters('1.72'), 1.72, 'toMeters dot meters');
}

// --- Apilado vertical entre artículos de huella DISTINTA ---
// Camión de 2,40 x 2,50 m. U ancho (1,00x0,80, alto 1,50) + D pequeño
// (0,80x0,60, alto 1,00): 1,50 + 1,00 = 2,50 m, cabe justo. Por separado
// necesitarían 1,00 m (el U) + 0,60 m (el D) = 1,60 m; combinados, uno
// encima del otro, solo hace falta 1,00 m — el ahorro es real, no un empate.
{
  const truck = { width: 2.40, height: 2.50 };
  const items = [
    { id: 1, name: 'U-base', code: '100x080x150xU', quantity: 3 },
    { id: 2, name: 'D-encima', code: '080x060x100xD', quantity: 3 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 1.0, 'U ancho + D pequeño encima: 3 columnas combinadas de 1,00 m');
  assert.strictEqual(result.bins.length, 1, 'ambos artículos deben ir en el mismo tramo, apilados');
  assert.ok(result.bins[0].items[0].isVerticalCombo, 'la disposición elegida debe ser un apilado vertical entre ambos');
  const combo = result.bins[0].items[0];
  assert.strictEqual(combo.base.id, 1, 'el U (más ancho y con más altura sobrante) debe ser la base');
  assert.strictEqual(combo.topper.id, 2, 'el D pequeño debe quedar encima');
}

// --- Dos U nunca se apilan verticalmente entre sí, aunque la altura       ---
// --- sobrante lo permitiera físicamente (U nunca puede ir "encima").      ---
{
  const truck = { width: 2.40, height: 3.10 }; // alto de sobra para 1,50+1,50
  const items = [
    { id: 1, name: 'U1', code: '100x080x150xU', quantity: 2 },
    { id: 2, name: 'U2', code: '090x070x150xU', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  const anyVerticalCombo = result.bins.some((b) => b.items.some((i) => i.isVerticalCombo));
  assert.ok(!anyVerticalCombo, 'dos artículos U nunca deben combinarse en vertical entre sí');
}

// --- Si emparejar en vertical no ahorra metros (p. ej. las huellas no      ---
// --- encajan una dentro de la otra), no debe forzarse la combinación.     ---
{
  const truck = { width: 2.45, height: 2.70 };
  const items = [
    { id: 1, name: 'U-normal', code: '100x120x150xU', quantity: 4 },
    { id: 2, name: 'D-independiente', code: '090x110x100xD', quantity: 4 },
  ];
  const result = packArticles(items, truck);
  const anyVerticalCombo = result.bins.some((b) => b.items.some((i) => i.isVerticalCombo));
  // El D (0,90x1,10) no cabe dentro de la huella del U (1,00x1,20) en
  // ninguna orientación relativa... en realidad sí podría caber; lo
  // relevante del test es que si NO compensa (mide igual o más que por
  // separado) la app no lo fuerza. Comprobamos que el resultado nunca sea
  // peor que llevarlos por separado, se combinen o no.
  const separate = computeLineResult(items[0].code, items[0].quantity, truck).best.length
    + computeLineResult(items[1].code, items[1].quantity, truck).best.length;
  assert.ok(result.totalLength <= separate + 1e-6, 'combinar (si se hace) nunca debe empeorar el resultado');
}

// --- Caso real reportado: 9 pallets U de 0,86 x 1,30 x 1,80 m en un camión
// estándar (2,45 x 2,70 m). La orientación pura solo permite 2 columnas de
// 0,86 m (3 no caben: 3x0,86=2,58 > 2,45), dando 5 filas de 1,30 m = 6,50 m.
// Repartiendo la cantidad entre una columna de 0,86 m y otra de 1,30 m
// (ambas caben: 0,86+1,30=2,16 ≤ 2,45), cada una funcionando en paralelo
// desde el principio del tramo con su propio número de filas, el óptimo es
// 3 pallets en la columna de 0,86 m (3 filas de 1,30 m = 3,90 m) y 6 en la
// de 1,30 m (6 filas de 0,86 m = 5,16 m) — el máximo de los dos, 5,16 m, es
// mucho mejor que 6,50 m (y ligeramente mejor que repartir 4+5, que da
// 5,20 m: no cualquier reparto vale, hay que buscar el óptimo real). ---
{
  const truck = { width: 2.45, height: 2.70 };
  const result = packArticles([{ id: 1, name: 'Solo', code: '086x130x180xU', quantity: 9 }], truck);
  approx(result.totalLength, 5.16, 'reparto óptimo en columnas independientes: máximo de 3,90 m y 5,16 m');
  const opt = result.bins[0].items[0].option;
  assert.ok(opt.isSplitMixed, 'la disposición ganadora debe repartir la cantidad en columnas independientes');
}

// --- Caso real reportado: 10 pallets D de 0,80 x 1,20 x 1,00 m en un camión
// estándar (2,45 x 2,70 m; 2 niveles posibles, 2,70/1,00=2). Repartir las dos
// orientaciones EN PARALELO (1 columna de 0,80 m + 1 de 1,20 m, cada una a su
// propio largo, como en el caso anterior) da 2,40 m — pero aquí compensa más
// repartirlas EN SERIE: un tramo entero de 3 columnas de 0,80 m (todo el
// ancho, no solo 1) para 6 pallets (3×2 niveles = exactamente 1 fila de
// 1,20 m), seguido de otro tramo entero de 2 columnas de 1,20 m para los 4
// restantes (2×2 niveles = exactamente 1 fila de 0,80 m): 1,20+0,80=2,00 m,
// menos que el reparto en paralelo porque usa todo el ancho en cada tramo en
// vez de solo una columna parcial de cada orientación a la vez. ---
{
  const truck = { width: 2.45, height: 2.70 };
  const result = packArticles([{ id: 1, name: 'Solo', code: '080x120x100xD', quantity: 10 }], truck);
  approx(result.totalLength, 2.0, 'dos tramos consecutivos a todo el ancho: 1,20 m + 0,80 m');
  const opt = result.bins[0].items[0].option;
  assert.ok(opt.isSequentialMixed, 'la disposición ganadora debe repartir la cantidad en dos tramos consecutivos');
  assert.strictEqual(opt.stages[0].qty, 6, 'el primer tramo (3 columnas de 0,80 m) lleva 6 pallets');
  assert.strictEqual(opt.stages[1].qty, 4, 'el segundo tramo (2 columnas de 1,20 m) lleva los 4 restantes');
}

// --- Caso real reportado: mismo huella bloque combinado (packFootprintFamily)
// con 10 D de 1,20x0,80x1,00 m + 6 U de la misma base y alto. D se apila de 2
// en 2 (2,70/1,00=2 niveles) -> 5 columnas; los 6 U van cada uno solo -> 6
// columnas más: 11 columnas en total. Ni 2 columnas de 1,20 m (6 filas de
// 0,80 m = 4,80 m) ni 3 de 0,80 m (4 filas de 1,20 m = 4,80 m) dividen 11
// exacto. Pero repartiendo las columnas en DOS TRAMOS con distinta
// orientación — 9 columnas en 3 filas de 0,80 m (3×1,20 m = 3,60 m) + las 2
// restantes en 1 fila de 1,20 m (2×0,80 m = 0,80 m) — da 3,60+0,80=4,40 m,
// menos que forzar una sola orientación para todo el bloque. ---
{
  const truck = { width: 2.45, height: 2.70 };
  const items = [
    { id: 1, name: 'RefD', code: '120x80x100xD', quantity: 10 },
    { id: 2, name: 'RefU', code: '120x80x100xU', quantity: 6 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 4.4, 'bloque combinado en dos tramos de distinta orientación: 3,60 m + 0,80 m');
  const opt = result.bins[0].items[0].option;
  assert.ok(opt.isMixedPlainRows, 'las filas normales del bloque deben repartirse en dos orientaciones distintas');
  assert.strictEqual(opt.plainRowGroups.length, 2, 'debe haber dos grupos de filas, uno por orientación');
  const totalPlainColumns = opt.plainRowGroups.reduce((sum, g) => sum + g.columnBins.length, 0);
  assert.strictEqual(totalPlainColumns, 11, 'las 11 columnas (5 D apiladas + 6 U sueltos) deben repartirse entre los dos grupos');
}

console.log('Todos los tests pasaron correctamente.');
