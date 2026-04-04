(function () {
  function parseSize(value) {
    const [cols, rows] = value.split("x").map((part) => parseInt(part, 10));
    return { cols, rows };
  }

  function getCellSize(grid) {
    const styles = getComputedStyle(grid);
    const cell = parseFloat(styles.getPropertyValue("--cell")) || 56;
    const gap = parseFloat(styles.getPropertyValue("--gap")) || 0;
    return { cell, gap };
  }

  function makeCellKey(x, y) {
    return `${x}:${y}`;
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function parseColorString(color) {
    if (!color || color === "transparent") {
      return null;
    }

    const value = String(color).trim();
    if (!value) {
      return null;
    }

    if (value.startsWith("#")) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1
        };
      }
      if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: 1
        };
      }
    }

    const match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      return null;
    }

    const parts = match[1].split(",").map((part) => part.trim());
    if (parts.length < 3) {
      return null;
    }

    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      a: parts.length >= 4 ? Number(parts[3]) : 1
    };
  }

  function darkenColor(color, factor = 0.58, saturation = 1) {
    const parsed = parseColorString(color);
    if (!parsed) {
      return null;
    }

    const avg = (parsed.r + parsed.g + parsed.b) / 3;
    const r = avg + (parsed.r - avg) * saturation;
    const g = avg + (parsed.g - avg) * saturation;
    const b = avg + (parsed.b - avg) * saturation;

    return `rgba(${clampChannel(r * factor)}, ${clampChannel(g * factor)}, ${clampChannel(b * factor)}, ${Number.isFinite(parsed.a) ? parsed.a : 1})`;
  }

  function normalizeFootprint(footprint) {
    if (!Array.isArray(footprint) || footprint.length === 0) {
      return null;
    }

    return footprint
      .map((cell) => {
        if (Array.isArray(cell) && cell.length >= 2) {
          return { x: Number(cell[0]), y: Number(cell[1]) };
        }
        if (cell && typeof cell === "object") {
          return { x: Number(cell.x), y: Number(cell.y) };
        }
        return null;
      })
      .filter((cell) => cell && Number.isInteger(cell.x) && Number.isInteger(cell.y));
  }

  function rotateFootprint(baseFootprint, baseWidth, baseHeight) {
    return baseFootprint.map((cell) => ({
      x: baseHeight - 1 - cell.y,
      y: cell.x
    }));
  }

  function getItemFootprint(item) {
    if (Array.isArray(item.baseFootprint) && item.baseFootprint.length) {
      return item.rotated
        ? rotateFootprint(item.baseFootprint, item.baseW, item.baseH)
        : item.baseFootprint;
    }

    const cells = [];
    for (let row = 0; row < item.h; row += 1) {
      for (let col = 0; col < item.w; col += 1) {
        cells.push({ x: col, y: row });
      }
    }
    return cells;
  }

  function createSlotGrid(config) {
    const { cols, rows, cellFactory } = config;
    const slots = [];

    for (let row = 0; row < rows; row += 1) {
      const rowSlots = [];
      for (let col = 0; col < cols; col += 1) {
        const baseLinks = {
          up: row > 0,
          right: col < cols - 1,
          down: row < rows - 1,
          left: col > 0
        };
        const overrides = cellFactory ? cellFactory({ col, row, cols, rows }) : null;
        const enabled = !(overrides && overrides.enabled === false);
        rowSlots.push({
          col,
          row,
          enabled,
          links: enabled ? {
            up: overrides && overrides.links && typeof overrides.links.up === "boolean" ? overrides.links.up : baseLinks.up,
            right: overrides && overrides.links && typeof overrides.links.right === "boolean" ? overrides.links.right : baseLinks.right,
            down: overrides && overrides.links && typeof overrides.links.down === "boolean" ? overrides.links.down : baseLinks.down,
            left: overrides && overrides.links && typeof overrides.links.left === "boolean" ? overrides.links.left : baseLinks.left
          } : {
            up: false,
            right: false,
            down: false,
            left: false
          }
        });
      }
      slots.push(rowSlots);
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const slot = slots[row][col];
        if (!slot.enabled) {
          continue;
        }

        const left = col > 0 ? slots[row][col - 1] : null;
        const top = row > 0 ? slots[row - 1][col] : null;
        const right = col + 1 < cols ? slots[row][col + 1] : null;
        const down = row + 1 < rows ? slots[row + 1][col] : null;

        slot.links.left = !!(left && left.enabled && slot.links.left && left.links.right);
        slot.links.up = !!(top && top.enabled && slot.links.up && top.links.down);
        slot.links.right = !!(right && right.enabled && slot.links.right && right.links.left);
        slot.links.down = !!(down && down.enabled && slot.links.down && down.links.up);

        if (right) {
          right.links.left = slot.links.right;
        }
        if (down) {
          down.links.up = slot.links.down;
        }
      }
    }

    return { cols, rows, slots };
  }

  const GRID_LAYOUTS = {
    default({ cols, rows }) {
      return createSlotGrid({ cols, rows });
    },
    pockets({ cols, rows }) {
      return createSlotGrid({
        cols,
        rows,
        cellFactory() {
          return {
            links: { up: false, right: false, down: false, left: false }
          };
        }
      });
    }
  };

  function buildGridModel(id, cols, rows) {
    const builder = GRID_LAYOUTS[id] || GRID_LAYOUTS.default;
    return builder({ cols, rows });
  }

  function getSlot(gridModel, col, row) {
    if (!gridModel || row < 0 || row >= gridModel.rows || col < 0 || col >= gridModel.cols) {
      return null;
    }
    return gridModel.slots[row][col];
  }

  function getRenderedCellMap(gridElement) {
    return gridElement.__cellMap || new Map();
  }

  function getBreakGapSize(gridId) {
    return gridId !== "pockets" ? parseFloat(SLOT_BREAK_GAP_HALF) * 2 : 0;
  }

  function buildSlotLayoutMap(gridModel, gridId, gridElement) {
    const { cell, gap } = getCellSize(gridElement);
    const step = cell + gap;
    const breakGap = getBreakGapSize(gridId);
    const positions = new Map();
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    function pickAnchorSegment(segments) {
      if (!segments.length) {
        return -1;
      }

      let bestIndex = 0;
      let bestLength = -1;
      let bestCenterDistance = Infinity;
      const center = (segments[0].axisSpan - 1) / 2;

      segments.forEach((segment, index) => {
        const length = segment.end - segment.start + 1;
        const midpoint = (segment.start + segment.end) / 2;
        const centerDistance = Math.abs(midpoint - center);
        if (length > bestLength || (length === bestLength && centerDistance < bestCenterDistance)) {
          bestIndex = index;
          bestLength = length;
          bestCenterDistance = centerDistance;
        }
      });

      return bestIndex;
    }

    function buildRowSegments(row) {
      const segments = [];
      let start = null;
      for (let col = 0; col < gridModel.cols; col += 1) {
        const slot = getSlot(gridModel, col, row);
        if (!slot || !slot.enabled) {
          if (start !== null) {
            segments.push({ start, end: col - 1, axisSpan: gridModel.cols });
            start = null;
          }
          continue;
        }

        const left = getSlot(gridModel, col - 1, row);
        const connectedLeft = !!(left && left.enabled && left.links.right && slot.links.left);
        if (start === null || !connectedLeft) {
          if (start !== null) {
            segments.push({ start, end: col - 1, axisSpan: gridModel.cols });
          }
          start = col;
        }
      }
      if (start !== null) {
        segments.push({ start, end: gridModel.cols - 1, axisSpan: gridModel.cols });
      }
      return segments;
    }

    function buildColSegments(col) {
      const segments = [];
      let start = null;
      for (let row = 0; row < gridModel.rows; row += 1) {
        const slot = getSlot(gridModel, col, row);
        if (!slot || !slot.enabled) {
          if (start !== null) {
            segments.push({ start, end: row - 1, axisSpan: gridModel.rows });
            start = null;
          }
          continue;
        }

        const up = getSlot(gridModel, col, row - 1);
        const connectedUp = !!(up && up.enabled && up.links.down && slot.links.up);
        if (start === null || !connectedUp) {
          if (start !== null) {
            segments.push({ start, end: row - 1, axisSpan: gridModel.rows });
          }
          start = row;
        }
      }
      if (start !== null) {
        segments.push({ start, end: gridModel.rows - 1, axisSpan: gridModel.rows });
      }
      return segments;
    }

    const xShiftMap = Array.from({ length: gridModel.rows }, () => Array(gridModel.cols).fill(0));
    const yShiftMap = Array.from({ length: gridModel.rows }, () => Array(gridModel.cols).fill(0));

    for (let row = 0; row < gridModel.rows; row += 1) {
      const segments = buildRowSegments(row);
      const anchorIndex = pickAnchorSegment(segments);
      segments.forEach((segment, index) => {
        const shift = breakGap * (index - anchorIndex);
        for (let col = segment.start; col <= segment.end; col += 1) {
          xShiftMap[row][col] = shift;
        }
      });
    }

    for (let col = 0; col < gridModel.cols; col += 1) {
      const segments = buildColSegments(col);
      const anchorIndex = pickAnchorSegment(segments);
      segments.forEach((segment, index) => {
        const shift = breakGap * (index - anchorIndex);
        for (let row = segment.start; row <= segment.end; row += 1) {
          yShiftMap[row][col] = shift;
        }
      });
    }

    for (let row = 0; row < gridModel.rows; row += 1) {
      for (let col = 0; col < gridModel.cols; col += 1) {
        const slot = getSlot(gridModel, col, row);
        if (!slot || !slot.enabled) {
          continue;
        }

        const left = col * step + xShiftMap[row][col];
        const top = row * step + yShiftMap[row][col];
        const rect = { left, top, width: cell, height: cell };
        positions.set(makeCellKey(col, row), rect);
        minLeft = Math.min(minLeft, rect.left);
        minTop = Math.min(minTop, rect.top);
        maxRight = Math.max(maxRight, rect.left + rect.width);
        maxBottom = Math.max(maxBottom, rect.top + rect.height);
      }
    }

    const normalizeX = Number.isFinite(minLeft) ? -minLeft : 0;
    const normalizeY = Number.isFinite(minTop) ? -minTop : 0;
    if (normalizeX || normalizeY) {
      positions.forEach((rect) => {
        rect.left += normalizeX;
        rect.top += normalizeY;
      });
      maxRight += normalizeX;
      maxBottom += normalizeY;
    }

    return {
      cell,
      gap,
      step,
      breakGap,
      width: Math.max(0, maxRight),
      height: Math.max(0, maxBottom),
      positions
    };
  }

  function getPlacedItemRect(gridElement, cellMap, item, x = item.x, y = item.y) {
    const gridRect = gridElement.getBoundingClientRect();
    const cells = getItemFootprint(item)
      .map((cell) => cellMap.get(makeCellKey(x + cell.x, y + cell.y)))
      .filter(Boolean);

    if (!cells.length) {
      return null;
    }

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    cells.forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    });

    return {
      left: left - gridRect.left + gridElement.scrollLeft,
      top: top - gridRect.top + gridElement.scrollTop,
      width: right - left,
      height: bottom - top
    };
  }

  function positionGridElement(element, gridElement, cellMap, item, x = item.x, y = item.y) {
    const rect = getPlacedItemRect(gridElement, cellMap, item, x, y);
    if (!rect) {
      return false;
    }

    element.style.position = "absolute";
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.gridColumn = "auto";
    element.style.gridRow = "auto";
    return true;
  }

  function getCellFromEvent(gridInfo, event) {
    const cellMap = getRenderedCellMap(gridInfo.el);

    for (const [key, cell] of cellMap.entries()) {
      const rect = cell.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        continue;
      }

      const [colText, rowText] = key.split(":");
      const col = parseInt(colText, 10);
      const row = parseInt(rowText, 10);
      const slot = getSlot(gridInfo.model, col, row);
      if (!slot || !slot.enabled) {
        return null;
      }

      return { col, row, slot };
    }

    return null;
  }
  function buildOccupiedCells(items, ignoreId) {
    const occupied = new Set();

    items.forEach((item) => {
      if (ignoreId && item.id === ignoreId) {
        return;
      }

      getItemFootprint(item).forEach((cell) => {
        occupied.add(makeCellKey(item.x + cell.x, item.y + cell.y));
      });
    });

    return occupied;
  }

  function canPlaceItem(gridModel, occupied, item, x, y) {
    const footprint = getItemFootprint(item);
    const footprintCells = new Set(footprint.map((cell) => makeCellKey(cell.x, cell.y)));

    for (const cell of footprint) {
      const targetX = x + cell.x;
      const targetY = y + cell.y;
      const slot = getSlot(gridModel, targetX, targetY);
      if (!slot || !slot.enabled || occupied.has(makeCellKey(targetX, targetY))) {
        return false;
      }

      const rightKey = makeCellKey(cell.x + 1, cell.y);
      if (footprintCells.has(rightKey) && !slot.links.right) {
        return false;
      }

      const downKey = makeCellKey(cell.x, cell.y + 1);
      if (footprintCells.has(downKey) && !slot.links.down) {
        return false;
      }
    }

    return true;
  }
  function markOccupiedCells(occupied, item, x, y) {
    getItemFootprint(item).forEach((cell) => {
      occupied.add(makeCellKey(x + cell.x, y + cell.y));
    });
  }

  function autoPack(items, gridModel) {
    const occupied = new Set();
    const placed = [];

    for (const item of items) {
      let placedItem = false;

      for (let row = 0; row < gridModel.rows && !placedItem; row += 1) {
        for (let col = 0; col < gridModel.cols && !placedItem; col += 1) {
          if (canPlaceItem(gridModel, occupied, item, col, row)) {
            markOccupiedCells(occupied, item, col, row);
            placed.push({ ...item, x: col, y: row });
            placedItem = true;
          }
        }
      }
    }

    return placed;
  }

  class ItemRegistry {
    constructor() {
      this.byInternalId = new Map();
    }

    register(item) {
      const required = ["displayId", "internalId", "texture", "size", "category"];

      required.forEach((key) => {
        if (item[key] === undefined || item[key] === null) {
          throw new Error(`Item missing required field: ${key}`);
        }
      });

      if (this.byInternalId.has(item.internalId)) {
        throw new Error(`Duplicate internalId: ${item.internalId}`);
      }

      this.byInternalId.set(item.internalId, item);
      return item;
    }
  }

  function toItemInstance(definition) {
    const baseFootprint = normalizeFootprint(definition.footprint);
    return {
      id: definition.internalId,
      name: definition.name,
      label: definition.displayId,
      desc: definition.desc,
      baseW: definition.size.w,
      baseH: definition.size.h,
      w: definition.size.w,
      h: definition.size.h,
      rotated: false,
      texture: definition.texture,
      category: definition.category,
      tint: definition.tint || "transparent",
      baseFootprint
    };
  }

  const ITEM_INFO_INDEX_PATH = "./src/items/item_info/index.json";
  const SECURE_BOX_OPTIONS = [
    { id: "reinforced_safe_box", name: "加固安全箱", icon: "./reinforced_safe_box.png", cols: 2, rows: 1 },
    { id: "bulletproof_safe_box", name: "防弹安全箱", icon: "./bulletproof_safe_box.png", cols: 2, rows: 2 },
    { id: "composite_safe_box", name: "复合安全箱", icon: "./composite_safe_box.png", cols: 3, rows: 2 },
    { id: "titanium_safe_box", name: "钛金安全箱", icon: "./titanium_safe_box.png", cols: 3, rows: 3 }
  ];
  const ITEM_INFO_BASE_PATH = "./src/items/item_info";
  const ITEM_ICON_BASE_PATH = "./src/items/item_icons";
  const SLOT_ART = {
    rig: {
      empty: "./ammo_rack_slot.png",
      full: "./ammo_rack_slot_full.png"
    },
    bag: {
      empty: "./backpack_slot.png",
      full: "./backpack_slot_full.png"
    }
  };
  const EQUIPMENT_INFO_INDEX_PATHS = {
    rig: "./src/equipments/chest_rig/info/index.json",
    bag: "./src/equipments/backpack/info/index.json"
  };
  const EQUIPMENT_ICON_BASE_PATHS = {
    rig: "./src/equipments/chest_rig/icons",
    bag: "./src/equipments/backpack/icons"
  };
  const NONE_EQUIPMENT = {
    id: "none",
    name: "未装备",
    type: "",
    icon: "",
    cols: 0,
    rows: 0,
    model: null
  };
  let equipmentCatalog = {
    rig: [NONE_EQUIPMENT],
    bag: [NONE_EQUIPMENT]
  };

  function humanizeEquipmentName(id) {
    return id
      .split("_")
      .map((part) => (/^\d+$/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1)))
      .join(" ");
  }
  const SLOT_OUTER_COLOR = "#494b49";
  const SLOT_INNER_COLOR = "#2f2f2e";
  const SLOT_OUTER_WIDTH = "1px";
  const SLOT_INNER_WIDTH = "1px";
  const SLOT_BREAK_GAP_HALF = "6px";
  const itemRegistry = new ItemRegistry();
  let itemInstances = [];

  const DRAG_MOVE_PX = 6;

  const state = {
    dragState: null,
    suppressClickId: null,
    isSecurePinned: false,
    activeItemGridId: "",
    activeItemId: "",
    pocketsItems: [],
    rigItems: [],
    bagItems: [],
    secureItems: [],
    containerItems: [],
    containerSizeKey: "",
    rigSizeKey: "",
    bagSizeKey: "",
    secureSizeKey: ""
  };

  const pickUpAudio = new Audio("pick_up.mp3");
  const putDownAudio = new Audio("put_down.mp3");
  pickUpAudio.preload = "auto";
  putDownAudio.preload = "auto";

  const dom = {
    rigSel: document.getElementById("rigSel"),
    bagSel: document.getElementById("bagSel"),
    equipRigSel: document.getElementById("equipRigSel"),
    equipBagSel: document.getElementById("equipBagSel"),
    equipSecureSel: document.getElementById("equipSecureSel"),
    equipRigPicker: document.getElementById("equipRigPicker"),
    equipBagPicker: document.getElementById("equipBagPicker"),
    equipSecurePicker: document.getElementById("equipSecurePicker"),
    secureSel: document.getElementById("secureSel"),
    invLayout: document.getElementById("invLayout"),
    invPinnedHost: document.getElementById("invPinnedHost"),
    invDetail: document.getElementById("invDetail"),
    containerSel: document.getElementById("containerSel"),
    containerGrid: document.getElementById("containerGrid"),
    containerTitle: document.getElementById("containerTitle"),
    containerDetail: document.getElementById("containerDetail"),
    itemTooltip: null
  };

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setLoadingState(message) {
    dom.invDetail.textContent = message;
    dom.containerDetail.textContent = message;
  }

  function setLoadError(error) {
    const stack = error && error.stack ? error.stack : String(error);
    const content = `<b>\u7269\u54c1\u52a0\u8f7d\u5931\u8d25\uff1a</b><pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(stack)}</pre>`;
    dom.invDetail.innerHTML = "\u5de6\u4fa7\u9ed8\u8ba4\u65e0\u7269\u54c1\uff08\u5168\u7a7a\uff09\u3002\u53ea\u6709\u53f3\u4fa7\u641c\u7d22\u5bb9\u5668\u6709\u7269\u54c1\u3002";
    dom.containerDetail.innerHTML = content;
  }
  function ensureItemTooltip() {
    if (dom.itemTooltip) {
      return dom.itemTooltip;
    }

    const tooltip = document.createElement("div");
    tooltip.className = "item-tooltip";
    tooltip.innerHTML = `
      <div class="item-tooltip-title"></div>
      <div class="item-tooltip-meta"></div>
      <div class="item-tooltip-desc"></div>
    `;
    document.body.appendChild(tooltip);
    dom.itemTooltip = tooltip;
    return tooltip;
  }

  function hideItemTooltip() {
    const tooltip = ensureItemTooltip();
    tooltip.classList.remove("visible");
  }

  function moveItemTooltip(clientX, clientY) {
    const tooltip = ensureItemTooltip();
    const offsetX = 18;
    const offsetY = 18;
    const rect = tooltip.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    const maxTop = window.innerHeight - rect.height - 8;
    const left = Math.max(8, Math.min(clientX + offsetX, maxLeft));
    const top = Math.max(8, Math.min(clientY + offsetY, maxTop));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showItemTooltip(item, clientX, clientY) {
    if (state.dragState) {
      return;
    }

    const tooltip = ensureItemTooltip();
    tooltip.querySelector(".item-tooltip-title").textContent = item.name || item.label || "";
    tooltip.querySelector(".item-tooltip-meta").textContent = "";
    tooltip.querySelector(".item-tooltip-desc").textContent = "";
    tooltip.classList.add("visible");
    moveItemTooltip(clientX, clientY);
  }

  async function fetchJsonFile(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    }

    return JSON.parse(await response.text());
  }

  async function fetchTextFile(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  function parseEquipmentBreaks(lines) {
    const breaks = new Set();
    const dirMap = { u: "up", r: "right", d: "down", l: "left" };

    lines.forEach((line) => {
      const match = line.match(/^(\d+)\s*,\s*(\d+)\s*:\s*([urdl])$/i);
      if (!match) {
        return;
      }

      const [, x, y, dir] = match;
      breaks.add(`${x}:${y}:${dirMap[dir.toLowerCase()]}`);
    });

    return breaks;
  }

  function createSlotGridFromEquipmentLayout(gridRows, breaks) {
    const rows = gridRows.length;
    const cols = gridRows.reduce((max, row) => Math.max(max, row.length), 0);

    const hasEnabledCell = (col, row) => {
      if (row < 0 || row >= rows || col < 0 || col >= cols) {
        return false;
      }
      return (gridRows[row] && gridRows[row][col]) === "#";
    };

    return createSlotGrid({
      cols,
      rows,
      cellFactory({ col, row }) {
        const enabled = hasEnabledCell(col, row);
        if (!enabled) {
          return { enabled: false };
        }

        return {
          enabled: true,
          links: {
            up: hasEnabledCell(col, row - 1) && !breaks.has(`${col}:${row}:up`),
            right: hasEnabledCell(col + 1, row) && !breaks.has(`${col}:${row}:right`),
            down: hasEnabledCell(col, row + 1) && !breaks.has(`${col}:${row}:down`),
            left: hasEnabledCell(col - 1, row) && !breaks.has(`${col}:${row}:left`)
          }
        };
      }
    });
  }

  function parseEquipmentInfoFile(text, kind) {
    const metadata = {};
    const gridRows = [];
    const breakLines = [];
    let section = "";

    text.split(/\r?\n/).forEach((rawLine) => {
      const trimmed = rawLine.trim();

      if (section === "grid") {
        if (trimmed === "[/grid]") {
          section = "";
          return;
        }
        if (trimmed) {
          gridRows.push(trimmed.replace(/\s+/g, ""));
        }
        return;
      }

      if (section === "breaks") {
        if (trimmed === "[/breaks]") {
          section = "";
          return;
        }
        if (trimmed && !trimmed.startsWith(";")) {
          breakLines.push(trimmed);
        }
        return;
      }

      if (!trimmed || trimmed.startsWith(";")) {
        return;
      }

      if (trimmed === "[grid]") {
        section = "grid";
        return;
      }
      if (trimmed === "[breaks]") {
        section = "breaks";
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      metadata[key] = value;
    });

    if (gridRows.length === 0) {
      throw new Error(`Equipment layout missing [grid] data for ${metadata.id || kind}`);
    }

    const breaks = parseEquipmentBreaks(breakLines);
    const model = createSlotGridFromEquipmentLayout(gridRows, breaks);
    const iconFile = metadata.icon || `${metadata.id}.png`;
    const icon = iconFile.includes("/")
      ? iconFile
      : `${EQUIPMENT_ICON_BASE_PATHS[kind]}/${iconFile}`;

    return {
      id: metadata.id || "",
      name: metadata.name || humanizeEquipmentName(metadata.id || "equipment"),
      type: metadata.type || kind,
      icon,
      cols: model.cols,
      rows: model.rows,
      model
    };
  }

  async function loadEquipmentDefinitions() {
    const nextCatalog = { rig: [NONE_EQUIPMENT], bag: [NONE_EQUIPMENT] };

    const entries = await Promise.all(Object.entries(EQUIPMENT_INFO_INDEX_PATHS).map(async ([kind, indexPath]) => {
      const fileNames = await fetchJsonFile(indexPath);
      if (!Array.isArray(fileNames)) {
        throw new Error(`Equipment manifest must be an array: ${indexPath}`);
      }

      const baseDir = indexPath.slice(0, indexPath.lastIndexOf("/"));
      const definitions = await Promise.all(fileNames.map(async (fileName) => {
        const text = await fetchTextFile(`${baseDir}/${fileName}`);
        return parseEquipmentInfoFile(text, kind);
      }));

      return [kind, definitions];
    }));

    entries.forEach(([kind, definitions]) => {
      nextCatalog[kind] = [NONE_EQUIPMENT, ...definitions];
    });

    equipmentCatalog = nextCatalog;
  }

  async function loadItemDefinitions() {
    const fileNames = await fetchJsonFile(ITEM_INFO_INDEX_PATH);
    if (!Array.isArray(fileNames)) {
      throw new Error("Item manifest must be an array of .ii file names.");
    }

    const definitions = await Promise.all(
      fileNames.map(async (fileName) => {
        const definition = await fetchJsonFile(`${ITEM_INFO_BASE_PATH}/${fileName}`);
        if (definition.texture) {
          definition.texture = `${ITEM_ICON_BASE_PATH}/${definition.texture}`;
        }
        return itemRegistry.register(definition);
      })
    );

    return definitions.map(toItemInstance);
  }

  function clearActiveItems(root) {
    root.querySelectorAll(".item.active").forEach((item) => item.classList.remove("active"));
  }

  function clearSelectedItem() {
    state.activeItemGridId = "";
    state.activeItemId = "";
  }

  function isEquippedValue(value) {
    return !!value && value !== "none";
  }

  function getEquipmentSelect(kind) {
    if (kind === "rig") {
      return dom.equipRigSel;
    }
    if (kind === "bag") {
      return dom.equipBagSel;
    }
    if (kind === "secure") {
      return dom.equipSecureSel || dom.secureSel;
    }
    return null;
  }

  function getEquipmentPicker(kind) {
    if (kind === "rig") {
      return dom.equipRigPicker;
    }
    if (kind === "bag") {
      return dom.equipBagPicker;
    }
    if (kind === "secure") {
      return dom.equipSecurePicker;
    }
    return null;
  }

  function getEquipmentOptions(kind) {
    if (kind === "secure") {
      return SECURE_BOX_OPTIONS;
    }
    return equipmentCatalog[kind] || [NONE_EQUIPMENT];
  }

  function getSelectedEquipment(kind) {
    const select = getEquipmentSelect(kind);
    const options = getEquipmentOptions(kind);
    const fallbackId = options[0] ? options[0].id : NONE_EQUIPMENT.id;
    const selectedId = select && select.value ? select.value : fallbackId;
    return options.find((option) => option.id === selectedId) || options[0];
  }

  function formatEquipmentSize(cols, rows) {
    if (!cols || !rows) {
      return "";
    }

    return `${cols}×${rows}`;
  }
  function populateEquipmentSelect(kind) {
    const select = getEquipmentSelect(kind);
    if (!select) {
      return;
    }

    const options = getEquipmentOptions(kind);
    const fallbackId = options[0] ? options[0].id : NONE_EQUIPMENT.id;
    const previous = select.value || fallbackId;
    select.innerHTML = "";
    options.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.id === "none"
        ? option.name
        : `${option.name}（${formatEquipmentSize(option.cols, option.rows)}）`;
      select.appendChild(node);
    });

    const hasPrevious = options.some((option) => option.id === previous);
    select.value = hasPrevious ? previous : fallbackId;
  }

  function renderEquipmentPicker(kind) {
    const picker = getEquipmentPicker(kind);
    const select = getEquipmentSelect(kind);
    if (!picker || !select) {
      return;
    }

    const selectedId = select.value || NONE_EQUIPMENT.id;
    picker.innerHTML = "";

    getEquipmentOptions(kind).forEach((option) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `equipment-card${option.id === selectedId ? " selected" : ""}`;

      const visual = document.createElement("div");
      visual.className = option.icon ? "equipment-card-icon" : "equipment-card-empty";
      if (option.icon) {
        visual.style.backgroundImage = `url('${option.icon}')`;
      } else {
        visual.textContent = option.name;
      }

      const name = document.createElement("div");
      name.className = "equipment-card-name";
      name.textContent = option.name;

      const size = document.createElement("div");
      size.className = "equipment-card-size";
      size.textContent = option.id === "none" ? "不显示格子" : `容量 ${formatEquipmentSize(option.cols, option.rows)}`;

      card.appendChild(visual);
      card.appendChild(name);
      card.appendChild(size);
      card.addEventListener("click", () => {
        if (select.value === option.id) {
          return;
        }
        select.value = option.id;
        syncEquipmentSelections();
        renderInventoryLayout();
        renderInventoryGrids();
      });

      picker.appendChild(card);
    });
  }

  function syncEquipmentSelections() {
    renderEquipmentPicker("rig");
    renderEquipmentPicker("bag");
    renderEquipmentPicker("secure");
  }
  function initializeEquipmentSelectors() {
    populateEquipmentSelect("rig");
    populateEquipmentSelect("bag");
    populateEquipmentSelect("secure");
    syncEquipmentSelections();
  }

  function getSelectedEquipmentIcon(kind) {
    const equipment = getSelectedEquipment(kind);
    return equipment && equipment.icon ? equipment.icon : "";
  }

  function isItemRotatable(item) {
    return item.baseW !== item.baseH;
  }

  function getRotatedSize(item, rotated) {
    return rotated
      ? { w: item.baseH, h: item.baseW }
      : { w: item.baseW, h: item.baseH };
  }

  function getItemPixelSize(item, step, gap) {
    return {
      width: item.w * step - gap,
      height: item.h * step - gap
    };
  }

  function getCenteredDragAnchor(item, step, gap) {
    const size = getItemPixelSize(item, step, gap);
    return {
      offsetX: size.width / 2,
      offsetY: size.height / 2,
      grabCellX: Math.max(0, Math.min(item.w - 1, Math.floor(item.w / 2))),
      grabCellY: Math.max(0, Math.min(item.h - 1, Math.floor(item.h / 2)))
    };
  }

  function layoutItemIcon(element, rotated) {
    const icon = element.querySelector(".icon");
    if (!icon) {
      return;
    }

    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) {
      return;
    }

    const insetX = width * 0.05;
    const insetY = height * 0.05;

    if (rotated) {
      const boxWidth = Math.max(0, height - insetY * 2);
      const boxHeight = Math.max(0, width - insetX * 2);
      icon.style.left = `${(width - boxWidth) / 2}px`;
      icon.style.top = `${(height - boxHeight) / 2}px`;
      icon.style.width = `${boxWidth}px`;
      icon.style.height = `${boxHeight}px`;
      icon.style.transform = "rotate(90deg)";
      icon.style.backgroundSize = "cover";
      return;
    }

    icon.style.left = `${insetX}px`;
    icon.style.top = `${insetY}px`;
    icon.style.width = `${Math.max(0, width - insetX * 2)}px`;
    icon.style.height = `${Math.max(0, height - insetY * 2)}px`;
    icon.style.transform = "none";
    icon.style.backgroundSize = "cover";
  }
  function renderItemInternalLines(element, item, gridElement) {
    const existing = element.querySelector(".internal-lines");
    if (existing) {
      existing.remove();
    }

    if (!item || (item.w <= 1 && item.h <= 1)) {
      return;
    }

    const { cell, gap } = getCellSize(gridElement);
    const step = cell + gap;
    const overlay = document.createElement("div");
    overlay.className = "internal-lines";

    for (let col = 1; col < item.w; col += 1) {
      const line = document.createElement("div");
      line.className = "internal-line vertical";
      line.style.left = `${col * step - 1}px`;
      overlay.appendChild(line);
    }

    for (let row = 1; row < item.h; row += 1) {
      const line = document.createElement("div");
      line.className = "internal-line horizontal";
      line.style.top = `${row * step - 1}px`;
      overlay.appendChild(line);
    }

    element.appendChild(overlay);
  }

  function getSelectedItemContext() {
    if (!state.activeItemGridId || !state.activeItemId) {
      return null;
    }

    const gridInfo = getGridInfoById(state.activeItemGridId);
    if (!gridInfo) {
      clearSelectedItem();
      return null;
    }

    const item = gridInfo.items.find((entry) => entry.id === state.activeItemId);
    if (!item) {
      clearSelectedItem();
      return null;
    }

    return { gridInfo, item };
  }

  function rotateDraggedItem() {
    const dragState = state.dragState;
    if (!dragState) {
      return false;
    }

    const item = dragState.item;
    if (!isItemRotatable(item)) {
      return false;
    }

    const rotated = !item.rotated;
    const size = getRotatedSize(item, rotated);

    item.rotated = rotated;
    item.w = size.w;
    item.h = size.h;

    const centeredAnchor = getCenteredDragAnchor(item, dragState.step, dragState.gap);
    dragState.offsetX = centeredAnchor.offsetX;
    dragState.offsetY = centeredAnchor.offsetY;
    dragState.grabCellX = centeredAnchor.grabCellX;
    dragState.grabCellY = centeredAnchor.grabCellY;

    if (typeof dragState.lastClientX === "number" && typeof dragState.lastClientY === "number") {
      syncDragStateVisuals({ clientX: dragState.lastClientX, clientY: dragState.lastClientY });
    }

    return true;
  }

  function getGridIdByEl(el) {
    if (!el) {
      return "";
    }

    const map = {
      containerGrid: "container",
      pocketsGrid: "pockets",
      rigGrid: "rig",
      bagGrid: "bag",
      secureGrid: "secure"
    };

    return map[el.id] || "";
  }

  function getGridInfoById(id) {
    if (id === "container") {
      const size = parseSize(dom.containerSel.value);
      return {
        id,
        el: dom.containerGrid,
        cols: size.cols,
        rows: size.rows,
        items: state.containerItems,
        model: buildGridModel(id, size.cols, size.rows)
      };
    }

    if (id === "pockets") {
      const el = document.getElementById("pocketsGrid");
      return {
        id,
        el,
        cols: 4,
        rows: 1,
        items: state.pocketsItems,
        model: buildGridModel(id, 4, 1)
      };
    }

    if (id === "rig") {
      const equipment = getSelectedEquipment("rig");
      if (!isEquippedValue(equipment.id)) {
        return null;
      }
      const el = document.getElementById("rigGrid");
      if (!el) {
        return null;
      }
      return {
        id,
        el,
        cols: equipment.cols,
        rows: equipment.rows,
        items: state.rigItems,
        model: equipment.model
      };
    }
    if (id === "bag") {
      const equipment = getSelectedEquipment("bag");
      if (!isEquippedValue(equipment.id)) {
        return null;
      }
      const el = document.getElementById("bagGrid");
      if (!el) {
        return null;
      }
      return {
        id,
        el,
        cols: equipment.cols,
        rows: equipment.rows,
        items: state.bagItems,
        model: equipment.model
      };
    }
    if (id === "secure") {
      const el = document.getElementById("secureGrid");
      const secureBox = getSelectedEquipment("secure");
      return {
        id,
        el,
        cols: secureBox.cols,
        rows: secureBox.rows,
        items: state.secureItems,
        model: buildGridModel(id, secureBox.cols, secureBox.rows)
      };
    }

    return null;
  }

  function findTargetGridByEvent(event) {
    const ids = ["container", "pockets", "rig", "bag", "secure"];

    for (const id of ids) {
      const info = getGridInfoById(id);
      if (!info || !info.el) {
        continue;
      }

      const rect = info.el.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        return info;
      }
    }

    return null;
  }

  function moveItemBetweenGrids(sourceId, targetId, itemId, x, y) {
    if (sourceId === targetId) {
      const info = getGridInfoById(sourceId);
      const item = info.items.find((entry) => entry.id === itemId);

      if (!item) {
        return;
      }

      item.x = x;
      item.y = y;
      if (state.activeItemId === itemId) {
        state.activeItemGridId = sourceId;
      }
      rerenderAll();
      return;
    }

    const source = getGridInfoById(sourceId);
    const target = getGridInfoById(targetId);
    if (!source || !target) {
      return;
    }

    const index = source.items.findIndex((entry) => entry.id === itemId);
    if (index === -1) {
      return;
    }

    const moved = { ...source.items[index], x, y };
    source.items.splice(index, 1);
    target.items.push(moved);
    if (state.activeItemId === itemId) {
      state.activeItemGridId = targetId;
    }
    rerenderAll();
  }

  function supportsItemInGrid(gridInfo, itemData) {
    if (gridInfo.id === "pockets") {
      return itemData.w === 1 && itemData.h === 1 && getItemFootprint(itemData).length === 1;
    }

    return true;
  }

  function getDropTarget(itemData, pointerEvent) {
    const dragState = state.dragState;
    if (!dragState) {
      return { targetGrid: null, position: null, canDrop: false };
    }

    const targetGrid = findTargetGridByEvent(pointerEvent);
    if (!targetGrid) {
      return { targetGrid: null, position: null, canDrop: false };
    }

    if (!supportsItemInGrid(targetGrid, itemData)) {
      return { targetGrid, position: null, canDrop: false };
    }

    const pointerCell = getCellFromEvent(targetGrid, pointerEvent);
    if (!pointerCell) {
      return { targetGrid: null, position: null, canDrop: false };
    }

    const maxCol = Math.max(0, targetGrid.cols - itemData.w);
    const maxRow = Math.max(0, targetGrid.rows - itemData.h);
    const position = {
      x: Math.max(0, Math.min(pointerCell.col - dragState.grabCellX, maxCol)),
      y: Math.max(0, Math.min(pointerCell.row - dragState.grabCellY, maxRow))
    };

    const occupied = buildOccupiedCells(
      targetGrid.items,
      dragState.sourceId === targetGrid.id ? itemData.id : null
    );

    return {
      targetGrid,
      position,
      canDrop: canPlaceItem(targetGrid.model, occupied, itemData, position.x, position.y)
    };
  }

  function clearDragPreview() {
    if (state.dragState && state.dragState.preview && state.dragState.preview.parentElement) {
      state.dragState.preview.remove();
      state.dragState.previewGridId = null;
    }
  }

  function syncDragStateVisuals(pointerEvent) {
    const dragState = state.dragState;
    if (!dragState) {
      return;
    }

    dragState.lastClientX = pointerEvent.clientX;
    dragState.lastClientY = pointerEvent.clientY;

    if (dragState.ghost) {
      const ghostSize = getItemPixelSize(dragState.item, dragState.step, dragState.gap);
      dragState.ghost.classList.toggle("rotated", !!dragState.item.rotated);
      dragState.ghost.style.width = `${ghostSize.width}px`;
      dragState.ghost.style.height = `${ghostSize.height}px`;
      dragState.ghost.style.left = `${pointerEvent.clientX - dragState.offsetX}px`;
      dragState.ghost.style.top = `${pointerEvent.clientY - dragState.offsetY}px`;
      layoutItemIcon(dragState.ghost, !!dragState.item.rotated);
    }

    const dropTarget = getDropTarget(dragState.item, pointerEvent);
    if (!dropTarget.targetGrid || !dropTarget.position) {
      clearDragPreview();
      return;
    }

    dragState.preview.classList.toggle("rotated", !!dragState.item.rotated);
    if (!dragState.preview.parentElement || dragState.previewGridId !== dropTarget.targetGrid.id) {
      dropTarget.targetGrid.el.appendChild(dragState.preview);
      dragState.previewGridId = dropTarget.targetGrid.id;
    }

    const previewCellMap = getRenderedCellMap(dropTarget.targetGrid.el);
    if (!positionGridElement(dragState.preview, dropTarget.targetGrid.el, previewCellMap, dragState.item, dropTarget.position.x, dropTarget.position.y)) {
      clearDragPreview();
      return;
    }
    dragState.preview.classList.toggle("invalid", !dropTarget.canDrop);
  }

  function applyCellBorders(cell, slot, gridModel) {
    const right = getSlot(gridModel, slot.col + 1, slot.row);
    const down = getSlot(gridModel, slot.col, slot.row + 1);
    const left = getSlot(gridModel, slot.col - 1, slot.row);
    const up = getSlot(gridModel, slot.col, slot.row - 1);
    const topConnected = slot.links.up && up;
    const leftConnected = slot.links.left && left;
    const rightConnected = slot.links.right && right;
    const bottomConnected = slot.links.down && down;

    cell.style.borderTopColor = topConnected ? SLOT_INNER_COLOR : SLOT_OUTER_COLOR;
    cell.style.borderLeftColor = leftConnected ? SLOT_INNER_COLOR : SLOT_OUTER_COLOR;
    cell.style.borderRightColor = rightConnected ? SLOT_INNER_COLOR : SLOT_OUTER_COLOR;
    cell.style.borderBottomColor = bottomConnected ? SLOT_INNER_COLOR : SLOT_OUTER_COLOR;
    cell.style.borderTopWidth = topConnected ? SLOT_INNER_WIDTH : SLOT_OUTER_WIDTH;
    cell.style.borderLeftWidth = leftConnected ? SLOT_INNER_WIDTH : SLOT_OUTER_WIDTH;
    cell.style.borderRightWidth = rightConnected ? SLOT_INNER_WIDTH : SLOT_OUTER_WIDTH;
    cell.style.borderBottomWidth = bottomConnected ? SLOT_INNER_WIDTH : SLOT_OUTER_WIDTH;
    cell.style.margin = "0";
  }
  function applyItemGridTint(element, item) {
    if (!element) {
      return;
    }

    const borderColor = item && item.tint && item.tint !== "transparent"
      ? darkenColor(item.tint, 0.5, 1.75)
      : null;

    if (borderColor) {
      element.style.setProperty("--item-border-color", borderColor);
    } else {
      element.style.removeProperty("--item-border-color");
    }
  }
  function tintOccupiedCellBorders(cellMap, item) {
    if (!item) {
      return;
    }

    const footprint = getItemFootprint(item);
    const footprintKeys = new Set(footprint.map((cell) => makeCellKey(cell.x, cell.y)));
    const borderColor = "#000000";

    footprint.forEach((footprintCell) => {
      const cell = cellMap.get(makeCellKey(item.x + footprintCell.x, item.y + footprintCell.y));
      if (!cell) {
        return;
      }

      if (!footprintKeys.has(makeCellKey(footprintCell.x, footprintCell.y - 1))) {
        cell.style.borderTopColor = borderColor;
      }
      if (!footprintKeys.has(makeCellKey(footprintCell.x - 1, footprintCell.y))) {
        cell.style.borderLeftColor = borderColor;
      }
      if (!footprintKeys.has(makeCellKey(footprintCell.x + 1, footprintCell.y))) {
        cell.style.borderRightColor = borderColor;
      }
      if (!footprintKeys.has(makeCellKey(footprintCell.x, footprintCell.y + 1))) {
        cell.style.borderBottomColor = borderColor;
      }
    });
  }

  function renderGrid(gridInfo, onItemClick, allowDrag = false) {
    const { el, model, items } = gridInfo;
    el.style.setProperty("--cols", model.cols);
    el.style.setProperty("--rows", model.rows);
    el.innerHTML = "";

    const hasPositions = items.length > 0 && items.every((item) => typeof item.x === "number" && typeof item.y === "number");
    const placed = hasPositions ? items : autoPack(items, model);
    const gridId = getGridIdByEl(el);
    const sourcePlaceholder = state.dragState && state.dragState.sourceId === gridId
      ? state.dragState.sourcePlaceholder || null
      : null;
    const visibleItems = sourcePlaceholder
      ? placed.filter((entry) => entry.id !== sourcePlaceholder.id)
      : placed;
    const slotLayout = buildSlotLayoutMap(model, gridId, el);
    const cellMap = new Map();

    el.style.width = `${slotLayout.width}px`;
    el.style.height = `${slotLayout.height}px`;
    el.style.minWidth = `${slotLayout.width}px`;

    for (let row = 0; row < model.rows; row += 1) {
      for (let col = 0; col < model.cols; col += 1) {
        const slot = getSlot(model, col, row);
        if (!slot || !slot.enabled) {
          continue;
        }

        const cellRect = slotLayout.positions.get(makeCellKey(col, row));
        if (!cellRect) {
          continue;
        }

        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cell.style.left = `${cellRect.left}px`;
        cell.style.top = `${cellRect.top}px`;
        cell.style.width = `${cellRect.width}px`;
        cell.style.height = `${cellRect.height}px`;
        applyCellBorders(cell, slot, model);
        cellMap.set(makeCellKey(col, row), cell);
        el.appendChild(cell);
      }
    }

    el.__cellMap = cellMap;
    el.__slotLayout = slotLayout;

    visibleItems.forEach((itemData) => {
      tintOccupiedCellBorders(cellMap, itemData);
    });

    if (sourcePlaceholder) {
      const placeholder = document.createElement("div");
      placeholder.className = `item source-placeholder${sourcePlaceholder.rotated ? " rotated" : ""}`;
      const placeholderIconStyle = sourcePlaceholder.texture ? `style="background-image:url('${sourcePlaceholder.texture}')"` : "";
      placeholder.innerHTML = `
        <div class="icon" ${placeholderIconStyle}></div>
        <div class="label">${sourcePlaceholder.label}</div>
        <div class="meta"></div>
      `;
      placeholder.style.setProperty("--item-tint", "transparent");
      if (positionGridElement(placeholder, el, cellMap, sourcePlaceholder)) {
        el.appendChild(placeholder);
        layoutItemIcon(placeholder, !!sourcePlaceholder.rotated);
      }
    }

    for (const itemData of visibleItems) {
      const item = document.createElement("div");
      item.className = `item${itemData.rotated ? " rotated" : ""}${state.activeItemGridId === gridId && state.activeItemId === itemData.id ? " active" : ""}`;
      item.dataset.itemId = itemData.id;

      const iconStyle = itemData.texture ? `style="background-image:url('${itemData.texture}')"` : "";
      item.innerHTML = `
        <div class="icon" ${iconStyle}></div>
        <div class="label">${itemData.label}</div>
        <div class="meta"></div>
      `;
      if (itemData.tint && itemData.tint !== "transparent") {
        item.style.setProperty("--item-tint", itemData.tint);
      } else {
        item.style.removeProperty("--item-tint");
      }

      item.addEventListener("mouseenter", (event) => {
        showItemTooltip(itemData, event.clientX, event.clientY);
      });

      item.addEventListener("mousemove", (event) => {
        moveItemTooltip(event.clientX, event.clientY);
      });

      item.addEventListener("mouseleave", () => {
        hideItemTooltip();
      });
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.suppressClickId === itemData.id) {
          state.suppressClickId = null;
          return;
        }

        clearActiveItems(document);
        item.classList.add("active");
        state.activeItemGridId = gridId;
        state.activeItemId = itemData.id;
        onItemClick(itemData);
      });

      if (allowDrag) {
        item.addEventListener("mousedown", (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          hideItemTooltip();
          const startX = event.clientX;
          const startY = event.clientY;
          const rect = item.getBoundingClientRect();
          const sourceMetrics = getCellSize(el);
          const sourceStep = sourceMetrics.cell + sourceMetrics.gap;
          let didStartDrag = false;

          const beginDrag = (moveEvent) => {
            const centeredAnchor = getCenteredDragAnchor(itemData, sourceStep, sourceMetrics.gap);
            state.dragState = {
              item: itemData,
              grid: el,
              preview: document.createElement("div"),
              ghost: item.cloneNode(true),
              sourcePlaceholder: { ...itemData },
              sourceId: getGridIdByEl(el),
              previewGridId: null,
              offsetX: centeredAnchor.offsetX,
              offsetY: centeredAnchor.offsetY,
              step: sourceStep,
              gap: sourceMetrics.gap,
              lastClientX: moveEvent.clientX,
              lastClientY: moveEvent.clientY,
              grabCellX: centeredAnchor.grabCellX,
              grabCellY: centeredAnchor.grabCellY
            };
            state.dragState.preview.className = "item drop-preview";
            state.dragState.preview.classList.toggle("rotated", !!itemData.rotated);
            state.dragState.preview.style.opacity = "0.35";
            state.dragState.preview.style.pointerEvents = "none";

            item.classList.add("dragging");
            state.dragState.ghost.classList.remove("dragging");
            state.dragState.ghost.classList.add("drag-ghost");
            state.dragState.ghost.style.width = `${item.offsetWidth}px`;
            state.dragState.ghost.style.height = `${item.offsetHeight}px`;
            state.dragState.ghost.style.left = `${moveEvent.clientX - centeredAnchor.offsetX}px`;
            state.dragState.ghost.style.top = `${moveEvent.clientY - centeredAnchor.offsetY}px`;
            document.body.appendChild(state.dragState.ghost);
            layoutItemIcon(state.dragState.ghost, !!itemData.rotated);
            didStartDrag = true;
            rerenderAll();

            try {
              pickUpAudio.currentTime = 0;
              pickUpAudio.play();
            } catch (error) {}
          };

          const onMove = (moveEvent) => {
            if (!state.dragState) {
              const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
              if (distance <= DRAG_MOVE_PX) {
                return;
              }

              beginDrag(moveEvent);
            }

            syncDragStateVisuals(moveEvent);
          };

          const onUp = (upEvent) => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            if (!state.dragState) {
              return;
            }

            const dropTarget = getDropTarget(itemData, upEvent);
            const sourceId = state.dragState.sourceId;
            clearDragPreview();
            item.classList.remove("dragging");
            if (state.dragState.ghost) {
              state.dragState.ghost.remove();
            }

            if (didStartDrag) {
              state.suppressClickId = itemData.id;
            }

            state.dragState = null;

            if (dropTarget.targetGrid && dropTarget.position && dropTarget.canDrop) {
              moveItemBetweenGrids(
                sourceId,
                dropTarget.targetGrid.id,
                itemData.id,
                dropTarget.position.x,
                dropTarget.position.y
              );
            } else if (didStartDrag) {
              rerenderAll();
            }

            try {
              putDownAudio.currentTime = 0;
              putDownAudio.play();
            } catch (error) {}
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        });
      }

      if (positionGridElement(item, el, cellMap, itemData)) {
        el.appendChild(item);
        layoutItemIcon(item, !!itemData.rotated);
        renderItemInternalLines(item, itemData, el);
      }
    }

    el.onclick = () => {
      clearActiveItems(document);
      clearSelectedItem();
    };
  }
  function buildSection(titleText, rightNode, gridId, options = {}) {
    const {
      artSrc = "",
      overlayArtSrc = "",
      overlayOffsetPercent = 15,
      titleArtSrc = "",
      showGrid = true
    } = options;
    const wrap = document.createElement("div");
    if (artSrc) {
      wrap.classList.add("art-offset-section");
    }
    const head = document.createElement("div");
    head.className = "section-head";

    const title = titleArtSrc
      ? document.createElement("img")
      : document.createElement("div");
    title.className = titleArtSrc ? "section-title-art" : "section-title";
    if (titleArtSrc) {
      title.src = titleArtSrc;
      title.alt = titleText || "";
    } else {
      title.textContent = titleText;
    }

    head.appendChild(title);
    if (rightNode) {
      head.appendChild(rightNode);
    }

    const body = document.createElement("div");
    body.className = "section-body";
    if (artSrc) {
      const artStack = document.createElement("div");
      artStack.className = "section-art-stack";

      const art = document.createElement("img");
      art.className = "section-slot-art";
      art.src = artSrc;
      art.alt = "";
      artStack.appendChild(art);

      if (overlayArtSrc) {
        const overlay = document.createElement("img");
        overlay.className = `section-equipped-art${gridId === "bagGrid" ? " bag-equipped-art" : ""}`;
        overlay.src = overlayArtSrc;
        overlay.alt = "";
        overlay.style.top = `${overlayOffsetPercent}%`;
        artStack.appendChild(overlay);
      }

      body.appendChild(artStack);
    }
    if (showGrid) {
      const grid = document.createElement("div");
      grid.className = "grid";
      grid.id = gridId;
      if (gridId === "pocketsGrid") {
        grid.classList.add("pockets-grid");
      }
      body.appendChild(grid);
    }

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function buildPinButton() {
    const button = document.createElement("div");
    button.className = `pin-btn${state.isSecurePinned ? " pinned" : ""}`;
    button.title = state.isSecurePinned
      ? "\u53d6\u6d88\u56fe\u9489\u62c6\u5206"
      : "\u56fe\u9489\u5230\u53f3\u4fa7\u680f";
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => {
      state.isSecurePinned = !state.isSecurePinned;
      renderInventoryLayout();
      renderInventoryGrids();
    });
    return button;
  }
  function renderInventoryLayout() {
    dom.invLayout.innerHTML = "";
    if (dom.invPinnedHost) {
      dom.invPinnedHost.innerHTML = "";
      dom.invPinnedHost.classList.remove("active");
    }

    const pocketsSection = buildSection("口袋", null, "pocketsGrid", {
      titleArtSrc: "./pocket_title.png"
    });
    const rigEquipment = getSelectedEquipment("rig");
    const bagEquipment = getSelectedEquipment("bag");
    const rigSection = buildSection("", null, "rigGrid", {
      artSrc: isEquippedValue(rigEquipment.id) ? SLOT_ART.rig.full : SLOT_ART.rig.empty,
      overlayArtSrc: isEquippedValue(rigEquipment.id) ? getSelectedEquipmentIcon("rig") : "",
      showGrid: isEquippedValue(rigEquipment.id)
    });
    const bagSection = buildSection("", null, "bagGrid", {
      artSrc: isEquippedValue(bagEquipment.id) ? SLOT_ART.bag.full : SLOT_ART.bag.empty,
      overlayArtSrc: isEquippedValue(bagEquipment.id) ? getSelectedEquipmentIcon("bag") : "",
      showGrid: isEquippedValue(bagEquipment.id)
    });
    const secureBox = getSelectedEquipment("secure");
    const secureSection = buildSection("", null, "secureGrid", {
      artSrc: secureBox.icon
    });
    secureSection.classList.add("secure-section");
    secureSection.querySelector(".section-body")?.appendChild(buildPinButton());

    const mainColumn = document.createElement("div");
    mainColumn.className = "inv-vbox-one";
    mainColumn.appendChild(pocketsSection);
    mainColumn.appendChild(rigSection);
    mainColumn.appendChild(bagSection);

    if (!state.isSecurePinned) {
      mainColumn.appendChild(secureSection);
      dom.invLayout.appendChild(mainColumn);
      return;
    }

    dom.invLayout.appendChild(mainColumn);
    if (dom.invPinnedHost) {
      dom.invPinnedHost.classList.add("active");
      dom.invPinnedHost.appendChild(secureSection);
    }
  }
  function ensureContainerItems(cols, rows) {
    const sizeKey = `${cols}x${rows}`;
    if (state.containerItems.length === 0 || state.containerSizeKey !== sizeKey) {
      const placed = autoPack(itemInstances, buildGridModel("container", cols, rows));
      state.containerItems = placed.map((item) => ({ ...item }));
      state.containerSizeKey = sizeKey;
    }
    return state.containerItems;
  }

  function ensureInventoryItems() {
    const rigEquipment = getSelectedEquipment("rig");
    const bagEquipment = getSelectedEquipment("bag");
    const rigKey = rigEquipment.id;
    const bagKey = bagEquipment.id;
    const secureKey = getSelectedEquipment("secure").id;

    if (isEquippedValue(rigKey)) {
      if (state.rigItems.length && state.rigSizeKey && state.rigSizeKey !== rigKey && state.rigSizeKey !== "none") {
        state.rigItems = [];
      }
      state.rigSizeKey = rigKey;
    } else if (!state.rigSizeKey) {
      state.rigSizeKey = rigKey;
    }

    if (isEquippedValue(bagKey)) {
      if (state.bagItems.length && state.bagSizeKey && state.bagSizeKey !== bagKey && state.bagSizeKey !== "none") {
        state.bagItems = [];
      }
      state.bagSizeKey = bagKey;
    } else if (!state.bagSizeKey) {
      state.bagSizeKey = bagKey;
    }

    if (state.secureItems.length && state.secureSizeKey !== secureKey) {
      state.secureItems = [];
    }

    state.secureSizeKey = secureKey;
  }
  function renderInventoryGrids() {
    ensureInventoryItems();

    const pocketsGrid = getGridInfoById("pockets");
    const rigGrid = getGridInfoById("rig");
    const bagGrid = getGridInfoById("bag");
    const secureGrid = getGridInfoById("secure");

    if (pocketsGrid) {
      renderGrid(pocketsGrid, () => {}, true);
    }
    if (rigGrid) {
      renderGrid(rigGrid, () => {}, true);
    }
    if (bagGrid) {
      renderGrid(bagGrid, () => {}, true);
    }
    if (secureGrid) {
      renderGrid(secureGrid, () => {}, true);
    }

    dom.invDetail.innerHTML = "\u5de6\u4fa7\u9ed8\u8ba4\u65e0\u7269\u54c1\uff08\u5168\u7a7a\uff09\u3002\u53ea\u6709\u53f3\u4fa7\u641c\u7d22\u5bb9\u5668\u6709\u7269\u54c1\u3002";
  }

  function renderContainer() {
    const size = parseSize(dom.containerSel.value);
    dom.containerTitle.textContent = `\u9632\u5bd2\u5927\u8863\uff08\u5bb9\u5668 ${size.cols}\u00d7${size.rows}\uff09`;
    ensureContainerItems(size.cols, size.rows);

    renderGrid(getGridInfoById("container"), (item) => {
      dom.containerDetail.innerHTML = `\u5bb9\u5668\u7269\u54c1\uff1a<b>${item.name}</b>\uff08${item.w}\u00d7${item.h}\uff09<br/>${item.desc}`;
    }, true);
  }

  function rerenderAll() {
    hideItemTooltip();
    renderInventoryLayout();
    renderInventoryGrids();
    renderContainer();
  }

  async function initialize() {
    setLoadingState("\u6b63\u5728\u52a0\u8f7d\u7269\u54c1\u6570\u636e...");

    if (location.protocol === "file:") {
      throw new Error("\u68c0\u6d4b\u5230\u4f60\u662f\u76f4\u63a5\u6253\u5f00 file:///index.html\u3002\u5916\u90e8 .ii \u7269\u54c1\u6587\u4ef6\u9700\u8981\u901a\u8fc7\u672c\u5730 HTTP \u670d\u52a1\u52a0\u8f7d\uff0c\u4f8b\u5982\u5728\u9879\u76ee\u6839\u76ee\u5f55\u8fd0\u884c scripts\\serve.ps1\uff0c\u7136\u540e\u8bbf\u95ee http://localhost:8080/");
    }

    await loadEquipmentDefinitions();
    initializeEquipmentSelectors();
    itemInstances = await loadItemDefinitions();
    renderInventoryLayout();
    renderInventoryGrids();
    renderContainer();
  }

  [dom.secureSel].forEach((select) => {
    select.addEventListener("change", renderInventoryGrids);
  });
  [dom.secureSel, dom.equipSecureSel].filter(Boolean).forEach((select) => {
    select.addEventListener("change", () => {
      syncEquipmentSelections();
      renderInventoryLayout();
      renderInventoryGrids();
    });
  });
  [dom.equipRigSel, dom.equipBagSel].forEach((select) => {
    if (!select) {
      return;
    }
    select.addEventListener("change", () => {
      syncEquipmentSelections();
      renderInventoryLayout();
      renderInventoryGrids();
    });
  });
  dom.containerSel.addEventListener("change", renderContainer);

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const tagName = event.target && event.target.tagName;
    if (tagName && ["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      return;
    }

    if ((event.key === "r" || event.key === "R") && state.dragState) {
      if (rotateDraggedItem()) {
        event.preventDefault();
      }
    }
  });
  initialize().catch((error) => {
    hideItemTooltip();
    setLoadError(error);
    console.error(error);
  });
})();
































































