/** A polygon corner in face pixels and the radius its corner is rounded by. */
export type FrameCorner = readonly [x: number, y: number, radius: number]

const fmt = (n: number) => String(Number(n.toFixed(2)))

/** Closed SVG path through the corners, each one rounded by an arc tangent to both of its edges. */
export function roundedPath(corners: readonly FrameCorner[]): string {
  const n = corners.length
  const parts: string[] = []
  corners.forEach(([x, y, r], i) => {
    const [px, py] = corners[(i + n - 1) % n]
    const [nx, ny] = corners[(i + 1) % n]
    const ax = px - x
    const ay = py - y
    const bx = nx - x
    const by = ny - y
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    const half = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) / 2
    const t = Math.min(r / Math.tan(half), la / 2, lb / 2)
    const radius = t * Math.tan(half)
    parts.push(`${i === 0 ? 'M' : 'L'} ${fmt(x + (ax / la) * t)} ${fmt(y + (ay / la) * t)}`)
    if (radius > 0.01) {
      const sweep = (x - px) * (ny - y) - (y - py) * (nx - x) > 0 ? 1 : 0
      parts.push(`A ${fmt(radius)} ${fmt(radius)} 0 0 ${sweep} ${fmt(x + (bx / lb) * t)} ${fmt(y + (by / lb) * t)}`)
    }
  })
  return `${parts.join(' ')} Z`
}
