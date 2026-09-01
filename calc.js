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

// Combina varios artículos en el mismo camión, permitiendo que dos (o más)
// compartan el mismo tramo de largo si sus anchos caben juntos en el ancho
// útil del camión — por ejemplo, un artículo que solo usa 1,46 m de los
// 2,45 m de ancho puede "prestar" el resto a otro artículo, que corre en
// paralelo durante ese mismo tramo en vez de ir después.
//
// Heurística voraz: se procesan los artículos de mayor a menor largo propio
// (si fuera solo); cada uno se intenta encajar en el hueco de ancho libre de
// algún tramo ya abierto (probando, para ese artículo, todas las columnas N
// posibles, no solo la que minimiza su propio largo) eligiendo la opción que
// menos aumente el largo de ese tramo; si no cabe en ninguno sin penalizar
// más que abrir un tramo nuevo, se abre un tramo nuevo con su mejor opción.
//
// items = [{ id, name, code, quantity }]
function packArticles(items, truck) {
  const prepared = items.map((item) => {
    const pallet = parsePalletCode(item.code);
    const options = enumerateOptions(pallet, item.quantity, truck);
    if (options.length === 0) {
      throw new Error(
        `El pallet "${item.code}" no cabe en el camión (ancho útil ${truck.width} m) en ninguna orientación`
      );
    }
    options.sort((a, b) => a.length - b.length || a.usedWidth - b.usedWidth);
    return { ...item, pallet, options, natural: options[0] };
  });

  prepared.sort((a, b) => b.natural.length - a.natural.length);

  const bins = []; // { usedWidth, length, items: [{ id, name, code, quantity, pallet, option }] }
  const placements = [];

  for (const item of prepared) {
    let bestChoice = null; // { cost, binIndex, option }

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

    const newBinCost = item.natural.length;
    if (!bestChoice || newBinCost < bestChoice.cost - EPS) {
      bestChoice = { cost: newBinCost, binIndex: bins.length, option: item.natural };
    }

    if (bestChoice.binIndex === bins.length) {
      bins.push({ usedWidth: bestChoice.option.usedWidth, length: bestChoice.option.length, items: [] });
    } else {
      const bin = bins[bestChoice.binIndex];
      bin.usedWidth += bestChoice.option.usedWidth;
      bin.length = Math.max(bin.length, bestChoice.option.length);
    }

    const placement = {
      id: item.id,
      name: item.name,
      code: item.code,
      quantity: item.quantity,
      pallet: item.pallet,
      binIndex: bestChoice.binIndex,
      option: bestChoice.option,
    };
    bins[bestChoice.binIndex].items.push(placement);
    placements.push(placement);
  }

  const totalLength = bins.reduce((sum, bin) => sum + bin.length, 0);
  return { bins, placements, totalLength };
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
  packArticles,
  computeOrderResult,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.PalletCalc = api;
}
