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

const assetUrl = (fileName) => fileName;
const itemRegistry = new ItemRegistry();

const demoDefinitions = [
  itemRegistry.register({
    displayId: "燃",
    internalId: "high_energy_fuel",
    texture: assetUrl("high_energy_fuel.png"),
    tint: "#4C300F",
    size: { w: 2, h: 2 },
    category: "易燃物",
    name: "高能燃料",
    desc: "4格(2×2)"
  }),
  itemRegistry.register({
    displayId: "镜",
    internalId: "gold_rimmed_glasses",
    texture: assetUrl("gold_rimmed_glasses.png"),
    tint: "#322940",
    size: { w: 2, h: 1 },
    category: "收藏品",
    name: "金丝边眼镜",
    desc: "2格(2×1)"
  }),
  itemRegistry.register({
    displayId: "布",
    internalId: "cotton",
    texture: assetUrl("cotton.png"),
    tint: "#1A354F",
    size: { w: 1, h: 2 },
    category: "生活用品",
    name: "棉布",
    desc: "2格(1×2)"
  }),
  itemRegistry.register({
    displayId: "消",
    internalId: "disinfectant",
    texture: assetUrl("disinfectant.png"),
    tint: "transparent",
    size: { w: 1, h: 1 },
    category: "医疗杂物",
    name: "消毒水",
    desc: "1格"
  }),
  itemRegistry.register({
    displayId: "密",
    internalId: "secret_document",
    texture: assetUrl("secret_document.png"),
    tint: "#59211B",
    size: { w: 2, h: 1 },
    category: "收藏品",
    name: "机密文件",
    desc: "2格(2×1)"
  }),
  itemRegistry.register({
    displayId: "剂",
    internalId: "ideal_state_reagent_kit",
    texture: assetUrl("ideal_state_reagent_kit.png"),
    tint: "#59211B",
    size: { w: 3, h: 2 },
    category: "收藏品",
    name: "\"理想国\"",
    desc: "6格(3×2)"
  })
];

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

window.InventoryDemoData = {
  demoMultiInstances: demoDefinitions.map(toItemInstance)
};
