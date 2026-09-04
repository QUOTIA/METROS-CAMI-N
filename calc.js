// Lógica de cálculo de metros lineales de camión ocupados por pallets.
// Ver README.md para las reglas de negocio (orientación, apilado U/D/P).

const EPS = 1e-9;

function floorDiv(a, b) {
  return Math.floor((a + EPS) / b);
}

function ceilDiv(a, b) {
  return Math.ceil(a / b - EPS);
}

// "090X172x141xU" / "0,80x1,20x1,00xP" -> { dimA, dimB, height, type } en metros
function parsePalletCode(code) {
  const parts = String(code)
    .trim()
    .split(/x/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length !== 4) {
    throw new Error(
      `Formato inválido "${code}": se esperan 4 valores separados por "x" (ancho x largo x alto x tipo)`
    );
  }

  const [rawA, rawB, rawH, rawType] = parts;
  const dimA = toMeters(rawA);
  const dimB = toMeters(rawB);
  const height = toMeters(rawH);
  const type = rawType.trim().toUpperCase();

  if (!['U', 'D', 'P'].includes(type)) {
    throw new Error(`Tipo de apilado desconocido "${rawType}": debe ser U, D o P`);
  }
  if (!(dimA > 0) || !(dimB > 0) || !(height > 0)) {
    throw new Error(`Medidas inválidas en "${code}"`);
  }

  return { dimA, dimB, height, type };
}

// Un token puede venir en metros ("0,80", "1.2") o en centímetros ("090", "172").
// Se asume que valores por debajo de 10 ya están en metros.
function toMeters(token) {
  const value = parseFloat(String(token).replace(',', '.'));
  if (Number.isNaN(value)) {
    throw new Error(`Valor numérico inválido: "${token}"`);
  }
  return value < 10 ? value : value / 100;
}

// Para una orientación (width a lo ancho del camión, lengthDim a lo largo)
// calcula cuántos pallets caben por "fila" (perSlot) según el tipo de apilado.
function stackingForOrientation({ height, type }, N, truckHeight) {
  if (N < 1) return null;

  if (type === 'U') {
    return { perSlot: N, levels: 1, description: `${N} pallet(s) en 1 nivel (U: no remontable)` };
  }

  if (type === 'D') {
    const levels = Math.max(1, floorDiv(truckHeight, height));
    return {
      perSlot: N * levels,
      levels,
      description: `${N} pallet(s) x ${levels} nivel(es) apilado(s) (D: remontable)`,
    };
  }

  // type === 'P' (pirámide: base de N, con N-1 encima)
  const levelsPossible = floorDiv(truckHeight, height);
  if (levelsPossible >= 2 && N >= 2) {
    return {
      perSlot: N + (N - 1),
      levels: 2,
      description: `pirámide: ${N} en la base + ${N - 1} encima`,
    };
  }
  return {
    perSlot: N,
    levels: 1,
    description: `${N} pallet(s) en 1 nivel (altura o base insuficiente para pirámide)`,
  };
}

// Enumera opciones de pirámide (P): una única orientación por fila, ya que
// la base necesita columnas del mismo ancho para poder encajar la fila de
// arriba encima.
function enumeratePyramidOptions(pallet, quantity, truck) {
  const { dimA, dimB } = pallet;
  const orientations = dimA === dimB ? [[dimA, dimB]] : [[dimA, dimB], [dimB, dimA]];

  const options = [];
  for (const [width, lengthDim] of orientations) {
    const NMax = floorDiv(truck.width, width);
    for (let N = 1; N <= NMax; N++) {
      const stacking = stackingForOrientation(pallet, N, truck.height);
      if (!stacking || stacking.perSlot < 1) continue;

      const slots = ceilDiv(quantity, stacking.perSlot);
      const length = slots * lengthDim;
      const usedWidth = N * width;

      options.push({ width, lengthDim, N, ...stacking, slots, length, usedWidth });
    }
  }
  return options;
}

// Enumera opciones para U y D: cada columna aporta lo mismo sea cual sea su
// orientación (el número de niveles depende solo de la altura del pallet,
// no de qué lado quede a lo ancho), así que además de cada orientación por
// separado se prueban las DOS MEZCLADAS en el mismo tramo de ancho — por
// ejemplo, un pallet con el lado largo a lo ancho y otro con el corto, si
// entre los dos aprovechan el ancho del camión mejor que usando una sola
// orientación para todos (p. ej. 1,30 + 0,80 = 2,10 encaja donde
// 2×0,80 = 1,60 desperdicia medio metro de ancho sin poder meter una
// tercera columna de 0,80).
//
// Importante: cuando se mezclan las dos orientaciones, las columnas de cada
// una NO son intercambiables entre sí (cada una ocupa un largo por unidad
// distinto), así que cada grupo de columnas puede necesitar un número de
// filas distinto — no tiene sentido obligarlas a compartir una única fila
// de largo uniforme (eso desperdiciaría la columna más corta). En vez de
// eso, cada grupo de columnas se apila de forma independiente empezando
// desde el principio del tramo, y el largo total es el MÁXIMO de los dos
// grupos — la cantidad se reparte entre ambos grupos buscando el reparto
// que minimice ese máximo.
function enumerateRectOptions(pallet, quantity, truck) {
  const { dimA, dimB, type, height } = pallet;
  const orientations = dimA === dimB ? [[dimA, dimB]] : [[dimA, dimB], [dimB, dimA]];
  const levels = type === 'U' ? 1 : Math.max(1, floorDiv(truck.height, height));
  const stackWord = type === 'U' ? 'U: no remontable' : 'D: remontable';

  const [widthA, lengthA] = orientations[0];
  const hasSecond = orientations.length === 2;
  const [widthB, lengthB] = hasSecond ? orientations[1] : [0, 0];
  const maxA = floorDiv(truck.width, widthA);

  const options = [];
  for (let nA = 0; nA <= maxA; nA++) {
    const usedByA = nA * widthA;
    const maxB = hasSecond ? floorDiv(truck.width - usedByA, widthB) : 0;
    for (let nB = 0; nB <= maxB; nB++) {
      const N = nA + nB;
      if (N < 1) continue;
      const usedWidth = usedByA + nB * widthB;

      if (nA === 0 || nB === 0) {
        // Una sola orientación: todas las columnas son intercambiables, así
        // que repartir la cantidad fila a fila entre todas ya es óptimo.
        const width = nA > 0 ? widthA : widthB;
        const lengthDim = nA > 0 ? lengthA : lengthB;
        const perSlot = N * levels;
        const slots = ceilDiv(quantity, perSlot);
        const length = slots * lengthDim;
        const description = type === 'U'
          ? `${N} pallet(s) en 1 nivel (${stackWord})`
          : `${N} pallet(s) x ${levels} nivel(es) apilado(s) (${stackWord})`;
        options.push({
          width, lengthDim, N, perSlot, levels, description,
          slots, length, usedWidth,
          columnWidths: new Array(N).fill(width),
          columnLengths: new Array(N).fill(lengthDim),
        });
        continue;
      }

      // Mezcla real: se busca cómo repartir la cantidad entre el grupo de
      // columnas A y el de B para minimizar el mayor de los dos largos.
      let best = null;
      for (let qA = 0; qA <= quantity; qA++) {
        const qB = quantity - qA;
        const slotsA = qA > 0 ? ceilDiv(qA, nA * levels) : 0;
        const slotsB = qB > 0 ? ceilDiv(qB, nB * levels) : 0;
        const length = Math.max(slotsA * lengthA, slotsB * lengthB);
        if (!best || length < best.length - EPS) {
          best = { qA, qB, slotsA, slotsB, length };
        }
      }

      options.push({
        width: widthA, lengthDim: Math.max(lengthA, lengthB), N, levels,
        description: `${nA}+${nB} pallet(s) en columnas independientes (${nA}×${widthA.toFixed(2)} m + ` +
          `${nB}×${widthB.toFixed(2)} m de ancho, cada una a su propio largo) x ${levels} nivel(es) (${stackWord})`,
        slots: Math.max(best.slotsA, best.slotsB), length: best.length, usedWidth,
        columnWidths: [...new Array(nA).fill(widthA), ...new Array(nB).fill(widthB)],
        columnLengths: [...new Array(nA).fill(lengthA), ...new Array(nB).fill(lengthB)],
        isSplitMixed: true,
        groups: [
          { count: nA, width: widthA, lengthDim: lengthA, qty: best.qA, slots: best.slotsA, depth: best.slotsA * lengthA, levels },
          { count: nB, width: widthB, lengthDim: lengthB, qty: best.qB, slots: best.slotsB, depth: best.slotsB * lengthB, levels },
        ],
      });
    }
  }
  return options;
}

// Enumera TODAS las opciones de colocación de un pallet: para U y D, todas
// las combinaciones de columnas (incluyendo mezclar orientaciones en la
// misma fila); para P, cada orientación por separado (ver arriba). Usar
// menos columnas que el máximo genera más metros de largo para este
// artículo solo, pero libera ancho para que otro artículo pueda colocarse
// al lado (ver `packArticles`).
function enumerateOptions(pallet, quantity, truck) {
  return pallet.type === 'P'
    ? enumeratePyramidOptions(pallet, quantity, truck)
    : enumerateRectOptions(pallet, quantity, truck);
}

// Un pallet más alto que el alto útil del camión no cabe de ninguna forma,
// sea cual sea su tipo de apilado (ni siquiera en un único nivel).
function assertHeightFits(code, pallet, truck) {
  if (pallet.height > truck.height + EPS) {
    throw new Error(
      `El pallet "${code}" mide ${pallet.height.toFixed(2)} m de alto, más que el alto útil del camión ` +
        `(${truck.height.toFixed(2)} m): no cabe de ninguna forma.`
    );
  }
}

// Calcula, para una línea de pedido (medida + cantidad), la mejor orientación
// para minimizar los metros de largo de camión ocupados, sin compartir ancho
// con ningún otro artículo (ver `packArticles` para la versión combinada).
function computeLineResult(code, quantity, truck) {
  const pallet = parsePalletCode(code);
  assertHeightFits(code, pallet, truck);
  const candidates = enumerateOptions(pallet, quantity, truck);

  if (candidates.length === 0) {
    throw new Error(
      `El pallet "${code}" no cabe en el camión (ancho útil ${truck.width} m) en ninguna orientación`
    );
  }

  candidates.sort((a, b) => a.length - b.length || a.usedWidth - b.usedWidth);
  const best = candidates[0];

  return { code, quantity, pallet, best, candidates };
}

// Clave que identifica la "base" (medida ancho x largo) de un pallet,
// independiente de en qué orden se escribieran las dos medidas y de su
// altura o tipo. Dos artículos con la misma clave pueden apilarse pallets
// del uno sobre el otro (misma huella).
function footprintKey(pallet) {
  const a = Math.min(pallet.dimA, pallet.dimB);
  const b = Math.max(pallet.dimA, pallet.dimB);
  return `${a.toFixed(4)}x${b.toFixed(4)}`;
}

// Reparte una lista de alturas en "columnas" (pilas verticales) de capacidad
// `truckHeight`, con el heurístico First-Fit-Decreasing: se ordena de mayor
// a menor altura y cada pallet se mete en la primera columna donde quepa,
// o abre una columna nueva si no cabe en ninguna abierta.
function packHeightsFFD(pool, truckHeight) {
  const sorted = [...pool].sort((a, b) => b.height - a.height);
  const bins = [];
  for (const item of sorted) {
    let placed = false;
    for (const bin of bins) {
      if (bin.used + item.height <= truckHeight + EPS) {
        bin.items.push(item);
        bin.used += item.height;
        placed = true;
        break;
      }
    }
    if (!placed) bins.push({ items: [item], used: item.height });
  }
  return bins;
}

// Combina varios artículos que comparten EXACTAMENTE la misma base (ancho x
// largo) en un único bloque, respetando el tipo de apilado de cada uno:
//
// - Los pallets P forman primero tantas pirámides completas (N en la base +
//   (N-1) encima) como se pueda con la cantidad disponible — su disposición
//   natural, no una pila directa.
// - Los P sueltos que no llegan a completar una pirámide se apilan como si
//   fueran D (pueden combinarse con D en la misma columna).
// - Los pallets D (y los P sueltos) se reparten libremente en columnas,
//   mezclando referencias distintas apiladas una encima de otra mientras la
//   suma de sus alturas quepa en el camión.
// - Los pallets U (único) NUNCA se combinan con nada, ni encima ni debajo,
//   aunque la altura sobrante lo permitiría: cada uno ocupa su propia
//   columna en solitario.
//
// Se calcula el menor número de filas necesario para colocar todos los
// pallets del grupo. articles = [{ id, name, code, quantity, pallet }]
// (misma huella entre sí).
function packFootprintFamily(articles, truck) {
  const { dimA, dimB } = articles[0].pallet;
  const orientations = dimA === dimB ? [[dimA, dimB]] : [[dimA, dimB], [dimB, dimA]];

  const pPool = [];
  const stackablePool = []; // D
  const soloPool = []; // U: nunca se combina con nada
  for (const art of articles) {
    const bucket = art.pallet.type === 'P' ? pPool : art.pallet.type === 'U' ? soloPool : stackablePool;
    for (let i = 0; i < art.quantity; i++) {
      bucket.push({ id: art.id, name: art.name, code: art.code, height: art.pallet.height });
    }
  }

  let best = null;
  for (const [width, lengthDim] of orientations) {
    const N = floorDiv(truck.width, width);
    if (N < 1) continue;

    const pyramidGroupSize = N >= 2 ? 2 * N - 1 : 0;
    const numPyramidRows = pyramidGroupSize > 0 ? Math.floor(pPool.length / pyramidGroupSize) : 0;

    const remainingP = [...pPool];
    const pyramidGroups = [];
    for (let r = 0; r < numPyramidRows; r++) {
      const groupItems = remainingP.splice(0, pyramidGroupSize);
      pyramidGroups.push({ base: groupItems.slice(0, N), top: groupItems.slice(N) });
    }

    // Los P que no completan pirámide se apilan como si fueran D; los U
    // siguen sin poder combinarse con nada, cada uno en su propia columna.
    const stackBins = packHeightsFFD([...stackablePool, ...remainingP], truck.height);
    const soloBins = soloPool.map((item) => ({ items: [item] }));
    const columnBins = [...stackBins, ...soloBins].map((b) => b.items);

    const plainRows = columnBins.length === 0 ? 0 : Math.ceil(columnBins.length / N);
    const rows = numPyramidRows + plainRows;
    const length = rows * lengthDim;
    const usedWidth = N * width;

    if (!best || length < best.length - EPS) {
      best = { width, lengthDim, N, rows, length, usedWidth, pyramidGroups, columnBins, isFamily: true };
    }
  }

  return best;
}

// --- Apilado vertical entre artículos de huella DISTINTA -------------------
//
// `packFootprintFamily` ya mezcla en la misma columna artículos que
// comparten EXACTAMENTE la misma huella (ancho x largo). Pero dos artículos
// con huellas distintas también pueden ir uno encima del otro si el de
// arriba cabe dentro de la huella del de abajo y las alturas suman menos
// que el alto útil del camión — por ejemplo, un pallet U ancho con hueco de
// altura de sobra puede servir de base a un pallet D más pequeño, en vez de
// dejar ese hueco vacío.
//
// Reglas de quién puede ser base/encima (más estrictas que "cabe si cabe"):
// - U puede ser BASE (algo puede apoyarse encima suyo), pero nunca puede
//   estar ENCIMA de otro ni doblarse consigo mismo — coherente con que "no
//   se puede remontar" se refiera a remontar el propio U, no a que su hueco
//   de altura sobrante deba quedar vacío.
// - D puede ser base o estar encima.
// - P mantiene su propio modelo (base + fila piramidal encima, con nidos
//   entre las columnas de la propia base) y no se combina en vertical con
//   otro artículo en esta versión — su geometría no es una pila simple de
//   dos cajas.
function canBeVerticalBase(type) {
  return type === 'U' || type === 'D';
}
function canBeVerticalTopper(type) {
  return type === 'D';
}

function palletOrientations(pallet) {
  return pallet.dimA === pallet.dimB
    ? [[pallet.dimA, pallet.dimB]]
    : [[pallet.dimA, pallet.dimB], [pallet.dimB, pallet.dimA]];
}

// Enumera, para una pareja base+encima ya validada (huellas compatibles y
// alturas que suman dentro del camión), las disposiciones posibles de sus
// columnas combinadas — análogo a `enumerateRectOptions`, pero cada columna
// lleva SIEMPRE un par (1 de la base + 1 de encima), nunca una unidad suelta
// de cualquiera de los dos (los sueltos, si sobran, se tratan aparte).
function enumerateVerticalComboOptions(basePallet, topperPallet, comboQty, truck) {
  if (!canBeVerticalBase(basePallet.type) || !canBeVerticalTopper(topperPallet.type)) return [];
  if (basePallet.height + topperPallet.height > truck.height + EPS) return [];

  const baseOrientations = palletOrientations(basePallet);
  const topperOrientations = palletOrientations(topperPallet);

  const options = [];
  for (const [bw, bl] of baseOrientations) {
    const fitsSomeOrientation = topperOrientations.some(([tw, tl]) => tw <= bw + EPS && tl <= bl + EPS);
    if (!fitsSomeOrientation) continue;

    const NMax = floorDiv(truck.width, bw);
    for (let N = 1; N <= NMax; N++) {
      const perSlot = N; // un par (base + encima) por columna
      const slots = ceilDiv(comboQty, perSlot);
      const length = slots * bl;
      const usedWidth = N * bw;
      options.push({
        width: bw, lengthDim: bl, N, perSlot, levels: 1,
        description: `${N} columna(s) combinada(s): base + 1 pallet encima por columna`,
        slots, length, usedWidth,
        columnWidths: new Array(N).fill(bw), columnLengths: new Array(N).fill(bl),
      });
    }
  }
  return options;
}

function bestLength(pallet, quantity, truck) {
  const options = enumerateOptions(pallet, quantity, truck);
  if (options.length === 0) return Infinity;
  return options.reduce((min, opt) => Math.min(min, opt.length), Infinity);
}

// Comprueba si combinar verticalmente `itemA` e `itemB` (en cualquiera de
// los dos posibles roles, cuál es la base y cuál va encima) compensa frente
// a llevarlos por separado — y si es así, devuelve la mejor combinación
// encontrada junto con lo que sobra de cada uno (si sus cantidades no
// coinciden, sobra del que tenga más).
function tryVerticalPair(itemA, itemB, truck) {
  const roleOptions = [];
  if (canBeVerticalBase(itemA.pallet.type) && canBeVerticalTopper(itemB.pallet.type)) {
    roleOptions.push({ base: itemA, topper: itemB });
  }
  if (canBeVerticalBase(itemB.pallet.type) && canBeVerticalTopper(itemA.pallet.type)) {
    roleOptions.push({ base: itemB, topper: itemA });
  }
  if (roleOptions.length === 0) return null;

  let best = null;
  for (const { base, topper } of roleOptions) {
    const comboQty = Math.min(base.quantity, topper.quantity);
    if (comboQty < 1) continue;

    const comboOptions = enumerateVerticalComboOptions(base.pallet, topper.pallet, comboQty, truck);
    if (comboOptions.length === 0) continue;
    const comboBest = comboOptions.reduce((a, b) => (b.length < a.length - EPS ? b : a));

    const leftoverBaseQty = base.quantity - comboQty;
    const leftoverTopperQty = topper.quantity - comboQty;
    const leftoverBaseLen = leftoverBaseQty > 0 ? bestLength(base.pallet, leftoverBaseQty, truck) : 0;
    const leftoverTopperLen = leftoverTopperQty > 0 ? bestLength(topper.pallet, leftoverTopperQty, truck) : 0;
    const pairedTotal = comboBest.length + leftoverBaseLen + leftoverTopperLen;

    const separateTotal = bestLength(base.pallet, base.quantity, truck) + bestLength(topper.pallet, topper.quantity, truck);

    if (pairedTotal < separateTotal - EPS) {
      const savings = separateTotal - pairedTotal;
      if (!best || savings > best.savings + EPS) {
        best = { base, topper, comboQty, comboOptions, leftoverBaseQty, leftoverTopperQty, savings };
      }
    }
  }
  return best;
}

// Búsqueda voraz de emparejamientos verticales entre artículos de huella
// distinta (no es una búsqueda exhaustiva de todos los emparejamientos
// posibles a la vez — eso sería en sí mismo un problema de asignación —
// pero en cada paso aplica el que más metros ahorra, hasta que ninguno
// compensa ya). `soloItems` son artículos cuya huella no comparten con
// ningún otro (los que sí la comparten ya se agrupan aparte, en
// `packFootprintFamily`).
function applyVerticalPairing(soloItems, truck) {
  const pool = soloItems.map((item) => ({ ...item }));
  const comboPrepared = [];
  let comboCounter = 0;

  for (;;) {
    let bestPair = null;
    let bestI = -1;
    let bestJ = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].quantity < 1) continue;
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[j].quantity < 1) continue;
        const pair = tryVerticalPair(pool[i], pool[j], truck);
        if (pair && (!bestPair || pair.savings > bestPair.savings + EPS)) {
          bestPair = pair;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (!bestPair) break;

    const { base, topper, comboQty, comboOptions, leftoverBaseQty, leftoverTopperQty } = bestPair;
    comboOptions.sort((a, b) => a.length - b.length || a.usedWidth - b.usedWidth);
    comboCounter += 1;
    comboPrepared.push({
      id: `vpair:${base.id}+${topper.id}:${comboCounter}`,
      isVerticalCombo: true,
      base, topper, comboQty,
      options: comboOptions,
    });

    const iIsBase = pool[bestI].id === base.id;
    pool[bestI] = iIsBase ? { ...base, quantity: leftoverBaseQty } : { ...topper, quantity: leftoverTopperQty };
    pool[bestJ] = iIsBase ? { ...topper, quantity: leftoverTopperQty } : { ...base, quantity: leftoverBaseQty };
  }

  return { comboPrepared, remaining: pool.filter((item) => item.quantity > 0) };
}

// Identifica la forma real de una opción (qué anchos de columna usa, no solo
// `width`, que para una opción mezclada es solo la primera orientación) —
// necesario para no confundir "2 columnas de 0,80" con "1 de 1,30 + 1 de
// 0,80" cuando ambas tienen el mismo N y el mismo largo de fila.
function optionShapeKey(opt) {
  const widths = opt.columnWidths ? opt.columnWidths.slice().sort((a, b) => a - b) : [opt.width];
  return widths.map((w) => w.toFixed(6)).join(',');
}

// Firma de una combinación concreta de opciones (orientación + columnas por
// artículo del grupo), para distinguir dos disposiciones que casualmente
// midan lo mismo (p. ej. 2 columnas de 0,80 m de largo y 6 filas frente a 3
// columnas de 1,20 m de largo y 4 filas: ambas dan 4,80 m con un único
// artículo, pero son dos formas físicas distintas de colocarlo).
function comboSignature(indices, combo) {
  return indices
    .map((idx, k) => {
      const opt = combo[k];
      return `${idx}:${optionShapeKey(opt)}x${opt.lengthDim.toFixed(6)}xN${opt.N}`;
    })
    .join('|');
}

// Para un grupo de artículos (índices en `prepared`) que compartirían el
// mismo tramo de largo, prueba TODAS las combinaciones de sus opciones
// (orientación + columnas) y devuelve hasta `k` DISTINTAS que quepan a lo
// ancho del camión, ordenadas de menor a mayor largo del tramo (el mayor
// largo de los artículos del grupo) — así, aunque dos disposiciones distintas
// midan exactamente lo mismo, ambas quedan disponibles para el resto de la
// búsqueda en vez de quedarse solo con la primera que se encontró.
function bestGroupAssignmentTopK(indices, prepared, truck, k) {
  let combos = [[]];
  for (const idx of indices) {
    const next = [];
    for (const combo of combos) {
      for (const opt of prepared[idx].options) next.push([...combo, opt]);
    }
    combos = next;
  }

  const valid = [];
  for (const combo of combos) {
    const totalWidth = combo.reduce((sum, opt) => sum + opt.usedWidth, 0);
    if (totalWidth > truck.width + EPS) continue;
    const length = combo.reduce((max, opt) => Math.max(max, opt.length), 0);
    valid.push({ length, combo });
  }
  valid.sort((a, b) => a.length - b.length);

  const seen = new Set();
  const top = [];
  for (const v of valid) {
    const sig = comboSignature(indices, v.combo);
    if (seen.has(sig)) continue;
    seen.add(sig);
    top.push(v);
    if (top.length >= k) break;
  }
  return top;
}

function makePlacement(item, option, binIndex) {
  if (item.isFamily) {
    return { id: item.id, isFamily: true, members: item.members, binIndex, option };
  }
  if (item.isVerticalCombo) {
    return {
      id: item.id, isVerticalCombo: true, base: item.base, topper: item.topper,
      quantity: item.comboQty, binIndex, option,
    };
  }
  return {
    id: item.id, name: item.name, code: item.code, quantity: item.quantity,
    pallet: item.pallet, binIndex, option,
  };
}

function buildBinsFromGroups(groups, prepared) {
  const bins = [];
  const placements = [];
  for (const { indices, result } of groups) {
    const bin = { usedWidth: 0, length: result.length, items: [] };
    indices.forEach((idx, k) => {
      const item = prepared[idx];
      const option = result.combo[k];
      bin.usedWidth += option.usedWidth;
      const placement = makePlacement(item, option, bins.length);
      bin.items.push(placement);
      placements.push(placement);
    });
    bins.push(bin);
  }
  const totalLength = bins.reduce((sum, bin) => sum + bin.length, 0);
  return { bins, placements, totalLength };
}

// Busca las `k` mejores particiones DISTINTAS de los artículos en tramos
// (grupos de hasta `maxGroup` artículos que comparten tramo), ordenadas de
// menor a mayor largo total. Programación dinámica sobre subconjuntos
// (bitmask) generalizada a "k mejores": dp[mask] guarda hasta `k` formas
// distintas de cubrir `mask` (no solo la óptima), cada una identificada por
// qué grupo se eligió para el bit más bajo y qué solución de `dp[remaining]`
// se usó para el resto — así, combinando esas listas en cada máscara mayor,
// no se pierde ninguna combinación que podría acabar siendo la 2ª mejor
// global aunque en un subproblema parcial no fuera la mejor de ese trozo.
function packArticlesTopK(prepared, truck, maxGroup, k) {
  const n = prepared.length;
  const fullMask = (1 << n) - 1;
  const groupCache = new Map();

  // Hasta `k` disposiciones DISTINTAS para este grupo concreto de artículos
  // (no solo la de menor largo), para que un empate de largo entre dos
  // disposiciones de un mismo artículo/grupo también pueda salir a la luz
  // como "segunda opción" más adelante.
  function getGroupResults(indices) {
    let mask = 0;
    for (const idx of indices) mask |= 1 << idx;
    if (groupCache.has(mask)) return groupCache.get(mask);
    const results = bestGroupAssignmentTopK(indices, prepared, truck, k);
    groupCache.set(mask, results);
    return results;
  }

  // dp[mask] = [{ total, indices, result, remaining, subIndex }, ...] (hasta k, ascendente)
  const dp = new Array(1 << n);
  dp[0] = [{ total: 0, indices: null, result: null, remaining: null, subIndex: null }];

  for (let mask = 1; mask <= fullMask; mask++) {
    const lowIndex = Math.log2(mask & -mask) | 0;
    const restIndices = [];
    for (let i = 0; i < n; i++) {
      if (i !== lowIndex && (mask & (1 << i))) restIndices.push(i);
    }

    const candidateGroups = [[lowIndex]];
    if (maxGroup >= 2) {
      for (const r of restIndices) candidateGroups.push([lowIndex, r]);
    }
    if (maxGroup >= 3) {
      for (let a = 0; a < restIndices.length; a++) {
        for (let b = a + 1; b < restIndices.length; b++) {
          candidateGroups.push([lowIndex, restIndices[a], restIndices[b]]);
        }
      }
    }

    const candidates = [];
    for (const indices of candidateGroups) {
      const results = getGroupResults(indices);
      if (!results.length) continue;
      let groupMask = 0;
      for (const idx of indices) groupMask |= 1 << idx;
      const remaining = mask ^ groupMask;
      results.forEach((result, resultIndex) => {
        dp[remaining].forEach((sub, subIndex) => {
          candidates.push({ total: result.length + sub.total, indices, result, resultIndex, remaining, subIndex });
        });
      });
    }

    candidates.sort((a, b) => a.total - b.total);

    // Cada (grupo elegido, disposición del grupo, sub-solución usada) es una
    // combinación distinta, aunque el total mida lo mismo que otra — nos
    // quedamos con hasta k.
    const seen = new Set();
    const top = [];
    for (const c of candidates) {
      const key = `${c.indices.slice().sort((x, y) => x - y).join(',')}#${c.resultIndex}#${c.subIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      top.push(c);
      if (top.length >= k) break;
    }
    dp[mask] = top;
  }

  function reconstruct(mask, subIndex) {
    const entry = dp[mask][subIndex];
    if (entry.indices === null) return [];
    return [{ indices: entry.indices, result: entry.result }, ...reconstruct(entry.remaining, entry.subIndex)];
  }

  return dp[fullMask].map((_, idx) => buildBinsFromGroups(reconstruct(fullMask, idx), prepared));
}

// Firma de la disposición física concreta de un artículo/bloque dentro de un
// tramo (qué ids lleva y con qué orientación/columnas/filas), no solo cuánto
// mide — dos disposiciones distintas pueden medir exactamente lo mismo (ver
// `comboSignature`) y no deben confundirse con "la misma solución".
function placementSignature(item) {
  const ids = item.isFamily
    ? item.members.map((m) => m.id)
    : item.isVerticalCombo
      ? [item.base.id, item.topper.id]
      : [item.id];
  const opt = item.option;
  const shape = item.isFamily
    ? `F,rows${opt.rows},N${opt.N},${opt.width.toFixed(4)}x${opt.lengthDim.toFixed(4)}`
    : item.isVerticalCombo
      ? `VC,N${opt.N},slots${opt.slots},${optionShapeKey(opt)}x${opt.lengthDim.toFixed(4)}`
      : `N${opt.N},slots${opt.slots},${optionShapeKey(opt)}x${opt.lengthDim.toFixed(4)}`;
  return `${ids.slice().sort((a, b) => a - b).join(',')}:${shape}`;
}

// Firma canónica de una solución completa (disposición física de cada tramo,
// no solo qué ids comparten cada uno y cuánto mide), para poder distinguir
// "de verdad son dos disposiciones distintas" de "es la misma solución que
// ya vimos" aunque el total mida exactamente lo mismo.
function solutionSignature(sol) {
  return sol.bins
    .map((bin) => bin.items.map(placementSignature).sort().join('+') + `@${bin.length.toFixed(6)}`)
    .sort()
    .join('|');
}

// Heurística voraz (rápida, aproximada) usada solo cuando hay demasiados
// artículos distintos para la búsqueda exacta: se procesan de mayor a menor
// largo propio y cada uno se intenta encajar en el hueco de ancho libre de
// algún tramo ya abierto antes de abrir uno nuevo.
function packArticlesGreedy(prepared, truck) {
  const ordered = [...prepared].sort((a, b) => b.options[0].length - a.options[0].length);
  const bins = [];
  const placements = [];

  for (const item of ordered) {
    let bestChoice = null;

    bins.forEach((bin, binIndex) => {
      const freeWidth = truck.width - bin.usedWidth;
      let bestForBin = null;
      for (const opt of item.options) {
        if (opt.usedWidth > freeWidth + EPS) continue;
        const cost = Math.max(0, opt.length - bin.length);
        if (
          !bestForBin ||
          cost < bestForBin.cost - EPS ||
          (Math.abs(cost - bestForBin.cost) < EPS && opt.usedWidth < bestForBin.opt.usedWidth)
        ) {
          bestForBin = { cost, opt };
        }
      }
      if (bestForBin && (!bestChoice || bestForBin.cost < bestChoice.cost - EPS)) {
        bestChoice = { cost: bestForBin.cost, binIndex, option: bestForBin.opt };
      }
    });

    const natural = item.options[0];
    if (!bestChoice || natural.length < bestChoice.cost - EPS) {
      bestChoice = { cost: natural.length, binIndex: bins.length, option: natural };
    }

    if (bestChoice.binIndex === bins.length) {
      bins.push({ usedWidth: bestChoice.option.usedWidth, length: bestChoice.option.length, items: [] });
    } else {
      const bin = bins[bestChoice.binIndex];
      bin.usedWidth += bestChoice.option.usedWidth;
      bin.length = Math.max(bin.length, bestChoice.option.length);
    }

    const placement = makePlacement(item, bestChoice.option, bestChoice.binIndex);
    bins[bestChoice.binIndex].items.push(placement);
    placements.push(placement);
  }

  const totalLength = bins.reduce((sum, bin) => sum + bin.length, 0);
  return { bins, placements, totalLength };
}

// Combina varios artículos en el mismo camión, permitiendo que dos o tres
// compartan el mismo tramo de largo si sus anchos caben juntos en el ancho
// útil del camión — por ejemplo, un artículo que solo usa 1,46 m de los
// 2,45 m de ancho puede "prestar" el resto a otro artículo, que corre en
// paralelo durante ese mismo tramo en vez de ir después. No hace falta que
// cada artículo use su propia disposición óptima en solitario: a veces usar
// menos columnas (más largo para ese artículo solo) permite una combinación
// con mucho menos largo total.
//
// Para pedidos con pocas referencias distintas (hasta `MAX_EXACT_ARTICLES`)
// se calcula la partición óptima exacta (`packArticlesExact`, grupos de
// hasta 3 artículos). Con más referencias se usa una heurística voraz más
// rápida pero no garantizada óptima (`packArticlesGreedy`).
//
// Artículos con la misma huella (ancho x largo) se agrupan primero en un
// único bloque combinado (`packFootprintFamily`) que reparte sus pallets
// libremente entre columnas y huecos de pirámide; ese bloque combinado pasa
// a competir por hueco de ancho con el resto de artículos igual que uno
// cualquiera. items = [{ id, name, code, quantity }]
const MAX_EXACT_ARTICLES = 14;

function packArticles(items, truck) {
  const parsedItems = items.map((item) => ({ ...item, pallet: parsePalletCode(item.code) }));

  // Validar cada artículo por separado (mensaje de error específico) antes
  // de agrupar por huella.
  parsedItems.forEach((item) => {
    assertHeightFits(item.code, item.pallet, truck);
    const options = enumerateOptions(item.pallet, item.quantity, truck);
    if (options.length === 0) {
      throw new Error(
        `El pallet "${item.code}" no cabe en el camión (ancho útil ${truck.width} m) en ninguna orientación`
      );
    }
  });

  const familiesByKey = new Map();
  for (const item of parsedItems) {
    const key = footprintKey(item.pallet);
    if (!familiesByKey.has(key)) familiesByKey.set(key, []);
    familiesByKey.get(key).push(item);
  }

  const prepared = [];
  const soloItems = [];
  for (const group of familiesByKey.values()) {
    if (group.length >= 2) {
      const familyResult = packFootprintFamily(group, truck);
      prepared.push({
        id: `family:${group.map((g) => g.id).join(',')}`,
        isFamily: true,
        members: group,
        options: [familyResult],
      });
    } else {
      soloItems.push(group[0]);
    }
  }

  // Artículos con huellas DISTINTAS (por eso no se agruparon arriba) aún
  // pueden ir uno encima de otro si uno cabe dentro de la huella del otro y
  // las alturas suman menos que el camión (ver `applyVerticalPairing`).
  const { comboPrepared, remaining } = applyVerticalPairing(soloItems, truck);
  prepared.push(...comboPrepared);

  for (const item of remaining) {
    const options = enumerateOptions(item.pallet, item.quantity, truck);
    options.sort((a, b) => a.length - b.length || a.usedWidth - b.usedWidth);
    prepared.push({ ...item, options });
  }

  if (prepared.length === 0) return { bins: [], placements: [], totalLength: 0, alternative: null };

  if (prepared.length > MAX_EXACT_ARTICLES) {
    return { ...packArticlesGreedy(prepared, truck), alternative: null };
  }

  const maxGroup = Math.min(3, prepared.length);
  const solutions = packArticlesTopK(prepared, truck, maxGroup, 2);
  const primary = solutions[0];
  const alternative = solutions[1] && solutionSignature(solutions[1]) !== solutionSignature(primary)
    ? solutions[1]
    : null;

  return { ...primary, alternative };
}

// pedido = [{ code, quantity }, ...]
function computeOrderResult(pedido, truck) {
  const lines = pedido.map((item) => computeLineResult(item.code, item.quantity, truck));
  const totalLength = lines.reduce((sum, line) => sum + line.best.length, 0);
  return { lines, totalLength };
}

const api = {
  parsePalletCode,
  toMeters,
  enumerateOptions,
  computeLineResult,
  footprintKey,
  packFootprintFamily,
  packArticles,
  computeOrderResult,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.PalletCalc = api;
}
