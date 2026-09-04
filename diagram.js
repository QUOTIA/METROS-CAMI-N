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
  // Cada columna puede tener su propio ancho y largo si el pallet se mezcla
  // en dos orientaciones distintas en la misma fila (ver
  // `enumerateRectOptions`) — el largo de la fila es el de la columna más
  // profunda, así que una columna más corta deja un hueco sin usar debajo.
  const columnWidths = opt.columnWidths || new Array(N).fill(width);
  const columnLengths = opt.columnLengths || new Array(N).fill(lengthDim);
  const cols = distributeColumns(N, levels, itemsInSlot);

  let x = xOffset;
  for (let c = 0; c < N; c++) {
    const colWidth = columnWidths[c];
    const colLength = columnLengths[c];
    const filled = cols[c] > 0;
    const rect = el('rect', {
      x, y: slotY, width: colWidth, height: colLength,
      class: filled ? 'pallet-cell' : 'pallet-cell empty',
      fill: filled ? color : 'none',
      'fill-opacity': filled ? (cols[c] / levels) * 0.55 + 0.35 : 0,
    });
    group.appendChild(rect);

    if (filled) {
      labelCell(group, x, slotY, colWidth, colLength);
      if (levels > 1) {
        const label = el('text', {
          x: x + colWidth / 2,
          y: slotY + colLength / 2,
          class: 'cell-badge',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        });
        label.textContent = `×${cols[c]}`;
        group.appendChild(label);
      }
    }

    if (colLength < lengthDim - DIAG_EPS) {
      group.appendChild(el('rect', {
        x, y: slotY + colLength, width: colWidth, height: lengthDim - colLength,
        class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
      }));
    }

    x += colWidth;
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

// Dibuja una celda (una columna de una fila) que puede contener pallets de
// varias referencias apiladas: se subdivide en tantas bandas horizontales
// como pallets haya en la pila, cada una con el color de su referencia.
function drawStackCell(group, x, y, width, lengthDim, stackItems, colorById) {
  const bandHeight = lengthDim / stackItems.length;
  stackItems.forEach((item, i) => {
    const bandY = y + i * bandHeight;
    group.appendChild(el('rect', {
      x, y: bandY, width, height: bandHeight,
      class: 'pallet-cell',
      fill: colorById.get(item.id) || DIAGRAM_PALETTE[0],
      'fill-opacity': 0.8,
    }));
    if (stackItems.length > 1) {
      const label = el('text', {
        x: x + width / 2, y: bandY + bandHeight / 2,
        class: 'cell-badge', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      });
      label.textContent = fmtM(item.height);
      group.appendChild(label);
    }
  });
  labelCell(group, x, y, width, lengthDim);
}

function drawNestedRow(group, slotY, N, width, lengthDim, xOffset, items, colorById) {
  const topW = width * 0.6;
  const topH = lengthDim * 0.6;
  for (let c = 0; c < N - 1; c++) {
    const item = items[c];
    if (!item) continue;
    const x = xOffset + (c + 1) * width - topW / 2;
    const y = slotY + (lengthDim - topH) / 2;
    group.appendChild(el('rect', {
      x, y, width: topW, height: topH, class: 'pallet-cell pyramid-top',
      fill: colorById.get(item.id) || DIAGRAM_PALETTE[0], 'fill-opacity': 0.9,
    }));
  }
}

// Dibuja un bloque combinado (`packFootprintFamily`): primero las filas en
// pirámide completas (base N + (N-1) encima, todas del mismo tipo P), y a
// continuación las filas normales que reparten el resto (D y P sueltos)
// entre columnas, mezclando referencias distintas en la misma columna
// cuando hace falta.
function drawFamilyPlacement(svg, placement, yStart, binLength, xOffset, colorById) {
  const group = el('g', {});
  const opt = placement.option;
  const { pyramidGroups, plainRowGroups = [] } = opt;
  let y = yStart;
  let firstRowOverall = true;

  // Línea entre filas: normal salvo justo donde empieza un grupo de filas
  // normales con una orientación DISTINTA a la anterior (isMixedPlainRows) —
  // ahí una línea más marcada deja claro que a partir de ese punto cambia el
  // ancho de columna.
  function divider(x2, isGroupBoundary) {
    if (firstRowOverall) {
      firstRowOverall = false;
      return;
    }
    group.appendChild(el('line', {
      x1: xOffset, x2, y1: y, y2: y, class: isGroupBoundary ? 'article-divider' : 'slot-divider',
    }));
  }

  pyramidGroups.forEach(({ base, top }) => {
    const { N, width, lengthDim } = opt;
    divider(xOffset + N * width, false);
    for (let c = 0; c < N; c++) {
      const x = xOffset + c * width;
      const item = base[c];
      if (item) {
        group.appendChild(el('rect', {
          x, y, width, height: lengthDim, class: 'pallet-cell',
          fill: colorById.get(item.id) || DIAGRAM_PALETTE[0], 'fill-opacity': 0.55,
        }));
        labelCell(group, x, y, width, lengthDim);
      } else {
        group.appendChild(el('rect', {
          x, y, width, height: lengthDim, class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
        }));
      }
    }
    if (N >= 2) drawNestedRow(group, y, N, width, lengthDim, xOffset, top, colorById);
    y += lengthDim;
  });

  // Las filas normales (D + P sueltos) pueden repartirse en más de un grupo
  // con su PROPIA orientación (`isMixedPlainRows`, ver `packFootprintFamily`)
  // cuando eso deja menos hueco sin usar que forzarlas todas a la misma
  // orientación que la fila piramidal.
  plainRowGroups.forEach((rowGroup, gi) => {
    const { N: gN, width: gWidth, lengthDim: gLengthDim, columnBins: gBins } = rowGroup;
    for (let r = 0; r < rowGroup.rowsCount; r++) {
      divider(xOffset + gN * gWidth, gi > 0 && r === 0);
      const rowBins = gBins.slice(r * gN, (r + 1) * gN);
      for (let c = 0; c < gN; c++) {
        const x = xOffset + c * gWidth;
        const stackItems = rowBins[c];
        if (stackItems && stackItems.length > 0) {
          drawStackCell(group, x, y, gWidth, gLengthDim, stackItems, colorById);
        } else {
          group.appendChild(el('rect', {
            x, y, width: gWidth, height: gLengthDim, class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
          }));
        }
      }
      y += gLengthDim;
    }
  });

  if (opt.length < binLength - DIAG_EPS) {
    group.appendChild(el('rect', {
      x: xOffset, y: yStart + opt.length, width: opt.usedWidth,
      height: binLength - opt.length, class: 'unused-width',
    }));
  }

  svg.appendChild(group);
}

// Dibuja las columnas de UN grupo (misma orientación) de una disposición
// mezclada en columnas independientes: sus propias filas, de su propio
// largo, sin depender de lo que haga el otro grupo.
function drawGroupColumns(group, yStart, grp, color, xOffset) {
  let remaining = grp.qty;
  const perSlot = grp.count * grp.levels;

  for (let s = 0; s < grp.slots; s++) {
    const slotY = yStart + s * grp.lengthDim;
    const itemsInSlot = Math.min(perSlot, remaining);
    remaining -= itemsInSlot;
    const cols = distributeColumns(grp.count, grp.levels, itemsInSlot);

    for (let c = 0; c < grp.count; c++) {
      const x = xOffset + c * grp.width;
      const filled = cols[c] > 0;
      group.appendChild(el('rect', {
        x, y: slotY, width: grp.width, height: grp.lengthDim,
        class: filled ? 'pallet-cell' : 'pallet-cell empty',
        fill: filled ? color : 'none',
        'fill-opacity': filled ? (cols[c] / grp.levels) * 0.55 + 0.35 : 0,
      }));
      if (filled) {
        labelCell(group, x, slotY, grp.width, grp.lengthDim);
        if (grp.levels > 1) {
          const label = el('text', {
            x: x + grp.width / 2, y: slotY + grp.lengthDim / 2,
            class: 'cell-badge', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
          });
          label.textContent = `×${cols[c]}`;
          group.appendChild(label);
        }
      }
    }

    if (s > 0) {
      group.appendChild(el('line', {
        x1: xOffset, x2: xOffset + grp.count * grp.width, y1: slotY, y2: slotY, class: 'slot-divider',
      }));
    }
  }
}

// Dibuja una disposición que reparte un mismo artículo en dos grupos de
// columnas de orientación distinta, cada uno apilándose de forma
// INDEPENDIENTE desde el principio del tramo (ver `enumerateRectOptions`,
// `isSplitMixed`) — el grupo más corto deja un hueco sin usar hasta
// alcanzar el largo del más profundo.
function drawSplitMixedPlacement(svg, placement, yStart, binLength, xOffset, color) {
  const group = el('g', {});
  const opt = placement.option;
  let x = xOffset;

  opt.groups.forEach((grp) => {
    if (grp.count === 0) return;
    const groupWidth = grp.count * grp.width;
    if (grp.qty > 0) {
      drawGroupColumns(group, yStart, grp, color, x);
      if (grp.depth < opt.length - DIAG_EPS) {
        group.appendChild(el('rect', {
          x, y: yStart + grp.depth, width: groupWidth, height: opt.length - grp.depth,
          class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
        }));
      }
    } else {
      group.appendChild(el('rect', {
        x, y: yStart, width: groupWidth, height: opt.length, class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
      }));
    }
    x += groupWidth;
  });

  if (opt.length < binLength - DIAG_EPS) {
    group.appendChild(el('rect', {
      x: xOffset, y: yStart + opt.length, width: opt.usedWidth, height: binLength - opt.length,
      class: 'unused-width',
    }));
  }

  svg.appendChild(group);
}

// Dibuja una disposición que reparte un mismo artículo en dos TRAMOS
// CONSECUTIVOS de orientación distinta, cada uno usando todo el ancho
// disponible (ver `enumerateRectOptions`, `isSequentialMixed`) — a
// diferencia de `drawSplitMixedPlacement` (columnas de las dos orientaciones
// en PARALELO, cada una a su propio ancho parcial), aquí un tramo entero usa
// una orientación y el siguiente tramo usa la otra, uno detrás de otro en el
// sentido del largo.
function drawSequentialMixedPlacement(svg, placement, yStart, binLength, xOffset, color) {
  const group = el('g', {});
  const opt = placement.option;
  let y = yStart;

  opt.stages.forEach((stage, i) => {
    if (stage.qty > 0) {
      drawGroupColumns(group, y, { count: stage.N, width: stage.width, lengthDim: stage.lengthDim, levels: stage.levels, qty: stage.qty, slots: stage.slots }, color, xOffset);
    }
    if (i > 0) {
      group.appendChild(el('line', { x1: xOffset, x2: xOffset + opt.usedWidth, y1: y, y2: y, class: 'article-divider' }));
    }
    y += stage.depth;
  });

  if (opt.length < binLength - DIAG_EPS) {
    group.appendChild(el('rect', {
      x: xOffset, y: yStart + opt.length, width: opt.usedWidth, height: binLength - opt.length,
      class: 'unused-width',
    }));
  }

  svg.appendChild(group);
}

// Dibuja un artículo (una entrada de `bin.items`) dentro de su carril,
// ocupando de `yStart` a `yStart + opt.length`; si el tramo (bin) es más
// largo que lo que este artículo necesita, el resto del carril se marca
// como hueco sin usar.
function drawPlacement(svg, placement, yStart, binLength, xOffset, color) {
  const opt = placement.option;

  if (opt.isSplitMixed) {
    drawSplitMixedPlacement(svg, placement, yStart, binLength, xOffset, color);
    return;
  }
  if (opt.isSequentialMixed) {
    drawSequentialMixedPlacement(svg, placement, yStart, binLength, xOffset, color);
    return;
  }

  const group = el('g', {});
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

// Dibuja un apilado vertical entre dos artículos de huella DISTINTA (uno de
// base, otro encima — ver calc.js `applyVerticalPairing`): cada columna
// llena se dibuja como una celda con dos bandas (base abajo, encima arriba),
// reutilizando el mismo lenguaje visual que las columnas mezcladas de
// `drawFamilyPlacement`, para dejar claro que son dos referencias distintas
// compartiendo la misma columna en vertical.
function drawVerticalComboPlacement(svg, placement, yStart, binLength, xOffset, colorById) {
  const group = el('g', {});
  const opt = placement.option;
  const stackItems = [
    { id: placement.base.id, height: placement.base.pallet.height },
    { id: placement.topper.id, height: placement.topper.pallet.height },
  ];
  let remaining = placement.quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotY = yStart + s * opt.lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;

    let x = xOffset;
    for (let c = 0; c < opt.N; c++) {
      const colWidth = opt.columnWidths[c];
      const colLength = opt.columnLengths[c];
      if (c < itemsInSlot) {
        drawStackCell(group, x, slotY, colWidth, colLength, stackItems, colorById);
      } else {
        group.appendChild(el('rect', {
          x, y: slotY, width: colWidth, height: colLength, class: 'pallet-cell empty', fill: 'none', 'fill-opacity': 0,
        }));
      }
      x += colWidth;
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
      if (placement.isFamily) {
        drawFamilyPlacement(svg, placement, yCursor, bin.length, xCursor, colorById);
      } else if (placement.isVerticalCombo) {
        drawVerticalComboPlacement(svg, placement, yCursor, bin.length, xCursor, colorById);
      } else {
        const color = colorById.get(placement.id) || DIAGRAM_PALETTE[0];
        drawPlacement(svg, placement, yCursor, bin.length, xCursor, color);
      }
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

  // Para la leyenda, cada artículo original (aunque forme parte de un bloque
  // combinado) se busca por su propio id, no por el id del bloque.
  const entryById = new Map();
  packResult.placements.forEach((placement) => {
    if (placement.isFamily) {
      placement.members.forEach((member) => entryById.set(member.id, { member, option: placement.option }));
    } else if (placement.isVerticalCombo) {
      entryById.set(placement.base.id, { member: placement.base, option: placement.option });
      entryById.set(placement.topper.id, { member: placement.topper, option: placement.option });
    } else {
      entryById.set(placement.id, { member: placement, option: placement.option });
    }
  });

  const legend = document.createElement('div');
  legend.className = 'diagram-legend';
  orderedIds.forEach((id) => {
    const entry = entryById.get(id);
    if (!entry) return;
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<i style="background:${colorById.get(id)}"></i>${
      entry.member.name ? `${entry.member.name} — ` : ''
    }${entry.member.code} (${fmtM(entry.option.length)} m)`;
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
