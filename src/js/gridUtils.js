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
  if (x + w > cols || y + h > rows) {
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

window.InventoryGridUtils = {
  parseSize,
  getCellSize,
  buildOcc,
  canPlaceAt,
  autoPack
};
