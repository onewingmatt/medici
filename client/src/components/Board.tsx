// The Medici board — SVG recreation of the physical layout:
// money track ring (0-99), five triangular commodity tracks with bonus
// levels (5/10/20), golden crest with the Medici palle, day counters.
import { COMMODITIES } from '../../../shared/constants'
import type { Commodity } from '../../../shared/constants'
import type { ClientGame } from '../types'
import { useStore } from '../store'
import {
  CX,
  CY,
  TRACK_LEVELS,
  bandFraction,
  bandMid,
  bandPoint,
  bandPolygon,
  pentagonPoints,
  trackEdge,
  trackGeom,
} from '../boardGeometry'

// Commodity colors — Paul Tol "bright" qualitative scheme (verified from
// sronpersonalpages.nl/~pault, developed with models of the two main types
// of colour-blind vision): blue #4477AA, red #EE6677, green #228833,
// yellow #CCBB44, purple #AA3377. Cyan and grey are skipped because they
// collide with the player palette. Cross-set separation from players is by
// lightness: commodities are mid-tone, players are bright/neutral, and the
// white counter halo + player symbols + commodity watermarks are the
// redundant cues for the few unavoidable adjacent pairs (pink player vs
// cloth red, yellow player vs fur yellow).
export const COMMODITY_COLORS: Record<Commodity, string> = {
  cloth: '#D63031', // strong red — darker than Tol red so the pale wedge stays distinct from the pink player
  fur: '#CCBB44', // Tol yellow
  grain: '#228833', // Tol green
  dye: '#4477AA', // Tol blue
  spice: '#AA3377', // Tol purple
}

// Subtle watermark per commodity — a recognizable single-color emoji
// (text-presentation selector U+FE0E forces monochrome outline, so the
// glyph inherits the commodity tint instead of rendering in full color).
export const COMMODITY_MARKS: Record<string, string> = {
  cloth: '🧵\uFE0E', // thread
  fur: '🐾\uFE0E', // paw prints
  grain: '🌾\uFE0E', // sheaf of rice
  dye: '🎨\uFE0E', // artist palette
  spice: '🌶\uFE0E', // hot pepper
  gold: '🪙\uFE0E', // coin
}

export const MARK_FONT = "'DejaVu Sans','Segoe UI Symbol','Noto Sans Symbols',sans-serif"

// Data-URI for a CSS mask built from the emoji glyph. Masking extracts the
// glyph's alpha channel, so the mark renders as a single-color silhouette in
// whatever color we paint behind it — guaranteed monochrome on every platform,
// even where the emoji would normally render in full color.
export function markMaskDataUri(mark: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text x='12' y='19' font-size='21' text-anchor='middle'>${mark}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// Player color schemes — selectable from Options. Commodities own the
// red/olive/green/blue/purple/amber hue families (Tol bright, wedges render
// at 33% alpha), so player schemes live in cyan/pink/yellow + neutrals.
// Verified with Machado et al. 2009 CVD simulation against the BLENDED wedge
// colors (player-involving min dE): bright 3.8 (gray on pale dye wedge —
// its tradeoff for a strong monochrome ladder), vibrant 10.3, okabe 8.0,
// ibm 13.1 (but zero luminance spread — poor for monochrome), grayscale
// (monochrome by construction — hue-CVD irrelevant, shapes carry identity).
export const PLAYER_SCHEMES: Record<string, { name: string; colors: string[] }> = {
  bright: {
    name: 'Bright',
    colors: ['#00b4d8', '#ff5c8a', '#ffd84d', '#ffffff', '#a8b0b8', '#2a2a2a'],
  },
  vibrant: {
    name: 'Vibrant',
    colors: ['#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988'],
  },
  okabe: {
    name: 'Okabe-Ito',
    colors: ['#56B4E9', '#D55E00', '#009E73', '#F0E442', '#CC79A7', '#000000'],
  },
  ibm: {
    name: 'IBM',
    colors: ['#648FFF', '#785EF0', '#DC267F', '#FE6100', '#FFB000', '#1BE0E0'],
  },
  gray: {
    name: 'Grayscale',
    colors: ['#ffffff', '#d5d5d5', '#a8a8a8', '#7a7a7a', '#4c4c4c', '#1e1e1e'],
  },
}

export const PLAYER_COLORS = PLAYER_SCHEMES.bright.colors

export const PLAYER_SYMBOLS = ['●', '■', '▲', '◆', '✕', '◉']

// Optical size factors per shape — tuned empirically: rendered the six
// shapes in headless Chromium, measured ink bounding boxes with PIL, and
// iterated until extents were tight (32-36 units plain, 38-40 with the
// outline). The circle gets extra extent to offset its lower mass; the
// square gets less.
const SYMBOL_FACTORS: Record<string, number> = {
  '●': 1.2,
  '■': 1.1,
  '▲': 1.17,
  '◆': 1.25,
  '✕': 1.0,
  '◉': 1.17,
}

// True when a fill is light enough to need a dark glyph/stroke on top.
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55
}

export const BONUS_BY_LEVEL: Record<number, number> = { 5: 5, 6: 10, 7: 20 }

function ShapePiece({
  symbol,
  color,
  size,
  stroke,
  strokeWidth,
}: {
  symbol: string
  color: string
  size: number
  stroke: string
  strokeWidth: number
}) {
  const h = (size / 2) * (SYMBOL_FACTORS[symbol] ?? 1)
  const common = { fill: color, stroke, strokeWidth, strokeLinejoin: 'round' as const }
  switch (symbol) {
    case '●':
      return <circle r={h} {...common} />
    case '■':
      return <rect x={-h} y={-h} width={h * 2} height={h * 2} rx={h * 0.16} {...common} />
    case '▲':
      return <polygon points={`0,${-h} ${h},${h} ${-h},${h}`} {...common} />
    case '◆':
      return <polygon points={`0,${-h} ${h},0 0,${h} ${-h},0`} {...common} />
    case '✕': {
      // short thick arms — a diagonal cross reads sqrt(2)x larger than a
      // straight bar of the same length, so keep it compact
      const w = h * 1.1
      const L = h * 1.15
      return (
        <polygon
          points={`${-w / 2},${-L} ${w / 2},${-L} ${L},${-w / 2} ${L},${w / 2} ${w / 2},${L} ${-w / 2},${L} ${-L},${w / 2} ${-L},${-w / 2}`}
          {...common}
        />
      )
    }
    case '◉': {
      const inner = h * 0.6
      const d = `M ${-h},0 A ${h},${h} 0 1 0 ${h},0 A ${h},${h} 0 1 0 ${-h},0 Z M ${-inner},0 A ${inner},${inner} 0 1 1 ${inner},0 A ${inner},${inner} 0 1 1 ${-inner},0 Z`
      return <path d={d} fillRule="evenodd" {...common} />
    }
    default:
      return <circle r={h} {...common} />
  }
}

interface BoardProps {
  game: ClientGame
  outline?: boolean
  piecesAsSymbols?: boolean
}

export function Board({ game, outline = true, piecesAsSymbols = false }: BoardProps) {
  const playerOrder = game.playerOrder
  const scheme = useStore((s) => PLAYER_SCHEMES[s.playerScheme]?.colors ?? PLAYER_SCHEMES.bright.colors)

  return (
    <svg viewBox="0 0 1000 1000" className="board-svg" role="img" aria-label="Medici game board">
      {/* board background */}
      <rect x="8" y="8" width="984" height="984" rx="40" fill="#f0e6cf" stroke="#8a6d3b" strokeWidth="6" />
      <rect x="22" y="22" width="956" height="956" rx="32" fill="#e9dcbb" stroke="#b89a5f" strokeWidth="2" />

      {/* five commodity tracks */}
      {COMMODITIES.map((commodity, i) => (
        <CommodityTrack
          key={commodity}
          commodity={commodity}
          geom={trackGeom(i)}
          levels={game.players.map((p) => p.trackLevels[commodity])}
          playerIds={playerOrder}
          outline={outline}
          piecesAsSymbols={piecesAsSymbols}
          playerColors={scheme}
        />
      ))}

      {/* pentagonal crest — its sides are exactly the inner ends of the tracks */}
      <polygon points={pentagonPoints().map(([x, y]) => `${x},${y}`).join(' ')} fill="#f7e9c4" stroke="#8a6d3b" strokeWidth="4" />
      <polygon
        points={pentagonPoints().map(([x, y]) => {
          // inset toward center for the inner gold line
          const dx = x - CX
          const dy = y - CY
          const f = 0.85
          return `${CX + dx * f},${CY + dy * f}`
        }).join(' ')}
        fill="none"
        stroke="#b89a5f"
        strokeWidth="1.5"
      />
      {/* palle in a row across the upper half, title below (no overlap) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const [x, y] = [CX + (i - 2) * 22, CY - 52]
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={9}
            fill={COMMODITY_COLORS[COMMODITIES[i]]}
            stroke="#8a3b2a"
            strokeWidth="1.5"
          />
        )
      })}
      <text x={CX} y={CY + 36} textAnchor="middle" fontSize="17" fontFamily="Cinzel, serif" fontWeight="700" fill="#5a3a1a">
        Medici
      </text>
    </svg>
  )
}

function CommodityTrack({
  commodity,
  geom,
  levels,
  playerIds,
  outline,
  piecesAsSymbols,
  playerColors,
}: {
  commodity: Commodity
  geom: ReturnType<typeof trackGeom>
  levels: number[]
  playerIds: string[]
  outline: boolean
  piecesAsSymbols: boolean
  playerColors: string[]
}) {
  const color = COMMODITY_COLORS[commodity]
  const n = levels.length
  return (
    <g>
      {/* base gold frame (level 0) */}
      <polygon points={bandPolygon(geom, 0)} fill="#b8860b" stroke="#7a5c1a" strokeWidth="1" />
      {/* levels 1-7 */}
      {Array.from({ length: TRACK_LEVELS - 1 }, (_, L) => (
        <polygon
          key={L + 1}
          points={bandPolygon(geom, L + 1)}
          fill={`${color}55`}
          stroke={`${color}aa`}
          strokeWidth="1"
        />
      ))}
      {/* faint commodity watermark behind the wedge — masked + clipped to the
          wedge so it is always monochrome and never spills past the wedge */}
      {(() => {
        const [wx, wy] = bandMid(geom, 4)
        const maskId = `wedge-mark-${commodity}`
        const clipId = `wedge-clip-${commodity}`
        const wedgePts = `${geom.baseLeft[0]},${geom.baseLeft[1]} ${geom.baseRight[0]},${geom.baseRight[1]} ${geom.innerRight[0]},${geom.innerRight[1]} ${geom.innerLeft[0]},${geom.innerLeft[1]}`
        return (
          <g pointerEvents="none">
            <clipPath id={clipId}>
              <polygon points={wedgePts} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={wx - 160} y={wy - 160} width={320} height={320}>
                <rect x={wx - 160} y={wy - 160} width={320} height={320} fill="#000" />
                <text
                  x={wx}
                  y={wy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="150"
                  fontFamily={MARK_FONT}
                  fill="#fff"
                >
                  {COMMODITY_MARKS[commodity]}
                </text>
              </mask>
              <rect x={wx - 160} y={wy - 160} width={320} height={320} fill={color} opacity="0.14" mask={`url(#${maskId})`} />
            </g>
          </g>
        )
      })()}
      {/* level boundary lines */}
      {Array.from({ length: TRACK_LEVELS - 1 }, (_, L) => {
        const t = (L + 1) / TRACK_LEVELS
        const left = trackEdge(geom, t, 'left')
        const right = trackEdge(geom, t, 'right')
        return (
          <line
            key={L}
            x1={left[0]}
            y1={left[1]}
            x2={right[0]}
            y2={right[1]}
            stroke={L === 0 ? '#7a5c1a' : `${color}88`}
            strokeWidth="1.5"
          />
        )
      })}
      {/* bonus labels on levels 5, 6, 7 */}
      {[5, 6, 7].map((L) => {
        const [x, y] = bandMid(geom, L)
        const bonus = BONUS_BY_LEVEL[L]
        return (
          <g key={L}>
            <circle cx={x} cy={y} r="11" fill="#fff" stroke="#5a3a1a" strokeWidth="1.5" opacity="0.92" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#5a3a1a">
              {bonus}
            </text>
          </g>
        )
      })}
      {/* counters — color + symbol + white halo so identity survives color vision deficiency */}
      {playerIds.map((id, j) => {
        const L = levels[j] ?? 0
        const [x, y] = bandPoint(geom, L, bandFraction(j, n))
        const color = playerColors[j % playerColors.length]
        const symbol = PLAYER_SYMBOLS[j % PLAYER_SYMBOLS.length]
        const lightFill = isLightColor(color)
        if (piecesAsSymbols) {
          // Draw the piece as an exact SVG shape instead of a text glyph —
          // every shape spans the same bounding box and centers perfectly,
          // with no font-metric drift between symbols or platforms.
          const piece = (stroke: string, strokeWidth: number) => (
            <ShapePiece symbol={symbol} color={color} size={23} stroke={stroke} strokeWidth={strokeWidth} />
          )
          if (outline) {
            return (
              <g key={id} transform={`translate(${x},${y})`}>
                {piece('#3a2a10', 3.5)}
                {piece('#fff', 2.4)}
              </g>
            )
          }
          return (
            <g key={id} transform={`translate(${x},${y})`}>
              {piece('#3a2a10', 1.8)}
            </g>
          )
        }
        return (
          <g key={id}>
            {outline ? (
              <>
                <circle cx={x} cy={y} r="12" fill={color} stroke="#fff" strokeWidth="2.5" opacity="0.95" />
                <circle cx={x} cy={y} r="12" fill="none" stroke="#3a2a10" strokeWidth="1" opacity="0.55" />
              </>
            ) : (
              <circle cx={x} cy={y} r="12" fill={color} stroke="#3a2a10" strokeWidth="1.5" opacity="0.95" />
            )}
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={lightFill ? '#3a2a10' : '#fff'}
            >
              {symbol}
            </text>
          </g>
        )
      })}
      {/* commodity label — centered in the gold frame band (level 0) */}
      <text
        x={bandPoint(geom, 0, 0.5)[0]}
        y={bandPoint(geom, 0, 0.5)[1] + 2}
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill={color}
        fontFamily="Cinzel, serif"
        paintOrder="stroke"
        stroke="#fff"
        strokeWidth={3}
        strokeLinejoin="round"
      >
        {commodity.toUpperCase()}
      </text>
    </g>
  )
}
