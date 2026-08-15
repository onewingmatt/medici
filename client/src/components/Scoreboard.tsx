// Scoreboard — at-a-glance money tracker replacing the old circular
// money ring. One chip per player: color, name, florins. The active
// player (drawing or bidding) gets highlighted.
import { PLAYER_SCHEMES, PLAYER_SYMBOLS, isLightColor } from './Board'
import type { ClientGame } from '../types'
import { useStore } from '../store'

export function Scoreboard({ game, yourId }: { game: ClientGame; yourId: string | null }) {
  const playerColors = useStore((s) => PLAYER_SCHEMES[s.playerScheme]?.colors ?? PLAYER_SCHEMES.bright.colors)
  const activeId =
    game.phase === 'auction' && game.auction
      ? game.auction.bidOrder[game.auction.currentBidderIndex]
      : game.phase === 'draw'
        ? game.playerOrder[game.selectorIndex]
        : null

  const statusOf = (id: string): string | null => {
    if (id !== activeId) return null
    if (game.phase === 'auction') return 'bidding'
    if (game.phase === 'draw') return 'drawing'
    return null
  }

  return (
    <div className="scoreboard" role="list" aria-label="Scores">
      {game.playerOrder.map((id, i) => {
        const p = game.players.find((x) => x.id === id)
        if (!p) return null
        const color = playerColors[i % playerColors.length]
        const lightFill = isLightColor(color)
        const status = statusOf(id)
        const over = p.money >= 100
        return (
          <div
            key={id}
            role="listitem"
            className={`score-chip ${status ? 'is-active' : ''} ${id === yourId ? 'is-you' : ''}`}
            style={{ borderColor: color }}
          >
            <span className="score-dot" style={{ background: color, color: lightFill ? '#3a2a10' : '#fff' }}>
              {PLAYER_SYMBOLS[i % PLAYER_SYMBOLS.length]}
            </span>
            <span className="score-name">
              {p.name}
              {id === yourId ? ' (you)' : ''}
            </span>
            {status && <span className="score-status">{status}</span>}
            <span className="score-money">
              {over && <small>+100 </small>}
              {over ? p.money - 100 : p.money}
            </span>
          </div>
        )
      })}
    </div>
  )
}
