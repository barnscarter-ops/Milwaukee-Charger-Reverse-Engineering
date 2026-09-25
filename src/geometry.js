// Pure 2D helpers in board units. Shared by the viewer and scripts/check-data.mjs (no DOM, no three.js).

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area-weighted centroid of a simple polygon. */
export function polygonCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, y0] = poly[j], [x1, y1] = poly[i];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** True when (x, y) is board material: inside the outline and outside every hole. */
export function onBoard(x, y, board) {
  return pointInPolygon(x, y, board.outline) && !board.holes.some(h => pointInPolygon(x, y, h));
}

/** Sample points of a footprint: centre, corners and edge midpoints of its bounding rectangle. */
export function footprintSamples(cx, cy, hx, hy) {
  const pts = [[cx, cy]];
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) if (sx || sy) pts.push([cx + sx * hx, cy + sy * hy]);
  return pts;
}

/**
 * Isolation zone of a point: 'barrier' (hatched keep-out), 'primary', or 'secondary'.
 * The zone polygons are photo tracings (see board.json isolation.source), so the answer is probable, not measured.
 */
export function zoneOfPoint(x, y, isolation) {
  if (!isolation) return null;
  if (pointInPolygon(x, y, isolation.barrier)) return 'barrier';
  if (pointInPolygon(x, y, isolation.primary)) return 'primary';
  return 'secondary';
}

/** Zone of a footprint: 'spans' when it reaches both sides, 'barrier' when it touches the keep-out. */
export function zoneOfFootprint(cx, cy, hx, hy, isolation) {
  if (!isolation) return null;
  const zones = new Set(footprintSamples(cx, cy, hx, hy).map(([x, y]) => zoneOfPoint(x, y, isolation)));
  if (zones.has('primary') && zones.has('secondary')) return 'spans';
  if (zones.has('barrier')) return 'barrier';
  return [...zones][0];
}

/** Footprint half-extents (board units) used for hit-testing and the containment check. */
export function halfExtent(p) {
  switch (p.kind) {
    case 'elcap': case 'fuse': case 'graycyl': case 'led': case 'pad': case 'tp': return [p.dia / 2, p.dia / 2];
    case 'disc': return [p.dia / 2, p.t / 2];
    case 'discflat': return [p.dia / 2, p.dia * 0.42];
    case 'filmcyl': case 'axial': return p.along === 'y' ? [p.dia / 2, p.len / 2] : [p.len / 2, p.dia / 2];
    case 'jumper': return p.along === 'y' ? [8, p.len / 2] : [p.len / 2, 8];
    case 'bracket': return [(p.foot_x1 - p.x) / 2, (p.y1 - p.y0) / 2];
    case 'marker': return [10, 10];
    default: return [(p.w || 34) / 2, (p.d || 18) / 2];
  }
}

/** Centre of the footprint (the bracket is anchored at its base edge, not its middle). */
export function footprintCentre(p) {
  if (p.kind === 'bracket') return [(p.x + p.foot_x1) / 2, (p.y0 + p.y1) / 2];
  return [p.x, p.y];
}
