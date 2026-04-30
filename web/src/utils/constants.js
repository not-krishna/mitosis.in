export const ratioSizes = {
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "4:5": { w: 1080, h: 1350 },
  "3:2": { w: 1200, h: 800 },
  "21:9": { w: 2560, h: 1080 },
};

export const seedColumns = [
  "ID",
  "TEXT_TAGLINE",
  "TEXT_PRODUCT_NAME",
  "IMAGE_CONTAINER",
  "COLOR_PRIMARY",
].map((name) => ({ name, type: "TEXT" }));

export const seedRows = [
  ["Variant_01", "NAM SALE", "Banarasi Silkwear", "", "#6c63ff"],
  ["Variant_02", "NAM SALE", "Wedding Saree", "", "#10b981"],
  ["Variant_03", "NAM SALE", "Silk Wedding Set", "", "#f59e0b"],
];

export const toolCatalog = [
  { type: "input", label: "Sheet", detail: "CSV data", icon: "sheet" },
  {
    type: "mapping",
    label: "Mapping",
    detail: "Connect data",
    icon: "mapping",
  },
  {
    type: "generation",
    label: "Generate",
    detail: "Select variants",
    icon: "generate",
  },
  { type: "scale", label: "Scale", detail: "Set ratios", icon: "scale" },
  { type: "output", label: "Output", detail: "Frame dock", icon: "output" },
  { type: "frame", label: "Add Frame", detail: "Place asset", icon: "frame" },
];

export const emptyAction = () => {};
