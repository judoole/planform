export const furniture = {
  sofa: { label: "Sofa", size: [210, 90] },
  table: { label: "Table", size: [150, 90] },
  chair: { label: "Chair", size: [50, 55] },
  bed: { label: "Bed", size: [160, 210] },
  cabinet: { label: "Cabinet", size: [120, 60] },
  counter: { label: "Kitchen counter", size: [180, 60] },
  toilet: { label: "Toilet", size: [45, 70] },
  shower: { label: "Shower", size: [90, 90] },
  "fireplace-rounded": { label: "Rounded fireplace", size: [80, 65] },
  "fireplace-square": { label: "Square fireplace", size: [80, 80] },
} as const;

export type FurnitureKind = keyof typeof furniture;
