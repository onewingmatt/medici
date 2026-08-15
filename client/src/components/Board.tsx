// The Medici board — SVG recreation of the physical layout:
// money track ring (0-99), five triangular commodity tracks with bonus
// levels (5/10/20), golden crest with the Medici palle, day counters.
import { COMMODITIES } from '../../../shared/constants'
import type { Commodity } from '../../../shared/constants'
import type { ClientGame } from '../types'
import {
  CX,
  CY,
  CREST_RADIUS,
  MONEY_RADIUS,
  COUNTER_RADIUS,
  TRACK_LEVELS,
  bandFraction,
  bandMid,
  bandPoint,
  bandPolygon,
  moneyAngle,
  pt,
  trackEdge,
  trackGeom,
} from '../boardGeometry'

// Commodity colors (Grail/Steamforged palette): red cloth, amber fur,
// green grain, blue dye, purple spice.
export const COMMODITY_COLORS: Record<Commodity, string> = {
  cloth: '#c0392b',
  fur: '#c8860a',
  grain: '#4f8a3d',
  dye: '#2f6db3',
  spice: '#7d4a9e',
}

export const PLAYER_COLORS = [
  '#e6194b', // red
  '#3b75c4', // blue
  '#1f9e4d', // green
  '#e6a700', // gold
  '#8e44ad', // purple
  '#e07020', // orange
]

export const BONUS_BY_LEVEL: Record<number, number> = { 5: 5, 6: 10, 7: 20 }

interface BoardProps {
  game: ClientGame
}

export function Board({ game }: BoardProps) {
  const playerOrder = game.playerOrder
  const colorOf = (id: string) => PLAYER_COLORS[playerOrder.indexOf(id) % PLAYER_COLORS.length]

  return (
    <svg viewBox="0 0 1000 1000" className="board-svg" role="img" aria-label="Medici game board">
      {/* board background */}
      <rect x="8" y="8" width="984" height="984" rx="40" fill="#f0e6cf" stroke="#8a6d3b" strokeWidth="6" />
      <rect x="22" y="22" width="956" height="956" rx="32" fill="#e9dcbb" stroke="#b89a5f" strokeWidth="2" />

      {/* money track numbers 0-99 */}
      {Array.from({ length: 100 }, (_, m) => {
        const [x, y] = pt(CX, CY, MONEY_RADIUS, moneyAngle(m))
        return (
          <g key={m}>
            <circle cx={x} cy={y} r={15} fill="#d9c9a0" stroke="#8a6d3b" strokeWidth="1" />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#4a3a1a">
              {m}
            </text>
          </g>
        )
      })}

      {/* five commodity tracks */}
      {COMMODITIES.map((commodity, i) => (
        <CommodityTrack
          key={commodity}
          commodity={commodity}
          geom={trackGeom(i)}
          levels={game.players.map((p) => p.trackLevels[commodity])}
          playerIds={playerOrder}
        />
      ))}

      {/* money counters (players on the ring) */}
      {game.players.map((p) => {
        const [x, y] = pt(CX, CY, COUNTER_RADIUS, moneyAngle(p.money))
        const over = p.money >= 100
        return (
          <g key={p.id}>
            <circle cx={x} cy={y} r={17} fill={colorOf(p.id)} stroke="#fff" strokeWidth="2.5" />
            <circle cx={x} cy={y} r={17} fill="none" stroke="#3a2a10" strokeWidth="1" opacity="0.6" />
            {over && (
              <text x={x} y={y - 22} textAnchor="middle" fontSize="12" fontWeight="700" fill="#7a2e0e">
                +100
              </text>
            )}
          </g>
        )
      })}

      {/* crest with the five Medici palle */}
      <circle cx={CX} cy={CY} r={CREST_RADIUS} fill="#f7e9c4" stroke="#8a6d3b" strokeWidth="5" />
      <circle cx={CX} cy={CY} r={CREST_RADIUS - 8} fill="none" stroke="#b89a5f" strokeWidth="1.5" />
      {/* palle in a row across the top of the crest, text below (no overlap) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const [x, y] = [CX + (i - 2) * 36, CY - 34]
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={16}
            fill={COMMODITY_COLORS[COMMODITIES[i]]}
            stroke="#8a3b2a"
            strokeWidth="2"
          />
        )
      })}
      <text x={CX} y={CY + 40} textAnchor="middle" fontSize="32" fontFamily="Cinzel, serif" fontWeight="700" fill="#5a3a1a">
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
}: {
  commodity: Commodity
  geom: ReturnType<typeof trackGeom>
  levels: number[]
  playerIds: string[]
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
          fill={`${color}33`}
          stroke={`${color}aa`}
          strokeWidth="1"
        />
      ))}
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
      {/* counters */}
      {playerIds.map((id, j) => {
        const L = levels[j] ?? 0
        const [x, y] = bandPoint(geom, L, bandFraction(j, n))
        return (
          <circle
            key={id}
            cx={x}
            cy={y}
            r="10"
            fill={PLAYER_COLORS[j % PLAYER_COLORS.length]}
            stroke="#fff"
            strokeWidth="2"
          />
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
