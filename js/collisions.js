// Circle-vs-shape tests. No allocations: these run every physics step.

export function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// Squared distance from a point to the nearest point of an axis-aligned box.
export function distSqToBox(px, py, left, top, right, bottom) {
  const dx = px - clamp(px, left, right);
  const dy = py - clamp(py, top, bottom);
  return dx * dx + dy * dy;
}

function distSqToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1);
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return dx * dx + dy * dy;
}

function side(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

// Distance from a point to a triangle (0 when inside). Used to spot near misses; not for collisions.
export function distToTriangle(px, py, ax, ay, bx, by, tx, ty) {
  const d1 = side(px, py, ax, ay, bx, by);
  const d2 = side(px, py, bx, by, tx, ty);
  const d3 = side(px, py, tx, ty, ax, ay);
  if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 0;
  return Math.sqrt(Math.min(
    distSqToSegment(px, py, ax, ay, bx, by),
    distSqToSegment(px, py, bx, by, tx, ty),
    distSqToSegment(px, py, tx, ty, ax, ay)
  ));
}

// Does a circle touch a triangle? (centre inside it, or within r of any edge)
export function circleHitsTriangle(cx, cy, r, ax, ay, bx, by, tx, ty) {
  const d1 = side(cx, cy, ax, ay, bx, by);
  const d2 = side(cx, cy, bx, by, tx, ty);
  const d3 = side(cx, cy, tx, ty, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(hasNeg && hasPos)) return true;
  const r2 = r * r;
  return (
    distSqToSegment(cx, cy, ax, ay, bx, by) < r2 ||
    distSqToSegment(cx, cy, bx, by, tx, ty) < r2 ||
    distSqToSegment(cx, cy, tx, ty, ax, ay) < r2
  );
}
