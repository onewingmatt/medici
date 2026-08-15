// Player ship mat — vertical cargo column (5 slots; 7 in 2-player games),
// parchment + ocean styling like the physical mats.
import { COMMODITY_COLORS, PLAYER_COLORS } from './Board'
import type { Commodity } from '../../../shared/constants'
import type { Card } from '../../../shared/types'
import type { ClientGame } from '../types'

const COMMODITY_INITIAL: Record<string, string> = {
  cloth: 'C',
  fur: 'F',
  grain: 'G',
  dye: 'D',
  spice: 'S',
  gold: 'Au',
}

function CardFace({ card }: { card: Card }) {
  const color = card.commodity === 'gold' ? '#d4a017' : COMMODITY_COLORS[card.commodity as Commodity]
  return (
    <div className="card-face" style={{ borderColor: color }}>
      <div className="card-value" style={{ background: color }}>
        {card.value}
      </div>
      <div className="card-commodity">{COMMODITY_INITIAL[card.commodity]}</div>
    </div>
  )
}

interface ShipMatProps {
  game: ClientGame
  playerId: string
  name: string
  isBot: boolean
  disconnected: boolean
  isYou: boolean
}

export function ShipMat({ game, playerId, name, isBot, disconnected, isYou }: ShipMatProps) {
  const player = game.players.find((p) => p.id === playerId)
  if (!player) return null
  const capacity = game.playerOrder.length === 2 ? 7 : 5
  const color = PLAYER_COLORS[game.playerOrder.indexOf(playerId) % PLAYER_COLORS.length]
  const over100 = player.money >= 100

  return (
    <div className={`ship-mat ${isYou ? 'is-you' : ''} ${disconnected ? 'is-away' : ''}`} style={{ borderColor: color }}>
      <div className="ship-mat-header" style={{ background: color }}>
        <span className="ship-mat-name">
          {name}
          {isBot ? ' (bot)' : ''}
        </span>
        <span className="ship-mat-money">
          {over100 && <small>+100</small>}
          {player.money}
        </span>
      </div>
      <div className="ship-mat-slots">
        {Array.from({ length: capacity }, (_, i) => {
          const card = player.ship[i]
          return (
            <div key={i} className={`cargo-slot ${card ? 'filled' : ''}`}>
              {card ? <CardFace card={card} /> : <div className="cargo-empty" />}
            </div>
          )
        })}
      </div>
      <div className="ship-mat-footer">
        <div className="ship-tracks">
          {(Object.keys(player.trackLevels) as Commodity[]).map((c) => (
            <span
              key={c}
              className="track-pip"
              title={`${c}: ${player.trackLevels[c]}`}
              style={{ background: COMMODITY_COLORS[c] }}
            >
              {player.trackLevels[c]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
