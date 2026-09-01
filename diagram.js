// Dibuja un esquema en planta (vista desde arriba) de cómo se colocan los
// pallets de cada artículo a lo largo del camión, usando SVG.
// Recibe el resultado de `packArticles` (calc.js): tramos de largo (bins),
// cada uno con uno o varios artículos colocados lado a lado a lo ancho.
// No depende del DOM en su lógica de distribución, solo en el pintado final.

const DIAGRAM_PALETTE = [
  '#2458d6', '#1f9d55', '#c2410c', '#7c3aed',
  '#0891b2', '#be123c', '#65861d', '#9333ea',
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const DIAG_EPS = 1e-6;

function fmtM(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Reparte `itemsInSlot` pallets entre `N` columnas, llenando cada columna
// hasta `levelsPerColumn` antes de pasar a la siguiente (orden de carga
// típico: se apila una columna entera antes de empezar la siguiente).
function distributeColumns(N, levelsPerColumn, itemsInSlot) {
  const cols = new Array(N).fill(0);
  let remaining = itemsInSlot;
  for (let c = 0; c < N && remaining > 0; c++) {
    const take = Math.min(levelsPerColumn, remaining);
    cols[c] = take;
    remaining -= take;
  }
  return cols;
}

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function drawGridSlot(group, slotX, opt, itemsInSlot, color, yOffset) {
  const { N, width, lengthDim, levels } = opt;
  const cols = distributeColumns(N, levels, itemsInSlot);

  for (let c = 0; c < N; c++) {
    const y = yOffset + c * width;
    const filled = cols[c] > 0;
    const rect = el('rect', {
      x: slotX, y, width: lengthDim, height: width,
      class: filled ? 'pallet-cell' : 'pallet-cell empty',
      fill: filled ? color : 'none',
      'fill-opacity': filled ? (cols[c] / levels) * 0.55 + 0.35 : 0,
    });
    group.appendChild(rect);

    if (filled && levels > 1) {
      const label = el('text', {
        x: slotX + lengthDim / 2,
        y: y + width / 2,
        class: 'cell-badge',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      label.textContent = `×${cols[c]}`;
      group.appendChild(label);
    }
  }
}

function drawPyramidSlot(group, slotX, opt, itemsInSlot, color, yOffset) {
  const { N, width, lengthDim } = opt;
  const baseCount = Math.min(N, itemsInSlot);
  const topCount = Math.min(N - 1, Math.max(0, itemsInSlot - N));

  for (let c = 0; c < N; c++) {
    const y = yOffset + c * width;
    const filled = c < baseCount;
    group.appendChild(el('rect', {
      x: slotX, y, width: lengthDim, height: width,
      class: filled ? 'pallet-cell' : 'pallet-cell empty',
      fill: filled ? color : 'none',
      'fill-opacity': filled ? 0.55 : 0,
    }));
  }

  const topW = lengthDim * 0.6;
  const topH = width * 0.6;
  for (let c = 0; c < N - 1; c++) {
    if (c >= topCount) continue;
    const y = yOffset + (c + 1) * width - topH / 2;
    const x = slotX + (lengthDim - topW) / 2;
    group.appendChild(el('rect', {
      x, y, width: topW, height: topH,
      class: 'pallet-cell pyramid-top',
      fill: color,
      'fill-opacity': 0.9,
    }));
  }
}

// Dibuja un artículo (una entrada de `bin.items`) dentro de su carril,
// ocupando de `xStart` a `xStart + opt.length`; si el tramo (bin) es más
// largo que lo que este artículo necesita, el resto del carril se marca
// como hueco sin usar.
function drawPlacement(svg, placement, xStart, binLength, yOffset, color) {
  const group = el('g', {});
  const opt = placement.option;
  let remaining = placement.quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotX = xStart + s * opt.lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;

    if (placement.pallet.type === 'P') {
      drawPyramidSlot(group, slotX, opt, itemsInSlot, color, yOffset);
    } else {
      drawGridSlot(group, slotX, opt, itemsInSlot, color, yOffset);
    }

    if (s > 0) {
      group.appendChild(el('line', {
        x1: slotX, x2: slotX, y1: yOffset, y2: yOffset + opt.usedWidth, class: 'slot-divider',
      }));
    }
  }

  if (opt.length < binLength - DIAG_EPS) {
    group.appendChild(el('rect', {
      x: xStart + opt.length, y: yOffset, width: binLength - opt.length, height: opt.usedWidth,
      class: 'unused-width',
    }));
  }

  svg.appendChild(group);
}

// packResult: { bins, placements, totalLength } — ver calc.js `packArticles`.
// truck: { width, height }.
// orderedIds: ids de los artículos en el orden en que aparecen en la tabla,
// para que cada uno mantenga siempre el mismo color aunque el empaquetado
// los reordene entre tramos.
function renderTruckDiagram(container, packResult, truck, orderedIds) {
  container.innerHTML = '';

  if (!packResult || packResult.bins.length === 0) {
    const p = document.createElement('p');
    p.className = 'diagram-empty';
    p.textContent = 'Añade artículos válidos para ver la disposición en el camión.';
    container.appendChild(p);
    return;
  }

  const colorById = new Map();
  orderedIds.forEach((id, i) => colorById.set(id, DIAGRAM_PALETTE[i % DIAGRAM_PALETTE.length]));

  const svg = el('svg', {
    viewBox: `0 0 ${packResult.totalLength} ${truck.width}`,
    class: 'truck-diagram',
    preserveAspectRatio: 'xMinYMin meet',
  });
  svg.appendChild(el('rect', {
    x: 0, y: 0, width: packResult.totalLength, height: truck.width, class: 'truck-outline',
  }));

  let xCursor = 0;
  packResult.bins.forEach((bin, binIdx) => {
    let yCursor = 0;
    bin.items.forEach((placement) => {
      const color = colorById.get(placement.id) || DIAGRAM_PALETTE[0];
      drawPlacement(svg, placement, xCursor, bin.length, yCursor, color);
      yCursor += placement.option.usedWidth;
    });

    if (yCursor < truck.width - DIAG_EPS) {
      svg.appendChild(el('rect', {
        x: xCursor, y: yCursor, width: bin.length, height: truck.width - yCursor, class: 'unused-width',
      }));
    }

    xCursor += bin.length;
    if (binIdx < packResult.bins.length - 1) {
      svg.appendChild(el('line', { x1: xCursor, x2: xCursor, y1: 0, y2: truck.width, class: 'article-divider' }));
    }
  });

  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'diagram-legend';
  const placementById = new Map(packResult.placements.map((p) => [p.id, p]));
  orderedIds.forEach((id) => {
    const placement = placementById.get(id);
    if (!placement) return;
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<i style="background:${colorById.get(id)}"></i>${
      placement.name ? `${placement.name} — ` : ''
    }${placement.code} (${fmtM(placement.option.length)} m)`;
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderTruckDiagram, distributeColumns };
}
if (typeof window !== 'undefined') {
  window.renderTruckDiagram = renderTruckDiagram;
}
