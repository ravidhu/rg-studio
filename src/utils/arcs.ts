/** Geometry helpers for radial charts. Angles are fractions of a turn, starting at 12 o'clock, clockwise. */

export interface Point {
  x: number
  y: number
}

export function polar(cx: number, cy: number, radius: number, turn: number): Point {
  const angle = turn * 2 * Math.PI - Math.PI / 2
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

const round = (value: number): string => value.toFixed(2)

/** Closed path of a ring sector between two radii and two angles. */
export function ringSector(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const sweep = Math.min(end - start, 0.99999)
  if (sweep <= 0) return ''
  const stop = start + sweep
  const large = sweep > 0.5 ? 1 : 0
  const a = polar(cx, cy, outer, start)
  const b = polar(cx, cy, outer, stop)
  const c = polar(cx, cy, inner, stop)
  const d = polar(cx, cy, inner, start)
  return [
    `M${round(a.x)},${round(a.y)}`,
    `A${outer},${outer} 0 ${large} 1 ${round(b.x)},${round(b.y)}`,
    `L${round(c.x)},${round(c.y)}`,
    `A${inner},${inner} 0 ${large} 0 ${round(d.x)},${round(d.y)}`,
    'Z',
  ].join(' ')
}

/**
 * Whether a horizontal box centred on a point stays inside a ring sector and
 * inside a square drawing of side `size`. Each corner is tested for its
 * distance to the centre (radial room) and for its angle (room along the
 * arc), so a label never leaves its arc, the outer ring or the drawing.
 */
export function boxFitsSector(
  centre: Point, box: { x: number; y: number; width: number; height: number },
  inner: number, outer: number, start: number, end: number, size: number,
): boolean {
  const full = end - start >= 0.9999
  for (const dx of [-box.width / 2, box.width / 2]) {
    for (const dy of [-box.height / 2, box.height / 2]) {
      const x = box.x + dx
      const y = box.y + dy
      if (x < 0 || y < 0 || x > size || y > size) return false
      const radius = Math.hypot(x - centre.x, y - centre.y)
      if (radius < inner || radius > outer) return false
      if (full) continue
      const turn = ((Math.atan2(y - centre.y, x - centre.x) + Math.PI / 2) / (2 * Math.PI) + 1) % 1
      if (turn < start || turn > end) return false
    }
  }
  return true
}
