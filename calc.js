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

// Enumera, para cada orientación posible del pallet, TODAS las opciones de
// cuántas columnas (N) usar a lo ancho del camión (de 1 hasta el máximo que
// cabe). Usar menos columnas que el máximo genera más metros de largo para
// este artículo, pero libera ancho para que otro artículo pueda colocarse
// al lado (ver `packArticles`).
function enumerateOptions(pallet, quantity, truck) {
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

// Calcula, para una línea de pedido (medida + cantidad), la mejor orientación
// para minimizar los metros de largo de camión ocupados, sin compartir ancho
// con ningún otro artículo (ver `packArticles` para la versión combinada).
function computeLineResult(code, quantity, truck) {
  const pallet = parsePalletCode(code);
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
// largo) en un único bloque: sus pallets se reparten libremente entre las N
// columnas a lo ancho (mezclando referencias distintas en la misma columna,
// una encima de otra, mientras quepan en altura) y, si N >= 2, también en
// los N-1 huecos "nesteados" de tipo pirámide entre columnas (un pallet
// suelto de cualquier referencia, sin más apilado encima). Se calcula el
// menor número de filas necesario para colocar todos los pallets del grupo.
//
// articles = [{ id, name, code, quantity, pallet }] (misma huella entre sí)
function packFootprintFamily(articles, truck) {
  const { dimA, dimB } = articles[0].pallet;
  const orientations = dimA === dimB ? [[dimA, dimB]] : [[dimA, dimB], [dimB, dimA]];

  const pool = [];
  for (const art of articles) {
    for (let i = 0; i < art.quantity; i++) {
      pool.push({ id: art.id, name: art.name, code: art.code, height: art.pallet.height });
    }
  }

  let best = null;
  for (const [width, lengthDim] of orientations) {
    const N = floorDiv(truck.width, width);
    if (N < 1) continue;

    const bins = packHeightsFFD(pool, truck.height);
    const singles = bins.filter((b) => b.items.length === 1);
    const nonSingles = bins.filter((b) => b.items.length > 1);

    let chosenRows = bins.length; // cota superior segura (sin usar nesteado)
    for (let r = 1; r <= bins.length; r++) {
      const nestedCapacity = r * Math.max(0, N - 1);
      const leftoverSingles = Math.max(0, singles.length - nestedCapacity);
      const columnBinsNeeded = nonSingles.length + leftoverSingles;
      if (columnBinsNeeded <= r * N) {
        chosenRows = r;
        break;
      }
    }

    const nestedCapacity = chosenRows * Math.max(0, N - 1);
    const offloadCount = Math.min(singles.length, nestedCapacity);
    const nestedItems = singles.slice(0, offloadCount).map((b) => b.items[0]);
    const columnBins = [...nonSingles, ...singles.slice(offloadCount)].map((b) => b.items);

    const length = chosenRows * lengthDim;
    const usedWidth = N * width;

    if (!best || length < best.length - EPS) {
      best = { width, lengthDim, N, rows: chosenRows, length, usedWidth, columnBins, nestedItems, isFamily: true };
    }
  }

  return best;
}

// Para un grupo de artículos (índices en `prepared`) que compartirían el
// mismo tramo de largo, prueba TODAS las combinaciones de sus opciones
// (orientación + columnas) y devuelve la que quepa a lo ancho del camión
// minimizando el largo del tramo (el mayor largo de los artículos del
// grupo). Devuelve null si ninguna combinación cabe junta.
function bestGroupAssignment(indices, prepared, truck) {
  let combos = [[]];
  for (const idx of indices) {
    const next = [];
    for (const combo of combos) {
      for (const opt of prepared[idx].options) next.push([...combo, opt]);
    }
    combos = next;
  }

  let best = null;
  for (const combo of combos) {
    const totalWidth = combo.reduce((sum, opt) => sum + opt.usedWidth, 0);
    if (totalWidth > truck.width + EPS) continue;
    const length = combo.reduce((max, opt) => Math.max(max, opt.length), 0);
    if (!best || length < best.length - EPS) best = { length, combo };
  }
  return best;
}

function makePlacement(item, option, binIndex) {
  if (item.isFamily) {
    return { id: item.id, isFamily: true, members: item.members, binIndex, option };
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

// Busca la partición ÓPTIMA de los artículos en tramos (grupos de hasta
// `maxGroup` artículos que comparten tramo), minimizando la suma de los
// largos de cada tramo. Programación dinámica sobre subconjuntos (bitmask):
// dp[mask] = menor largo total para cubrir exactamente los artículos de
// `mask`. Cada grupo candidato se evalúa una sola vez (memoizado por su
// máscara) aunque aparezca en muchos subproblemas.
function packArticlesExact(prepared, truck, maxGroup) {
  const n = prepared.length;
  const fullMask = (1 << n) - 1;
  const groupCache = new Map();

  function getGroupResult(indices) {
    let mask = 0;
    for (const idx of indices) mask |= 1 << idx;
    if (groupCache.has(mask)) return groupCache.get(mask);
    const result = bestGroupAssignment(indices, prepared, truck);
    groupCache.set(mask, result);
    return result;
  }

  const dp = new Array(1 << n).fill(Infinity);
  const choice = new Array(1 << n).fill(null); // { indices, result }
  dp[0] = 0;

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

    for (const indices of candidateGroups) {
      const result = getGroupResult(indices);
      if (!result) continue;
      let groupMask = 0;
      for (const idx of indices) groupMask |= 1 << idx;
      const remaining = mask ^ groupMask;
      const total = result.length + dp[remaining];
      if (total < dp[mask] - EPS) {
        dp[mask] = total;
        choice[mask] = { indices, result };
      }
    }
  }

  const groups = [];
  let mask = fullMask;
  while (mask !== 0) {
    const { indices, result } = choice[mask];
    groups.push({ indices, result });
    let groupMask = 0;
    for (const idx of indices) groupMask |= 1 << idx;
    mask ^= groupMask;
  }

  return buildBinsFromGroups(groups, prepared);
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
      const item = group[0];
      const options = enumerateOptions(item.pallet, item.quantity, truck);
      options.sort((a, b) => a.length - b.length || a.usedWidth - b.usedWidth);
      prepared.push({ ...item, options });
    }
  }

  if (prepared.length === 0) return { bins: [], placements: [], totalLength: 0 };

  if (prepared.length > MAX_EXACT_ARTICLES) {
    return packArticlesGreedy(prepared, truck);
  }

  const maxGroup = Math.min(3, prepared.length);
  return packArticlesExact(prepared, truck, maxGroup);
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
