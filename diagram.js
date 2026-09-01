// Dibuja un esquema en planta (vista desde arriba) de cómo se colocan los
// pallets de cada artículo a lo largo del camión, usando SVG.
// No depende del DOM en su lógica de distribución, solo en el pintado final.

const DIAGRAM_PALETTE = [
  '#2458d6', '#1f9d55', '#c2410c', '#7c3aed',
  '#0891b2', '#be123c', '#65861d', '#9333ea',
];

const SVG_NS = 'http://www.w3.org/2000/svg';

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

function drawGridSlot(group, slotX, best, itemsInSlot, color) {
  const { N, width, lengthDim, levels } = best;
  const cols = distributeColumns(N, levels, itemsInSlot);

  for (let c = 0; c < N; c++) {
    const y = c * width;
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

function drawPyramidSlot(group, slotX, best, itemsInSlot, color) {
  const { N, width, lengthDim } = best;
  const baseCount = Math.min(N, itemsInSlot);
  const topCount = Math.min(N - 1, Math.max(0, itemsInSlot - N));

  for (let c = 0; c < N; c++) {
    const y = c * width;
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
    const filled = c < topCount;
    if (!filled) continue;
    const y = (c + 1) * width - topH / 2;
    const x = slotX + (lengthDim - topW) / 2;
    group.appendChild(el('rect', {
      x, y, width: topW, height: topH,
      class: 'pallet-cell pyramid-top',
      fill: color,
      'fill-opacity': 0.9,
    }));
  }
}

// lines: [{ name, code, ok, result: { quantity, pallet, best } }]
// truck: { width, height }
function renderTruckDiagram(container, lines, truck) {
  const valid = lines.filter((l) => l.ok);
  container.innerHTML = '';

  if (valid.length === 0) {
    const p = document.createElement('p');
    p.className = 'diagram-empty';
    p.textContent = 'Añade artículos válidos para ver la disposición en el camión.';
    container.appendChild(p);
    return;
  }

  const totalLength = valid.reduce((s, l) => s + l.result.best.length, 0);
  const svg = el('svg', {
    viewBox: `0 0 ${totalLength} ${truck.width}`,
    class: 'truck-diagram',
    preserveAspectRatio: 'xMinYMin meet',
  });

  svg.appendChild(el('rect', {
    x: 0, y: 0, width: totalLength, height: truck.width, class: 'truck-outline',
  }));

  let xCursor = 0;
  valid.forEach((line, idx) => {
    const b = line.result.best;
    const color = DIAGRAM_PALETTE[idx % DIAGRAM_PALETTE.length];
    const group = el('g', {});

    let remaining = line.result.quantity;
    for (let s = 0; s < b.slots; s++) {
      const slotX = xCursor + s * b.lengthDim;
      const itemsInSlot = Math.min(b.perSlot, remaining);
      remaining -= itemsInSlot;

      if (line.result.pallet.type === 'P') {
        drawPyramidSlot(group, slotX, b, itemsInSlot, color);
      } else {
        drawGridSlot(group, slotX, b, itemsInSlot, color);
      }

      if (s > 0) {
        group.appendChild(el('line', {
          x1: slotX, x2: slotX, y1: 0, y2: truck.width, class: 'slot-divider',
        }));
      }
    }

    const usedWidth = b.N * b.width;
    if (usedWidth < truck.width - 1e-6) {
      group.appendChild(el('rect', {
        x: xCursor, y: usedWidth, width: b.length, height: truck.width - usedWidth,
        class: 'unused-width',
      }));
    }

    svg.appendChild(group);
    xCursor += b.length;

    if (idx < valid.length - 1) {
      svg.appendChild(el('line', {
        x1: xCursor, x2: xCursor, y1: 0, y2: truck.width, class: 'article-divider',
      }));
    }
  });

  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'diagram-legend';
  valid.forEach((line, idx) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<i style="background:${DIAGRAM_PALETTE[idx % DIAGRAM_PALETTE.length]}"></i>${
      line.name ? `${line.name} — ` : ''
    }${line.code} (${line.result.best.length.toFixed(2)} m)`;
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
