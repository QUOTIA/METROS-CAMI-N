// Dibuja un esquema en planta de cómo se colocan los pallets de cada
// artículo a lo largo del camión, usando SVG — girado de forma que el largo
// del camión corre verticalmente de arriba (cabecera) a abajo (puertas).
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

// Anota una celda (pallet) con su ancho (borde superior) y su largo (borde
// izquierdo, en vertical) para poder verificar a ojo qué medidas suman el total.
function labelCell(group, x, y, width, lengthDim) {
  const widthLabel = el('text', {
    x: x + width / 2, y: y + 0.09,
    class: 'dim-label', 'text-anchor': 'middle',
  });
  widthLabel.textContent = fmtM(width);
  group.appendChild(widthLabel);

  const lengthLabel = el('text', {
    x: x + 0.08, y: y + lengthDim / 2,
    class: 'dim-label',
    'text-anchor': 'middle',
    transform: `rotate(-90 ${x + 0.08} ${y + lengthDim / 2})`,
  });
  lengthLabel.textContent = fmtM(lengthDim);
  group.appendChild(lengthLabel);
}

// slotY: posición a lo largo (vertical) donde empieza esta fila.
// xOffset: posición a lo ancho (horizontal) donde empieza el carril de este artículo.
function drawGridSlot(group, slotY, opt, itemsInSlot, color, xOffset) {
  const { N, width, lengthDim, levels } = opt;
  const cols = distributeColumns(N, levels, itemsInSlot);

  for (let c = 0; c < N; c++) {
    const x = xOffset + c * width;
    const filled = cols[c] > 0;
    const rect = el('rect', {
      x, y: slotY, width, height: lengthDim,
      class: filled ? 'pallet-cell' : 'pallet-cell empty',
      fill: filled ? color : 'none',
      'fill-opacity': filled ? (cols[c] / levels) * 0.55 + 0.35 : 0,
    });
    group.appendChild(rect);

    if (filled) {
      labelCell(group, x, slotY, width, lengthDim);
      if (levels > 1) {
        const label = el('text', {
          x: x + width / 2,
          y: slotY + lengthDim / 2,
          class: 'cell-badge',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        });
        label.textContent = `×${cols[c]}`;
        group.appendChild(label);
      }
    }
  }
}

function drawPyramidSlot(group, slotY, opt, itemsInSlot, color, xOffset) {
  const { N, width, lengthDim } = opt;
  const baseCount = Math.min(N, itemsInSlot);
  const topCount = Math.min(N - 1, Math.max(0, itemsInSlot - N));

  for (let c = 0; c < N; c++) {
    const x = xOffset + c * width;
    const filled = c < baseCount;
    group.appendChild(el('rect', {
      x, y: slotY, width, height: lengthDim,
      class: filled ? 'pallet-cell' : 'pallet-cell empty',
      fill: filled ? color : 'none',
      'fill-opacity': filled ? 0.55 : 0,
    }));
    if (filled) labelCell(group, x, slotY, width, lengthDim);
  }

  const topW = width * 0.6;
  const topH = lengthDim * 0.6;
  for (let c = 0; c < N - 1; c++) {
    if (c >= topCount) continue;
    const x = xOffset + (c + 1) * width - topW / 2;
    const y = slotY + (lengthDim - topH) / 2;
    group.appendChild(el('rect', {
      x, y, width: topW, height: topH,
      class: 'pallet-cell pyramid-top',
      fill: color,
      'fill-opacity': 0.9,
    }));
  }
}

// Dibuja un artículo (una entrada de `bin.items`) dentro de su carril,
// ocupando de `yStart` a `yStart + opt.length`; si el tramo (bin) es más
// largo que lo que este artículo necesita, el resto del carril se marca
// como hueco sin usar.
function drawPlacement(svg, placement, yStart, binLength, xOffset, color) {
  const group = el('g', {});
  const opt = placement.option;
  let remaining = placement.quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotY = yStart + s * opt.lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;

    if (placement.pallet.type === 'P') {
      drawPyramidSlot(group, slotY, opt, itemsInSlot, color, xOffset);
    } else {
      drawGridSlot(group, slotY, opt, itemsInSlot, color, xOffset);
    }

    if (s > 0) {
      group.appendChild(el('line', {
        x1: xOffset, x2: xOffset + opt.usedWidth, y1: slotY, y2: slotY, class: 'slot-divider',
      }));
    }
  }

  if (opt.length < binLength - DIAG_EPS) {
    group.appendChild(el('rect', {
      x: xOffset, y: yStart + opt.length, width: opt.usedWidth, height: binLength - opt.length,
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
    viewBox: `0 0 ${truck.width} ${packResult.totalLength}`,
    class: 'truck-diagram',
    preserveAspectRatio: 'xMidYMin meet',
  });
  svg.appendChild(el('rect', {
    x: 0, y: 0, width: truck.width, height: packResult.totalLength, class: 'truck-outline',
  }));

  let yCursor = 0;
  packResult.bins.forEach((bin, binIdx) => {
    let xCursor = 0;
    bin.items.forEach((placement) => {
      const color = colorById.get(placement.id) || DIAGRAM_PALETTE[0];
      drawPlacement(svg, placement, yCursor, bin.length, xCursor, color);
      xCursor += placement.option.usedWidth;
    });

    if (xCursor < truck.width - DIAG_EPS) {
      svg.appendChild(el('rect', {
        x: xCursor, y: yCursor, width: truck.width - xCursor, height: bin.length, class: 'unused-width',
      }));
    }

    yCursor += bin.length;
    if (binIdx < packResult.bins.length - 1) {
      svg.appendChild(el('line', { x1: 0, x2: truck.width, y1: yCursor, y2: yCursor, class: 'article-divider' }));
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
