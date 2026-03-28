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

  function getCellFromEvent(grid, cols, rows, event) {
    const rect = grid.getBoundingClientRect();
    const { cell, gap } = getCellSize(grid);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
      return null;
    }

    const step = cell + gap;
    const x = localX + grid.scrollLeft;
    const y = localY + grid.scrollTop;
    const col = Math.floor(x / step);
    const row = Math.floor(y / step);

    if (col < 0 || row < 0 || col >= cols || row >= rows) {
      return null;
    }

    return { col, row };
  }

  function buildOcc(items, cols, rows, ignoreId) {
    const occ = Array.from({ length: rows }, () => Array(cols).fill(false));

    items.forEach((item) => {
      if (ignoreId && item.id === ignoreId) {
        return;
      }

      for (let row = item.y; row < item.y + item.h; row += 1) {
        for (let col = item.x; col < item.x + item.w; col += 1) {
          if (row >= 0 && row < rows && col >= 0 && col < cols) {
            occ[row][col] = true;
          }
        }
      }
    });

    return occ;
  }

  function canPlaceAt(occ, x, y, w, h, cols, rows) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) {
      return false;
    }

    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        if (occ[row][col]) {
          return false;
        }
      }
    }

    return true;
  }

  function markPlace(occ, x, y, w, h) {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        occ[row][col] = true;
      }
    }
  }

  function autoPack(items, cols, rows) {
    const occ = Array.from({ length: rows }, () => Array(cols).fill(false));
    const placed = [];

    for (const item of items) {
      let placedItem = false;

      for (let row = 0; row < rows && !placedItem; row += 1) {
        for (let col = 0; col < cols && !placedItem; col += 1) {
          if (canPlaceAt(occ, col, row, item.w, item.h, cols, rows)) {
            markPlace(occ, col, row, item.w, item.h);
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
    return {
      id: definition.internalId,
      name: definition.name,
      label: definition.displayId,
      desc: definition.desc,
      w: definition.size.w,
      h: definition.size.h,
      texture: definition.texture,
      category: definition.category,
      tint: definition.tint || "transparent"
    };
  }

  const ITEM_INFO_INDEX_PATH = "./src/items/item_info/index.json";
  const ITEM_INFO_BASE_PATH = "./src/items/item_info";
  const ITEM_ICON_BASE_PATH = "./src/items/item_icons";
  const itemRegistry = new ItemRegistry();
  let itemInstances = [];

  const DRAG_MOVE_PX = 6;

  const state = {
    dragState: null,
    suppressClickId: null,
    isSecurePinned: false,
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
    secureSel: document.getElementById("secureSel"),
    invLayout: document.getElementById("invLayout"),
    invDetail: document.getElementById("invDetail"),
    containerSel: document.getElementById("containerSel"),
    containerGrid: document.getElementById("containerGrid"),
    containerTitle: document.getElementById("containerTitle"),
    containerDetail: document.getElementById("containerDetail")
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
    const content = `<b>物品加载失败：</b><pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(stack)}</pre>`;
    dom.invDetail.innerHTML = content;
    dom.containerDetail.innerHTML = content;
  }

  async function fetchJsonFile(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    }

    return JSON.parse(await response.text());
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
      return { id, el: dom.containerGrid, cols: size.cols, rows: size.rows, items: state.containerItems };
    }

    if (id === "pockets") {
      const el = document.getElementById("pocketsGrid");
      return { id, el, cols: 4, rows: 1, items: state.pocketsItems };
    }

    if (id === "rig") {
      const el = document.getElementById("rigGrid");
      const size = parseSize(dom.rigSel.value);
      return { id, el, cols: size.cols, rows: size.rows, items: state.rigItems };
    }

    if (id === "bag") {
      const el = document.getElementById("bagGrid");
      const size = parseSize(dom.bagSel.value);
      return { id, el, cols: size.cols, rows: size.rows, items: state.bagItems };
    }

    if (id === "secure") {
      const el = document.getElementById("secureGrid");
      const size = parseSize(dom.secureSel.value);
      return { id, el, cols: size.cols, rows: size.rows, items: state.secureItems };
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
    rerenderAll();
  }

  function supportsItemInGrid(gridInfo, itemData) {
    if (gridInfo.id === "pockets") {
      return itemData.w === 1 && itemData.h === 1;
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

    const pointerCell = getCellFromEvent(targetGrid.el, targetGrid.cols, targetGrid.rows, pointerEvent);
    if (!pointerCell) {
      return { targetGrid: null, position: null, canDrop: false };
    }

    const maxCol = Math.max(0, targetGrid.cols - itemData.w);
    const maxRow = Math.max(0, targetGrid.rows - itemData.h);
    const position = {
      x: Math.max(0, Math.min(pointerCell.col - dragState.grabCellX, maxCol)),
      y: Math.max(0, Math.min(pointerCell.row - dragState.grabCellY, maxRow))
    };

    const occupancy = buildOcc(
      targetGrid.items,
      targetGrid.cols,
      targetGrid.rows,
      dragState.sourceId === targetGrid.id ? itemData.id : null
    );

    return {
      targetGrid,
      position,
      canDrop: canPlaceAt(
        occupancy,
        position.x,
        position.y,
        itemData.w,
        itemData.h,
        targetGrid.cols,
        targetGrid.rows
      )
    };
  }

  function renderGrid(el, cols, rows, items, onItemClick, allowDrag = false) {
    el.style.setProperty("--cols", cols);
    el.style.setProperty("--rows", rows);
    el.innerHTML = "";

    const hasPositions = items.length > 0 && items.every((item) => typeof item.x === "number" && typeof item.y === "number");
    const placed = hasPositions ? items : autoPack(items, cols, rows);
    const occ = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (const item of placed) {
      for (let row = item.y; row < item.y + item.h; row += 1) {
        for (let col = item.x; col < item.x + item.w; col += 1) {
          occ[row][col] = true;
        }
      }
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (occ[row][col]) {
          continue;
        }

        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = String(row + 1);
        el.appendChild(cell);
      }
    }

    for (const itemData of placed) {
      const item = document.createElement("div");
      item.className = "item";
      item.dataset.itemId = itemData.id;
      item.style.gridColumn = `${itemData.x + 1} / span ${itemData.w}`;
      item.style.gridRow = `${itemData.y + 1} / span ${itemData.h}`;

      const iconStyle = itemData.texture ? `style="background-image:url('${itemData.texture}')"` : "";
      item.innerHTML = `
        <div class="icon" ${iconStyle}></div>
        <div class="label">${itemData.name}</div>
        <div class="meta"></div>
      `;
      item.style.setProperty("--item-tint", itemData.tint && itemData.tint !== "transparent" ? itemData.tint : "transparent");

      item.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.suppressClickId === itemData.id) {
          state.suppressClickId = null;
          return;
        }

        clearActiveItems(el);
        item.classList.add("active");
        onItemClick(itemData);
      });

      if (allowDrag) {
        item.addEventListener("mousedown", (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          const startX = event.clientX;
          const startY = event.clientY;
          const rect = item.getBoundingClientRect();
          const offsetX = startX - rect.left;
          const offsetY = startY - rect.top;
          const sourceMetrics = getCellSize(el);
          const sourceStep = sourceMetrics.cell + sourceMetrics.gap;
          let didStartDrag = false;

          const beginDrag = (moveEvent) => {
            state.dragState = {
              item: itemData,
              grid: el,
              preview: document.createElement("div"),
              ghost: item.cloneNode(true),
              sourceId: getGridIdByEl(el),
              previewGridId: null,
              offsetX,
              offsetY,
              grabCellX: Math.max(0, Math.min(itemData.w - 1, Math.floor(offsetX / sourceStep))),
              grabCellY: Math.max(0, Math.min(itemData.h - 1, Math.floor(offsetY / sourceStep)))
            };

            state.dragState.preview.className = "item";
            state.dragState.preview.style.opacity = "0.35";
            state.dragState.preview.style.pointerEvents = "none";
            state.dragState.preview.style.gridColumn = `${itemData.x + 1} / span ${itemData.w}`;
            state.dragState.preview.style.gridRow = `${itemData.y + 1} / span ${itemData.h}`;

            item.classList.add("dragging");
            state.dragState.ghost.classList.remove("dragging");
            state.dragState.ghost.classList.add("drag-ghost");
            state.dragState.ghost.style.width = `${item.offsetWidth}px`;
            state.dragState.ghost.style.height = `${item.offsetHeight}px`;
            state.dragState.ghost.style.left = `${moveEvent.clientX - offsetX}px`;
            state.dragState.ghost.style.top = `${moveEvent.clientY - offsetY}px`;
            document.body.appendChild(state.dragState.ghost);
            didStartDrag = true;

            try {
              pickUpAudio.currentTime = 0;
              pickUpAudio.play();
            } catch (error) {}
          };

          const clearPreview = () => {
            if (state.dragState && state.dragState.preview && state.dragState.preview.parentElement) {
              state.dragState.preview.remove();
              state.dragState.previewGridId = null;
            }
          };

          const onMove = (moveEvent) => {
            if (!state.dragState) {
              const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
              if (distance <= DRAG_MOVE_PX) {
                return;
              }

              beginDrag(moveEvent);
            }

            if (state.dragState.ghost) {
              state.dragState.ghost.style.left = `${moveEvent.clientX - state.dragState.offsetX}px`;
              state.dragState.ghost.style.top = `${moveEvent.clientY - state.dragState.offsetY}px`;
            }

            const dropTarget = getDropTarget(itemData, moveEvent);
            if (!dropTarget.targetGrid || !dropTarget.position) {
              clearPreview();
              return;
            }

            if (!state.dragState.preview.parentElement || state.dragState.previewGridId !== dropTarget.targetGrid.id) {
              dropTarget.targetGrid.el.appendChild(state.dragState.preview);
              state.dragState.previewGridId = dropTarget.targetGrid.id;
            }

            state.dragState.preview.style.gridColumn = `${dropTarget.position.x + 1} / span ${itemData.w}`;
            state.dragState.preview.style.gridRow = `${dropTarget.position.y + 1} / span ${itemData.h}`;
            state.dragState.preview.classList.toggle("invalid", !dropTarget.canDrop);
          };

          const onUp = (upEvent) => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            if (!state.dragState) {
              return;
            }

            const dropTarget = getDropTarget(itemData, upEvent);
            if (dropTarget.targetGrid && dropTarget.position && dropTarget.canDrop) {
              moveItemBetweenGrids(
                state.dragState.sourceId,
                dropTarget.targetGrid.id,
                itemData.id,
                dropTarget.position.x,
                dropTarget.position.y
              );
            }

            clearPreview();
            item.classList.remove("dragging");
            if (state.dragState.ghost) {
              state.dragState.ghost.remove();
            }

            if (didStartDrag) {
              state.suppressClickId = itemData.id;
            }

            state.dragState = null;
            try {
              putDownAudio.currentTime = 0;
              putDownAudio.play();
            } catch (error) {}
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        });
      }

      el.appendChild(item);
    }

    el.addEventListener("click", () => clearActiveItems(el), { once: false });
  }

  function buildSection(titleText, rightNode, gridId) {
    const wrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "section-head";

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = titleText;

    head.appendChild(title);
    if (rightNode) {
      head.appendChild(rightNode);
    }

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.id = gridId;
    if (gridId === "pocketsGrid") {
      grid.classList.add("pockets-grid");
    }

    wrap.appendChild(head);
    wrap.appendChild(grid);
    return wrap;
  }

  function buildPinButton() {
    const button = document.createElement("div");
    button.className = `pin-btn${state.isSecurePinned ? " pinned" : ""}`;
    button.title = state.isSecurePinned ? "取消固定" : "固定到独立 VBox2";
    button.textContent = "📌";
    button.addEventListener("click", () => {
      state.isSecurePinned = !state.isSecurePinned;
      renderInventoryLayout();
      renderInventoryGrids();
    });
    return button;
  }

  function renderInventoryLayout() {
    dom.invLayout.innerHTML = "";

    const pocketsSection = buildSection("口袋（固定）", null, "pocketsGrid");
    const rigSection = buildSection("弹挂", null, "rigGrid");
    const bagSection = buildSection("背包", null, "bagGrid");
    const secureSection = buildSection("安全箱（保险）", buildPinButton(), "secureGrid");

    if (!state.isSecurePinned) {
      const one = document.createElement("div");
      one.className = "inv-vbox-one";
      one.appendChild(pocketsSection);
      one.appendChild(rigSection);
      one.appendChild(bagSection);
      one.appendChild(secureSection);
      dom.invLayout.appendChild(one);
      return;
    }

    const two = document.createElement("div");
    two.className = "inv-vbox-two";

    const firstColumn = document.createElement("div");
    firstColumn.className = "vbox";
    firstColumn.appendChild(pocketsSection);
    firstColumn.appendChild(rigSection);
    firstColumn.appendChild(bagSection);

    const secondColumn = document.createElement("div");
    secondColumn.className = "vbox secure-box";
    secondColumn.appendChild(secureSection);

    two.appendChild(firstColumn);
    two.appendChild(secondColumn);
    dom.invLayout.appendChild(two);
  }

  function ensureContainerItems(cols, rows) {
    const sizeKey = `${cols}x${rows}`;
    if (state.containerItems.length === 0 || state.containerSizeKey !== sizeKey) {
      const placed = autoPack(itemInstances, cols, rows);
      state.containerItems = placed.map((item) => ({ ...item }));
      state.containerSizeKey = sizeKey;
    }
    return state.containerItems;
  }

  function ensureInventoryItems() {
    const rigKey = dom.rigSel.value;
    const bagKey = dom.bagSel.value;
    const secureKey = dom.secureSel.value;

    if (state.rigItems.length && state.rigSizeKey !== rigKey) {
      state.rigItems = [];
    }
    if (state.bagItems.length && state.bagSizeKey !== bagKey) {
      state.bagItems = [];
    }
    if (state.secureItems.length && state.secureSizeKey !== secureKey) {
      state.secureItems = [];
    }

    state.rigSizeKey = rigKey;
    state.bagSizeKey = bagKey;
    state.secureSizeKey = secureKey;
  }

  function renderInventoryGrids() {
    ensureInventoryItems();

    const pocketsGrid = document.getElementById("pocketsGrid");
    const rigGrid = document.getElementById("rigGrid");
    const bagGrid = document.getElementById("bagGrid");
    const secureGrid = document.getElementById("secureGrid");

    const rigSize = parseSize(dom.rigSel.value);
    const bagSize = parseSize(dom.bagSel.value);
    const secureSize = parseSize(dom.secureSel.value);

    renderGrid(pocketsGrid, 4, 1, state.pocketsItems, () => {}, true);
    renderGrid(rigGrid, rigSize.cols, rigSize.rows, state.rigItems, () => {}, true);
    renderGrid(bagGrid, bagSize.cols, bagSize.rows, state.bagItems, () => {}, true);
    renderGrid(secureGrid, secureSize.cols, secureSize.rows, state.secureItems, () => {}, true);

    dom.invDetail.innerHTML = "左侧默认无物品（全空）。只有右侧搜索容器有物品。";
  }

  function renderContainer() {
    const size = parseSize(dom.containerSel.value);
    dom.containerTitle.textContent = `防寒大衣（容器 ${size.cols}×${size.rows}）`;
    const items = ensureContainerItems(size.cols, size.rows);

    renderGrid(dom.containerGrid, size.cols, size.rows, items, (item) => {
      dom.containerDetail.innerHTML = `容器物品：<b>${item.name}</b>（${item.w}×${item.h}）<br/>${item.desc}`;
    }, true);
  }

  function rerenderAll() {
    renderInventoryLayout();
    renderInventoryGrids();
    renderContainer();
  }

  async function initialize() {
    setLoadingState("正在加载物品数据...");

    if (location.protocol === "file:") {
      throw new Error("检测到你是直接打开 file:///index.html。外部 .ii 物品文件需要通过本地 HTTP 服务加载，例如在项目根目录运行 scripts\\serve.ps1，然后访问 http://localhost:8080/");
    }

    itemInstances = await loadItemDefinitions();
    renderInventoryLayout();
    renderInventoryGrids();
    renderContainer();
  }

  [dom.rigSel, dom.bagSel, dom.secureSel].forEach((select) => {
    select.addEventListener("change", renderInventoryGrids);
  });

  dom.containerSel.addEventListener("change", renderContainer);

  initialize().catch((error) => {
    setLoadError(error);
    console.error(error);
  });
})();
