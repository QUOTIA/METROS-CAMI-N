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
// único bloque, mezclando referencias distintas en la misma columna y en
// los huecos de pirámide, no solo lado a lado ---
{
  // Las tres referencias comparten base 0.80x1.20:
  // ref1: P, altura 0.92, 6 uds. ref2: D, altura 1.00, 3 uds. ref3: D, altura 1.35, 2 uds.
  // Sin combinar por altura (una columna por referencia): 1.60 + 1.20 = 2.80m.
  // Combinando alturas en columnas + huecos de pirámide: 3 columnas de 0.80m
  // (2.40m de ancho), reparto por alturas (FFD) da 6 "pilas": dos de 1.35+1.35,
  // 1.00+1.00, 1.00+0.92, 0.92+0.92, 0.92+0.92, y una suelta de 0.92 que cabe
  // en un hueco de pirámide -> 2 filas de 1.20m = 2.40m.
  const items = [
    { id: 1, name: 'ref1', code: '080x120x092xP', quantity: 6 },
    { id: 2, name: 'ref2', code: '080x120x100xD', quantity: 3 },
    { id: 3, name: 'ref3', code: '080x120x135xD', quantity: 2 },
  ];
  const result = packArticles(items, truck);
  approx(result.totalLength, 2.40, 'combinación por huella compartida (mezcla en la misma columna)');
  assert.strictEqual(result.bins.length, 1, 'las tres referencias caen en el mismo bloque');
  const placement = result.bins[0].items[0];
  assert.ok(placement.isFamily, 'el bloque combinado debe marcarse como familia de huella compartida');
  assert.strictEqual(placement.members.length, 3, 'las tres referencias deben ser miembros de la familia');
  const totalPalletsPlaced =
    placement.option.columnBins.reduce((sum, col) => sum + col.length, 0) + placement.option.nestedItems.length;
  assert.strictEqual(totalPalletsPlaced, 11, 'los 11 pallets (6+3+2) deben quedar todos colocados');
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

console.log('Todos los tests pasaron correctamente.');
