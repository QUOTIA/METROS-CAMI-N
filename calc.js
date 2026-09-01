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

// Calcula, para una línea de pedido (medida + cantidad), la mejor orientación
// para minimizar los metros de largo de camión ocupados.
function computeLineResult(code, quantity, truck) {
  const pallet = parsePalletCode(code);
  const { dimA, dimB } = pallet;
  const truckWidth = truck.width;
  const truckHeight = truck.height;

  const orientations = dimA === dimB ? [[dimA, dimB]] : [[dimA, dimB], [dimB, dimA]];

  const candidates = [];
  for (const [width, lengthDim] of orientations) {
    const N = floorDiv(truckWidth, width);
    if (N < 1) continue; // el pallet no cabe a lo ancho en esta orientación

    const stacking = stackingForOrientation(pallet, N, truckHeight);
    if (!stacking || stacking.perSlot < 1) continue;

    const slots = ceilDiv(quantity, stacking.perSlot);
    const length = slots * lengthDim;

    candidates.push({
      width,
      lengthDim,
      N,
      ...stacking,
      slots,
      length,
    });
  }

  if (candidates.length === 0) {
    throw new Error(
      `El pallet "${code}" no cabe en el camión (ancho útil ${truckWidth} m) en ninguna orientación`
    );
  }

  candidates.sort((a, b) => a.length - b.length);
  const best = candidates[0];

  return { code, quantity, pallet, best, candidates };
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
  computeLineResult,
  computeOrderResult,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.PalletCalc = api;
}
