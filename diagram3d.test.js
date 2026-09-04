const assert = require('assert');
const { packArticles } = require('./calc.js');
const { buildPalletBoxes, buildStackLabels, distributeColumns3D } = require('./diagram3d.js');

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: se esperaba ${expected}, se obtuvo ${actual}`);
}

// --- distributeColumns3D: misma regla que distributeColumns (diagram.js) ---
{
  assert.deepStrictEqual(distributeColumns3D(3, 2, 4), [2, 2, 0]);
  assert.deepStrictEqual(distributeColumns3D(2, 3, 3), [3, 0]);
}

// --- Rejilla simple (U/D), con varios niveles apilados en altura real ------
// 2 columnas de 1,00 m x 0,80 m, D de 0,90 m de alto, 3 niveles posibles
// (2,70 / 0,90 = 3). 9 pallets: la primera fila (2 columnas x 3 niveles = 6)
// se llena entera, la segunda solo llena la primera columna (3 restantes).
{
  const pallet = { type: 'D', height: 0.9, dimA: 1, dimB: 0.8 };
  const opt = {
    N: 2, width: 1.0, lengthDim: 0.8, levels: 3, perSlot: 6, slots: 2,
    length: 1.6, usedWidth: 2.0,
    columnWidths: [1.0, 1.0], columnLengths: [0.8, 0.8],
  };
  const placement = { id: 1, name: 'A', code: 'x', quantity: 9, pallet, binIndex: 0, option: opt };
  const packResult = { bins: [{ length: 1.6, items: [placement] }], placements: [placement], totalLength: 1.6 };

  const boxes = buildPalletBoxes(packResult);
  assert.strictEqual(boxes.length, 9, 'los 9 pallets deben producir 9 cajas (una por unidad real)');
  assert.ok(boxes.every((b) => b.h === 0.9 && b.w === 1.0 && b.refId === 1), 'todas las cajas comparten alto/ancho/artículo');

  const col0Slot0 = boxes.filter((b) => b.x === 0 && b.z === 0);
  assert.strictEqual(col0Slot0.length, 3, 'la primera columna de la primera fila lleva 3 niveles apilados');
  assert.deepStrictEqual(col0Slot0.map((b) => b.y).sort((a, b) => a - b), [0, 0.9, 1.8], 'los niveles usan la altura real del pallet, no una escala arbitraria');

  const col1Slot1 = boxes.filter((b) => b.x === 1 && b.z === 0.8);
  assert.strictEqual(col1Slot1.length, 0, 'la segunda columna de la segunda fila queda vacía (solo sobran 3 pallets)');

  const labels = buildStackLabels(boxes);
  assert.strictEqual(labels.length, 3, 'una etiqueta por pila física (2 en la 1ª fila + 1 en la 2ª)');
  assert.ok(labels.every((l) => l.count === 3 || l.count === 3), 'cada pila etiquetada agrupa sus 3 niveles');
}

// --- Pirámide (P): base + fila intercalada encima, misma altura real ------
{
  const pallet = { type: 'P', height: 1.0, dimA: 0.8, dimB: 1.2 };
  const opt = { N: 3, width: 0.8, lengthDim: 1.2, perSlot: 5, levels: 2, slots: 1, length: 1.2, usedWidth: 2.4 };
  const placement = { id: 1, name: 'A', code: 'x', quantity: 5, pallet, binIndex: 0, option: opt };
  const packResult = { bins: [{ length: 1.2, items: [placement] }], placements: [placement], totalLength: 1.2 };

  const boxes = buildPalletBoxes(packResult);
  assert.strictEqual(boxes.length, 5, '3 en la base + 2 encima = 5 cajas');

  const base = boxes.filter((b) => b.y === 0);
  const top = boxes.filter((b) => b.y === 1.0);
  assert.strictEqual(base.length, 3, 'la base tiene 3 pallets a ras de suelo');
  assert.strictEqual(top.length, 2, 'encima van 2, apoyados sobre la altura real de la base');
  top.forEach((b) => {
    approx(b.w, 0.48, 'el pallet de encima se pinta más estrecho (nido entre columnas)');
    approx(b.d, 0.72, 'el pallet de encima se pinta más corto en profundidad (nido entre columnas)');
  });
}

// --- Bloque combinado por huella compartida (packFootprintFamily) ---------
// Mismo escenario que calc.test.js: P (6 uds, alto 0,92) + D (3 uds, alto
// 1,00) + D (2 uds, alto 1,35), todas base 0,80x1,20 — deben aparecer las
// 11 cajas, cada una con la altura real de SU PROPIA referencia.
{
  const truck = { width: 2.45, height: 2.70 };
  const items = [
    { id: 1, name: 'ref1', code: '080x120x092xP', quantity: 6 },
    { id: 2, name: 'ref2', code: '080x120x100xD', quantity: 3 },
    { id: 3, name: 'ref3', code: '080x120x135xD', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  const boxes = buildPalletBoxes(result);
  assert.strictEqual(boxes.length, 11, 'las 11 unidades (6+3+2) deben producir 11 cajas');

  const countsById = { 1: 0, 2: 0, 3: 0 };
  boxes.forEach((b) => { countsById[b.refId] += 1; });
  assert.deepStrictEqual(countsById, { 1: 6, 2: 3, 3: 2 }, 'cada referencia conserva su cantidad total');

  boxes.filter((b) => b.refId === 2).forEach((b) => approx(b.h, 1.0, 'ref2 usa su propia altura real'));
  boxes.filter((b) => b.refId === 3).forEach((b) => approx(b.h, 1.35, 'ref3 usa su propia altura real'));

  // Ninguna columna puede superar el alto útil del camión apilando alturas reales.
  const byColumn = new Map();
  boxes.forEach((b) => {
    const key = `${b.x.toFixed(4)}|${b.z.toFixed(4)}`;
    byColumn.set(key, (byColumn.get(key) || 0) + b.h);
  });
  [...byColumn.values()].forEach((total) => {
    assert.ok(total <= truck.height + 1e-6, `una columna no puede superar el alto del camión (usado ${total})`);
  });
}

// --- Apilado vertical entre huellas distintas (applyVerticalPairing) ------
// Mismo escenario que calc.test.js: U ancho (alto 1,50) de base + D pequeño
// (alto 1,00) encima, 3 columnas combinadas — el de encima debe quedar a
// Y = 1,50 (justo sobre la altura real de la base), no a una altura fija.
{
  const truck = { width: 2.40, height: 2.50 };
  const items = [
    { id: 1, name: 'U-base', code: '100x080x150xU', quantity: 3 },
    { id: 2, name: 'D-encima', code: '080x060x100xD', quantity: 3 },
  ];
  const result = packArticles(items, truck);
  assert.ok(result.bins[0].items[0].isVerticalCombo, 'este escenario debe resolverse con un apilado vertical');

  const boxes = buildPalletBoxes(result);
  assert.strictEqual(boxes.length, 6, '3 columnas x 2 pallets por columna = 6 cajas');

  const bases = boxes.filter((b) => b.refId === 1);
  const toppers = boxes.filter((b) => b.refId === 2);
  assert.strictEqual(bases.length, 3, 'la base (U) debe conservar sus 3 unidades');
  assert.strictEqual(toppers.length, 3, 'el de encima (D) debe conservar sus 3 unidades');
  assert.ok(bases.every((b) => b.y === 0 && approxEq(b.h, 1.5)), 'la base va a ras de suelo con su alto real');
  assert.ok(toppers.every((b) => approxEq(b.y, 1.5) && approxEq(b.h, 1.0)), 'el de encima se apoya justo sobre la altura real de la base');
}

function approxEq(a, b) {
  return Math.abs(a - b) < 1e-6;
}

// --- Mezcla en columnas independientes (isSplitMixed) ----------------------
// Mismo escenario que calc.test.js: furgo 2,10 x 2,00 m, D de 0,80x1,30x1,20
// m, 6 uds — 2 en la columna de 0,80 m + 4 en la de 1,30 m, cada pallet a su
// propia altura real (un solo nivel, la altura del furgo no da para dos).
{
  const furgo = { width: 2.1, height: 2.0 };
  const result = packArticles([{ id: 1, name: 'Solo', code: '080x130x120xD', quantity: 6 }], furgo);
  assert.ok(result.bins[0].items[0].option.isSplitMixed, 'este escenario debe resolverse con columnas independientes');

  const boxes = buildPalletBoxes(result);
  assert.strictEqual(boxes.length, 6, 'las 6 unidades deben producir 6 cajas, ninguna se pierde');
  assert.ok(boxes.every((b) => b.y === 0 && approxEq(b.h, 1.2)), 'un solo nivel: todas las cajas están a ras de suelo con la altura real del pallet');

  const widths = boxes.map((b) => b.w).sort((a, b) => a - b);
  assert.strictEqual(widths.filter((w) => approxEq(w, 0.8)).length, 2, '2 pallets en la columna de 0,80 m de ancho');
  assert.strictEqual(widths.filter((w) => approxEq(w, 1.3)).length, 4, '4 pallets en la columna de 1,30 m de ancho');
}

// --- Dos tramos consecutivos a todo el ancho (isSequentialMixed) ----------
// Mismo escenario que calc.test.js: D de 0,80x1,20x1,00 m, 10 uds, camión
// estándar — 6 en un tramo (z bajo) de 3 columnas de 0,80 m, 4 en el
// siguiente tramo (z más alto, después de la profundidad del primero) de 2
// columnas de 1,20 m. Los dos tramos van uno detrás del otro en Z (no en
// paralelo en X, como en isSplitMixed), y cada pallet lleva su alto real.
{
  const truck = { width: 2.45, height: 2.70 };
  const result = packArticles([{ id: 1, name: 'Solo', code: '080x120x100xD', quantity: 10 }], truck);
  const opt = result.bins[0].items[0].option;
  assert.ok(opt.isSequentialMixed, 'este escenario debe resolverse con dos tramos consecutivos');

  const boxes = buildPalletBoxes(result);
  assert.strictEqual(boxes.length, 10, 'las 10 unidades deben producir 10 cajas, ninguna se pierde');
  assert.ok(boxes.every((b) => approxEq(b.h, 1.0)), 'todas las cajas usan la altura real del pallet');

  const firstStage = boxes.filter((b) => approxEq(b.w, 0.8));
  const secondStage = boxes.filter((b) => approxEq(b.w, 1.2));
  assert.strictEqual(firstStage.length, 6, 'el primer tramo (3 columnas de 0,80 m) lleva 6 pallets');
  assert.strictEqual(secondStage.length, 4, 'el segundo tramo (2 columnas de 1,20 m) lleva 4 pallets');
  assert.ok(firstStage.every((b) => b.z < 1.2 - 1e-6), 'el primer tramo ocupa el z más bajo (su propia profundidad de 1,20 m)');
  assert.ok(secondStage.every((b) => b.z >= 1.2 - 1e-6), 'el segundo tramo empieza justo donde termina el primero, no en z=0');
}

console.log('Todos los tests de diagram3d.js pasaron correctamente.');
