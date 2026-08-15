// Board geometry — matches the physical Medici board:
// square board, circular money track 0-99 around the edge (clockwise from top),
// five inward-pointing triangular commodity tracks, golden crest at center.
export const CX = 500
export const CY = 500

export const MONEY_RADIUS = 462 // number positions
export const COUNTER_RADIUS = 436 // player counters on the money track
export const TRACK_OUTER = 402 // triangle base (level 0, gold frame) — clear of the money ring
export const TRACK_INNER = 168 // triangle apex (level 7, toward center)
export const CREST_RADIUS = 150
export const TRACK_SPREAD = 26 // half-angle of each triangle at the base

export const TRACK_LEVELS = 8
export const MONEY_MAX = 100 // track runs 0-99

// Angle in degrees: 0 at 12 o'clock, clockwise (matches the physical board's
// clockwise money track).
export function moneyAngle(m: number): number {
  return ((m % MONEY_MAX) / MONEY_MAX) * 360 - 90
}

export function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

export interface TrackGeom {
  apex: [number, number]
  baseLeft: [number, number]
  baseRight: [number, number]
  centerAngle: number
}

// Track i (0..4) centered at angle -90 + i*72, apex pointing to the center.
export function trackGeom(i: number): TrackGeom {
  const centerAngle = -90 + i * 72
  const [ax, ay] = pt(CX, CY, TRACK_INNER, centerAngle)
  const [blx, bly] = pt(CX, CY, TRACK_OUTER, centerAngle - TRACK_SPREAD)
  const [brx, bry] = pt(CX, CY, TRACK_OUTER, centerAngle + TRACK_SPREAD)
  return { apex: [ax, ay], baseLeft: [blx, bly], baseRight: [brx, bry], centerAngle }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Point on the track at parameter t (0 = base/outer, 1 = apex/center).
export function trackPoint(g: TrackGeom, t: number): [number, number] {
  const leftX = lerp(g.baseLeft[0], g.apex[0], t)
  const leftY = lerp(g.baseLeft[1], g.apex[1], t)
  const rightX = lerp(g.baseRight[0], g.apex[0], t)
  const rightY = lerp(g.baseRight[1], g.apex[1], t)
  return [lerp(leftX, rightX, 0.5), lerp(leftY, rightY, 0.5)]
}

// Polygon for one level band (level L of 8, L=0..7). Band L spans t in [L/8, (L+1)/8].
export function bandPolygon(g: TrackGeom, L: number): string {
  const t0 = L / TRACK_LEVELS
  const t1 = (L + 1) / TRACK_LEVELS
  const p0a = trackEdge(g, t0, 'left')
  const p0b = trackEdge(g, t0, 'right')
  const p1b = trackEdge(g, t1, 'right')
  const p1a = trackEdge(g, t1, 'left')
  return `${p0a[0]},${p0a[1]} ${p0b[0]},${p0b[1]} ${p1b[0]},${p1b[1]} ${p1a[0]},${p1a[1]}`
}

export function trackEdge(g: TrackGeom, t: number, side: 'left' | 'right'): [number, number] {
  const from = side === 'left' ? g.baseLeft : g.baseRight
  return [lerp(from[0], g.apex[0], t), lerp(from[1], g.apex[1], t)]
}

// Midpoint of band L (where counters and bonus labels sit).
export function bandMid(g: TrackGeom, L: number): [number, number] {
  return trackPoint(g, (L + 0.5) / TRACK_LEVELS)
}

// Fraction along the band width for player index j among n players.
export function bandFraction(j: number, n: number): number {
  return (j + 1) / (n + 1)
}

export function bandPoint(g: TrackGeom, L: number, fraction: number): [number, number] {
  const t = (L + 0.5) / TRACK_LEVELS
  const left = trackEdge(g, t, 'left')
  const right = trackEdge(g, t, 'right')
  return [lerp(left[0], right[0], fraction), lerp(left[1], right[1], fraction)]
}
