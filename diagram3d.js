// Traduce el resultado de `packArticles` (calc.js) a una lista de cajas 3D
// (una por cada pallet real, con su alto real, no solo la opacidad que usa
// el plano 2D de diagram.js) para poder pintarlas con Three.js.
//
// Sistema de coordenadas: X = ancho del camión (0..truck.width), Y = alto
// (0 = suelo, hacia arriba con la altura real de cada pallet apilado),
// Z = largo del camión (0 = cabecera, totalLength = puertas) — el mismo
// sentido que el eje vertical del SVG en planta de diagram.js, así que la
// disposición en X/Z coincide exactamente con la vista en planta.
//
// No depende del DOM: se puede probar con node igual que `distributeColumns`.

const DIAG3D_EPS = 1e-6;

// Reparte `itemsInSlot` pallets entre `N` columnas, llenando cada columna
// hasta `levelsPerColumn` antes de pasar a la siguiente — misma regla que
// `distributeColumns` en diagram.js (duplicada aquí para no depender de que
// diagram.js exponga la función en `window`).
function distributeColumns3D(N, levelsPerColumn, itemsInSlot) {
  const cols = new Array(N).fill(0);
  let remaining = itemsInSlot;
  for (let c = 0; c < N && remaining > 0; c++) {
    const take = Math.min(levelsPerColumn, remaining);
    cols[c] = take;
    remaining -= take;
  }
  return cols;
}

function addGridPlacement(boxes, pallet, opt, quantity, xOffset, zStart, refId) {
  const { N, levels } = opt;
  const columnWidths = opt.columnWidths || new Array(N).fill(opt.width);
  const columnLengths = opt.columnLengths || new Array(N).fill(opt.lengthDim);
  let remaining = quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotZ = zStart + s * opt.lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;
    const cols = distributeColumns3D(N, levels, itemsInSlot);

    let x = xOffset;
    for (let c = 0; c < N; c++) {
      const colWidth = columnWidths[c];
      const colLength = columnLengths[c];
      for (let lvl = 0; lvl < cols[c]; lvl++) {
        boxes.push({ refId, x, y: lvl * pallet.height, z: slotZ, w: colWidth, h: pallet.height, d: colLength });
      }
      x += colWidth;
    }
  }
}

function addPyramidPlacement(boxes, pallet, opt, quantity, xOffset, zStart, refId) {
  const { N, lengthDim, width } = opt;
  let remaining = quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotZ = zStart + s * lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;
    const baseCount = Math.min(N, itemsInSlot);
    const topCount = Math.min(N - 1, Math.max(0, itemsInSlot - N));

    for (let c = 0; c < baseCount; c++) {
      boxes.push({ refId, x: xOffset + c * width, y: 0, z: slotZ, w: width, h: pallet.height, d: lengthDim });
    }

    const topW = width * 0.6;
    const topD = lengthDim * 0.6;
    for (let c = 0; c < topCount; c++) {
      const x = xOffset + (c + 1) * width - topW / 2;
      const z = slotZ + (lengthDim - topD) / 2;
      boxes.push({ refId, x, y: pallet.height, z, w: topW, h: pallet.height, d: topD });
    }
  }
}

function addSplitMixedPlacement(boxes, pallet, opt, xOffset, zStart, refId) {
  let x = xOffset;
  opt.groups.forEach((grp) => {
    if (grp.count === 0) return;
    if (grp.qty > 0) {
      let remaining = grp.qty;
      const perSlot = grp.count * grp.levels;
      for (let s = 0; s < grp.slots; s++) {
        const slotZ = zStart + s * grp.lengthDim;
        const itemsInSlot = Math.min(perSlot, remaining);
        remaining -= itemsInSlot;
        const cols = distributeColumns3D(grp.count, grp.levels, itemsInSlot);
        for (let c = 0; c < grp.count; c++) {
          const cx = x + c * grp.width;
          for (let lvl = 0; lvl < cols[c]; lvl++) {
            boxes.push({ refId, x: cx, y: lvl * pallet.height, z: slotZ, w: grp.width, h: pallet.height, d: grp.lengthDim });
          }
        }
      }
    }
    x += grp.count * grp.width;
  });
}

// Dos tramos consecutivos de orientación distinta, cada uno usando todo el
// ancho disponible (`isSequentialMixed`, ver calc.js) — a diferencia de
// `addSplitMixedPlacement` (columnas en paralelo, cada una a su propio ancho
// parcial), aquí cada tramo entero avanza en Z uno detrás del otro.
function addSequentialMixedPlacement(boxes, pallet, opt, xOffset, zStart, refId) {
  let z = zStart;
  opt.stages.forEach((stage) => {
    if (stage.qty > 0) {
      const stageOpt = {
        N: stage.N, width: stage.width, lengthDim: stage.lengthDim, levels: stage.levels,
        perSlot: stage.N * stage.levels, slots: stage.slots,
        columnWidths: new Array(stage.N).fill(stage.width),
        columnLengths: new Array(stage.N).fill(stage.lengthDim),
      };
      addGridPlacement(boxes, pallet, stageOpt, stage.qty, xOffset, z, refId);
    }
    z += stage.depth;
  });
}

// Bloque combinado por huella compartida (`packFootprintFamily`): las filas
// de pirámide igual que arriba, y las filas normales apilan de verdad, en Y,
// las referencias distintas que comparten columna (`columnBins`), cada una
// con su propia altura real.
function addFamilyPlacement(boxes, placement) {
  const { N, width, lengthDim, rows, pyramidGroups, columnBins } = placement.option;

  for (let r = 0; r < rows; r++) {
    const slotZ = r * lengthDim;

    if (r < pyramidGroups.length) {
      const { base, top } = pyramidGroups[r];
      for (let c = 0; c < N; c++) {
        const item = base[c];
        if (!item) continue;
        boxes.push({ refId: item.id, x: c * width, y: 0, z: slotZ, w: width, h: item.height, d: lengthDim });
      }
      const topW = width * 0.6;
      const topD = lengthDim * 0.6;
      for (let c = 0; c < N - 1; c++) {
        const item = top[c];
        if (!item) continue;
        const baseItem = base[c] || base[c + 1];
        const y = baseItem ? baseItem.height : 0;
        const x = (c + 1) * width - topW / 2;
        const z = slotZ + (lengthDim - topD) / 2;
        boxes.push({ refId: item.id, x, y, z, w: topW, h: item.height, d: topD });
      }
    } else {
      const plainRow = r - pyramidGroups.length;
      const rowBins = columnBins.slice(plainRow * N, (plainRow + 1) * N);
      for (let c = 0; c < N; c++) {
        const stackItems = rowBins[c];
        if (!stackItems || stackItems.length === 0) continue;
        let yCursor = 0;
        stackItems.forEach((item) => {
          boxes.push({ refId: item.id, x: c * width, y: yCursor, z: slotZ, w: width, h: item.height, d: lengthDim });
          yCursor += item.height;
        });
      }
    }
  }
}

// Apilado vertical entre dos artículos de huella distinta
// (`applyVerticalPairing`): cada columna llena lleva la base abajo y el
// pallet de encima apilado en Y con su propia altura real.
function addVerticalComboPlacement(boxes, placement) {
  const opt = placement.option;
  const stackItems = [
    { id: placement.base.id, height: placement.base.pallet.height },
    { id: placement.topper.id, height: placement.topper.pallet.height },
  ];
  let remaining = placement.quantity;

  for (let s = 0; s < opt.slots; s++) {
    const slotZ = s * opt.lengthDim;
    const itemsInSlot = Math.min(opt.perSlot, remaining);
    remaining -= itemsInSlot;

    let x = 0;
    for (let c = 0; c < opt.N; c++) {
      const colWidth = opt.columnWidths[c];
      const colLength = opt.columnLengths[c];
      if (c < itemsInSlot) {
        let yCursor = 0;
        stackItems.forEach((item) => {
          boxes.push({ refId: item.id, x, y: yCursor, z: slotZ, w: colWidth, h: item.height, d: colLength });
          yCursor += item.height;
        });
      }
      x += colWidth;
    }
  }
}

// Recorre `packResult` igual que `renderTruckDiagram` (diagram.js) y produce
// una lista plana de cajas 3D, cada una con el id del artículo original al
// que pertenece (`refId`) para poder colorearla y numerarla luego.
function buildPalletBoxes(packResult) {
  const boxes = [];
  if (!packResult || !packResult.bins || packResult.bins.length === 0) return boxes;

  let zCursor = 0;
  packResult.bins.forEach((bin) => {
    let xCursor = 0;
    bin.items.forEach((placement) => {
      const opt = placement.option;
      const localBoxes = [];

      if (placement.isFamily) {
        addFamilyPlacement(localBoxes, placement);
      } else if (placement.isVerticalCombo) {
        addVerticalComboPlacement(localBoxes, placement);
      } else if (opt.isSplitMixed) {
        addSplitMixedPlacement(localBoxes, placement.pallet, opt, 0, 0, placement.id);
      } else if (opt.isSequentialMixed) {
        addSequentialMixedPlacement(localBoxes, placement.pallet, opt, 0, 0, placement.id);
      } else if (placement.pallet.type === 'P') {
        addPyramidPlacement(localBoxes, placement.pallet, opt, placement.quantity, 0, 0, placement.id);
      } else {
        addGridPlacement(localBoxes, placement.pallet, opt, placement.quantity, 0, 0, placement.id);
      }

      localBoxes.forEach((box) => {
        boxes.push({ ...box, x: box.x + xCursor, z: box.z + zCursor });
      });

      xCursor += opt.usedWidth;
    });
    zCursor += bin.length;
  });

  return boxes;
}

// Agrupa las cajas de una misma pila física (misma referencia, misma huella
// en planta) para poner UNA sola etiqueta por pila (en vez de una por nivel
// apilado) en la caja de más arriba: cuántas van apiladas, y sus tres
// medidas (ancho, largo, alto).
function buildStackLabels(boxes) {
  const groups = new Map();
  boxes.forEach((box) => {
    const key = [
      box.refId,
      box.x.toFixed(4),
      box.z.toFixed(4),
      box.w.toFixed(4),
      box.d.toFixed(4),
    ].join('|');
    if (!groups.has(key)) {
      groups.set(key, { refId: box.refId, x: box.x, z: box.z, w: box.w, d: box.d, count: 0, topY: -Infinity, h: box.h });
    }
    const g = groups.get(key);
    g.count += 1;
    if (box.y + box.h > g.topY) {
      g.topY = box.y + box.h;
      g.h = box.h;
    }
  });
  return [...groups.values()];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildPalletBoxes, buildStackLabels, distributeColumns3D };
}
if (typeof window !== 'undefined') {
  window.buildPalletBoxes = buildPalletBoxes;
  window.buildStackLabels = buildStackLabels;
}

// --- Vista 3D interactiva (Three.js) ---------------------------------------
// Solo se ejecuta en navegador (usa `document`, `window` y la librería
// global `THREE` cargada por <script> antes que este archivo). Reutiliza la
// MISMA paleta de colores que diagram.js (duplicada aquí a propósito, para
// no depender de que diagram.js la exponga en `window`) y el mismo orden de
// numeración que su leyenda: 1 = primer artículo de la tabla, y así hacia
// abajo.
if (typeof window !== 'undefined') {
  const DIAGRAM_PALETTE_3D = [
    '#2458d6', '#1f9d55', '#c2410c', '#7c3aed',
    '#0891b2', '#be123c', '#65861d', '#9333ea',
  ];

  function fmtM3D(n) {
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Etiqueta como una pequeña "tarjeta" (canvas -> textura -> sprite, siempre
  // de cara a la cámara) con el número de referencia, el ancho x largo y el
  // alto — todo en el color de esa referencia, como pidió el usuario.
  function makeLabelSprite(lines, color) {
    const scale = 4;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 20 * scale;
    ctx.font = `700 ${fontSize}px sans-serif`;
    const padding = 10 * scale;
    const lineH = fontSize * 1.25;
    let maxTextW = 0;
    lines.forEach((line) => {
      ctx.font = `${line.bold ? 700 : 600} ${fontSize}px sans-serif`;
      maxTextW = Math.max(maxTextW, ctx.measureText(line.text).width);
    });
    const w = maxTextW + padding * 2;
    const h = lineH * lines.length + padding * 2;
    canvas.width = w;
    canvas.height = h;

    const r = 8 * scale;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.font = `${line.bold ? 700 : 600} ${fontSize}px sans-serif`;
      ctx.fillStyle = line.bold ? color : '#2c2c2c';
      ctx.fillText(line.text, padding, padding + lineH * i + lineH / 2);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const aspect = w / h;
    const spriteHeight = 0.32;
    sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  // container: elemento donde montar el lienzo 3D (mismo contrato que
  // `renderTruckDiagram`). packResult/truck/orderedIds: igual que la vista 2D.
  function render3DView(container, packResult, truck, orderedIds) {
    if (container._diagram3d) {
      container._diagram3d.dispose();
      container._diagram3d = null;
    }
    container.innerHTML = '';

    if (!packResult || packResult.bins.length === 0) {
      const p = document.createElement('p');
      p.className = 'diagram-empty';
      p.textContent = 'Añade artículos válidos para ver la disposición en el camión.';
      container.appendChild(p);
      return;
    }

    if (typeof THREE === 'undefined') {
      const p = document.createElement('p');
      p.className = 'diagram-empty';
      p.textContent = 'No se pudo cargar el motor 3D.';
      container.appendChild(p);
      return;
    }

    const colorById = new Map();
    const numberById = new Map();
    orderedIds.forEach((id, i) => {
      colorById.set(id, DIAGRAM_PALETTE_3D[i % DIAGRAM_PALETTE_3D.length]);
      numberById.set(id, i + 1);
    });

    const boxes = buildPalletBoxes(packResult);
    const labels = buildStackLabels(boxes);
    const totalLength = packResult.totalLength;

    const wrap = document.createElement('div');
    wrap.className = 'diagram3d-wrap';
    container.appendChild(wrap);

    const width = wrap.clientWidth || 420;
    const height = 440;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfbfbfc);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(3, 6, 4);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-4, 3, -3);
    scene.add(dirLight2);

    // Todo se centra en el origen (restando la mitad de cada medida del
    // camión) para que los controles orbiten alrededor del centro de la
    // carga, sea cual sea el tamaño del camión o el largo total.
    const cx = truck.width / 2;
    const cy = truck.height / 2;
    const cz = totalLength / 2;

    const truckGeo = new THREE.BoxGeometry(truck.width, truck.height, totalLength);
    const truckEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(truckGeo),
      new THREE.LineBasicMaterial({ color: 0x1a1a1a })
    );
    scene.add(truckEdges);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(truck.width, totalLength),
      new THREE.MeshBasicMaterial({ color: 0xeceef2, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -cy, 0);
    scene.add(floor);

    boxes.forEach((box) => {
      const color = colorById.get(box.refId) || DIAGRAM_PALETTE_3D[0];
      const geo = new THREE.BoxGeometry(box.w, box.h, box.d);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.88 }));
      mesh.position.set(box.x + box.w / 2 - cx, box.y + box.h / 2 - cy, box.z + box.d / 2 - cz);
      scene.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff }));
      edges.position.copy(mesh.position);
      scene.add(edges);
    });

    labels.forEach((lbl) => {
      const color = colorById.get(lbl.refId) || DIAGRAM_PALETTE_3D[0];
      const number = numberById.get(lbl.refId);
      const lines = [
        { text: `#${number}`, bold: true },
        { text: `${fmtM3D(lbl.w)} × ${fmtM3D(lbl.d)} m`, bold: false },
        { text: `alto ${fmtM3D(lbl.h)} m${lbl.count > 1 ? ` ×${lbl.count}` : ''}`, bold: false },
      ];
      const sprite = makeLabelSprite(lines, color);
      sprite.position.set(lbl.x + lbl.w / 2 - cx, lbl.topY - cy + 0.22, lbl.z + lbl.d / 2 - cz);
      scene.add(sprite);
    });

    // --- Órbita manual: arrastrar para rotar, rueda para acercar/alejar,
    // sin depender de OrbitControls.js (para no añadir otra dependencia de
    // CDN) — coordenadas esféricas clásicas alrededor del origen.
    const maxDim = Math.max(truck.width, truck.height, totalLength);
    let radius = maxDim * 1.6;
    let theta = Math.PI / 4;
    let phi = Math.PI / 3;

    function updateCamera() {
      camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(0, 0, 0);
    }
    updateCamera();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function onPointerDown(e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      theta -= dx * 0.008;
      phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi - dy * 0.008));
      updateCamera();
    }
    function onPointerUp() {
      dragging = false;
    }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(maxDim * 0.5, Math.min(maxDim * 5, radius * (1 + e.deltaY * 0.001)));
      updateCamera();
    }

    const canvas = renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let rafId = null;
    function animate() {
      rafId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    container._diagram3d = {
      dispose() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        renderer.dispose();
      },
    };

    const entryById = new Map();
    packResult.placements.forEach((placement) => {
      if (placement.isFamily) {
        placement.members.forEach((member) => entryById.set(member.id, { member }));
      } else if (placement.isVerticalCombo) {
        entryById.set(placement.base.id, { member: placement.base });
        entryById.set(placement.topper.id, { member: placement.topper });
      } else {
        entryById.set(placement.id, { member: placement });
      }
    });

    const legend = document.createElement('div');
    legend.className = 'diagram-legend';
    orderedIds.forEach((id) => {
      const entry = entryById.get(id);
      if (!entry) return;
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<i style="background:${colorById.get(id)}"></i>${numberById.get(id)}. ${
        entry.member.name ? `${entry.member.name} — ` : ''
      }${entry.member.code}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  window.render3DView = render3DView;
}
