// Board geometry — matches the physical Medici board:
// square board, five wedge-shaped commodity tracks radiating from the
// center, pentagonal crest at center.
//
// The five tracks are SECTORS (radial sides, flat inner end), each spanning
// 36° either side of its centerline. Five x 72° = 360°, so adjacent tracks
// share an exact edge. The inner end of each track is a chord that lies
// exactly on one side of the central pentagon (circumradius = TRACK_INNER),
// so tracks and crest touch with no gaps.
export const CX = 500
export const CY = 500

export const MONEY_RADIUS = 462 // legacy (unused, kept for reference)
export const COUNTER_RADIUS = 436 // legacy
export const TRACK_OUTER = 402 // base (level 0, gold frame)
export const TRACK_INNER = 110 // inner end of the tracks = pentagon circumradius
export const CREST_RADIUS = TRACK_INNER // central pentagon circumradius
export const TRACK_SPREAD = 36 // half-angle of each sector (36 x 2 x 5 = 360)
export const PENTAGON_VERTEX_ANGLE = -54 // first vertex angle (between wedge centerlines)

export const TRACK_LEVELS = 8
export const MONEY_MAX = 100

export function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

export interface TrackGeom {
  centerAngle: number
  baseLeft: [number, number]
  baseRight: [number, number]
  innerLeft: [number, number]
  innerRight: [number, number]
}

// Track i (0..4) centered at angle -90 + i*72, radiating outward from the
// pentagon. Radial sides: inner and outer corners share the same spread.
export function trackGeom(i: number): TrackGeom {
  const centerAngle = -90 + i * 72
  const [blx, bly] = pt(CX, CY, TRACK_OUTER, centerAngle - TRACK_SPREAD)
  const [brx, bry] = pt(CX, CY, TRACK_OUTER, centerAngle + TRACK_SPREAD)
  const [ilx, ily] = pt(CX, CY, TRACK_INNER, centerAngle - TRACK_SPREAD)
  const [irx, iry] = pt(CX, CY, TRACK_INNER, centerAngle + TRACK_SPREAD)
  return { centerAngle, baseLeft: [blx, bly], baseRight: [brx, bry], innerLeft: [ilx, ily], innerRight: [irx, iry] }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Edge of the track at parameter t (0 = base/outer, 1 = inner/center).
export function trackEdge(g: TrackGeom, t: number, side: 'left' | 'right'): [number, number] {
  const from = side === 'left' ? g.baseLeft : g.baseRight
  const to = side === 'left' ? g.innerLeft : g.innerRight
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t)]
}

// Midpoint of the two edges at parameter t.
export function trackPoint(g: TrackGeom, t: number): [number, number] {
  const leftX = lerp(g.baseLeft[0], g.innerLeft[0], t)
  const leftY = lerp(g.baseLeft[1], g.innerLeft[1], t)
  const rightX = lerp(g.baseRight[0], g.innerRight[0], t)
  const rightY = lerp(g.baseRight[1], g.innerRight[1], t)
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

// The five pentagon vertices, between the track centerlines.
export function pentagonPoints(): [number, number][] {
  return Array.from({ length: 5 }, (_, i) => pt(CX, CY, CREST_RADIUS, PENTAGON_VERTEX_ANGLE + i * 72))
}
