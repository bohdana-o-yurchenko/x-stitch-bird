/** Bead outline per Mill Hill series: circle radius or bugle length, as a fraction of the cell (SPEC §2.3). */
export interface BeadShape {
  r?: number;
  bugle?: number;
}

export const BEAD_SHAPES: Record<string, BeadShape> = {
  "Petite Glass": { r: 0.3 },
  "Size 8": { r: 0.44 },
  "Size 6": { r: 0.47 },
  Pebble: { r: 0.5 },
  "Small Bugle": { bugle: 0.62 },
  "Medium Bugle": { bugle: 0.8 },
  "Large Bugle": { bugle: 0.95 },
  // shaped charms, bigger than a cell's bead
  "Glass Treasures": { r: 0.48 },
  "Crystal Treasures": { r: 0.48 },
  "Metal Treasures": { r: 0.48 },
};

export const beadShape = (series: string | undefined): BeadShape => (series && BEAD_SHAPES[series]) || {};
