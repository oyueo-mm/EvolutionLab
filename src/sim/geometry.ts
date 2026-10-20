// Collision tests for oriented rectangles (bodies) and circles (food).
// Bodies are rectangles: width along the heading, height across it.

/** Does an oriented rect (center, heading cos/sin, half extents) overlap a circle? */
export function rectCircleOverlap(
  rx: number, ry: number, cos: number, sin: number, hw: number, hh: number,
  cx: number, cy: number, r: number,
): boolean {
  const dx = cx - rx, dy = cy - ry;
  // Circle center in the rect's local frame
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const qx = lx < -hw ? -hw : lx > hw ? hw : lx;
  const qy = ly < -hh ? -hh : ly > hh ? hh : ly;
  const ex = lx - qx, ey = ly - qy;
  return ex * ex + ey * ey <= r * r;
}

/** Separating-axis test for two oriented rectangles. */
export function rectRectOverlap(
  ax: number, ay: number, ac: number, as: number, ahw: number, ahh: number,
  bx: number, by: number, bc: number, bs: number, bhw: number, bhh: number,
): boolean {
  const dx = bx - ax, dy = by - ay;
  // Axes: A's (ac, as), (-as, ac); B's (bc, bs), (-bs, bc)
  // Projection radius of a rect onto axis (ux,uy) = hw*|dot(axisW,u)| + hh*|dot(axisH,u)|
  // Axis A-x
  let ra = ahw;
  let rb = bhw * Math.abs(bc * ac + bs * as) + bhh * Math.abs(-bs * ac + bc * as);
  if (Math.abs(dx * ac + dy * as) > ra + rb) return false;
  // Axis A-y
  ra = ahh;
  rb = bhw * Math.abs(bc * -as + bs * ac) + bhh * Math.abs(-bs * -as + bc * ac);
  if (Math.abs(dx * -as + dy * ac) > ra + rb) return false;
  // Axis B-x
  ra = ahw * Math.abs(ac * bc + as * bs) + ahh * Math.abs(-as * bc + ac * bs);
  rb = bhw;
  if (Math.abs(dx * bc + dy * bs) > ra + rb) return false;
  // Axis B-y
  ra = ahw * Math.abs(ac * -bs + as * bc) + ahh * Math.abs(-as * -bs + ac * bc);
  rb = bhh;
  if (Math.abs(dx * -bs + dy * bc) > ra + rb) return false;
  return true;
}
