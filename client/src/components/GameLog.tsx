// Round log — human-readable feed of engine events: draws, bids, sales,
// discards, free fills, day boundaries. Auto-follows the newest entry.
// Collapsible so small screens can give the space to the ship mats.
import { useEffect, useRef, useState } from 'react'
import type { Card } from '../../../shared/types'
import type { ClientGame } from '../types'

const COMMODITY_NAME: Record<string, string> = {
  cloth: 'Cloth',
  fur: 'Fur',
  grain: 'Grain',
  dye: 'Dye',
  spice: 'Spice',
  gold: 'Gold',
}

function cardsText(cards: Card[]): string {
  return cards.map((c) => `${c.commodity === 'gold' ? 'Au' : COMMODITY_NAME[c.commodity]?.slice(0, 1)}${c.value}`).join(' ')
}

function timeOf(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function GameLog({ game }: { game: ClientGame }) {
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id
  const logRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('medici:logCollapsed') === '1')
  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('medici:logCollapsed', next ? '1' : '0')
  }

  useEffect(() => {
    if (collapsed) return
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [game.history.length, collapsed])

  const lines: { key: string; text: string; kind: string; time?: string }[] = []
  const stamp = (ts?: number) => (ts ? timeOf(ts) : undefined)
  for (const ev of game.history) {
    switch (ev.type) {
      case 'day_start':
        lines.push({
          key: `${lines.length}-ds`,
          text: `— Day ${ev.day} · ${nameOf(ev.startPlayerId)} draws first —`,
          kind: 'day',
          time: stamp(ev.ts),
        })
        break
      case 'draw':
        lines.push({
          key: `${lines.length}-d`,
          text: `${nameOf(ev.playerId)} draws ${cardsText([ev.card])} (${ev.groupSize}/3)`,
          kind: 'draw',
          time: stamp(ev.ts),
        })
        break
      case 'auction_start':
        lines.push({
          key: `${lines.length}-as`,
          text: `Auction: ${cardsText(ev.group)}`,
          kind: 'auction',
          time: stamp(ev.ts),
        })
        break
      case 'bid':
        lines.push({
          key: `${lines.length}-b`,
          text: `${nameOf(ev.playerId)} bids ${ev.amount}`,
          kind: 'bid',
          time: stamp(ev.ts),
        })
        break
      case 'pass':
        lines.push({
          key: `${lines.length}-p`,
          text: `${nameOf(ev.playerId)} passes`,
          kind: 'pass',
          time: stamp(ev.ts),
        })
        break
      case 'sold':
        lines.push({
          key: `${lines.length}-s`,
          text: `${nameOf(ev.buyerId)} wins ${cardsText(ev.group)} for ${ev.amount}`,
          kind: 'sold',
          time: stamp(ev.ts),
        })
        break
      case 'discarded':
        lines.push({
          key: `${lines.length}-x`,
          text: `Lot discarded: ${cardsText(ev.group)}`,
          kind: 'discard',
          time: stamp(ev.ts),
        })
        break
      case 'free_fill':
        lines.push({
          key: `${lines.length}-f`,
          text: `${nameOf(ev.playerId)} takes ${ev.cards.length} free card${ev.cards.length === 1 ? '' : 's'}${ev.deckEmpty ? ' (deck empty)' : ''}`,
          kind: 'free',
          time: stamp(ev.ts),
        })
        break
      case 'day_end':
        lines.push({
          key: `${lines.length}-de`,
          text: `Day ${ev.day} ends — ${ev.reason === 'deck_empty' ? 'deck empty' : ev.reason === 'ships_full' ? 'ships full' : 'no bids left'}`,
          kind: 'day',
          time: stamp(ev.ts),
        })
        break
      case 'game_over':
        lines.push({
          key: `${lines.length}-go`,
          text: `Game over — ${ev.winnerIds.map(nameOf).join(', ')} win${ev.winnerIds.length > 1 ? '' : 's'}`,
          kind: 'day',
          time: stamp(ev.ts),
        })
        break
    }
  }

  const titleRow = (
    <div className="game-log-title-row">
      <span className="game-log-title">Round log</span>
      <button
        className="game-log-toggle"
        onClick={toggleCollapsed}
        title={collapsed ? 'Show the round log' : 'Hide the round log to give the ships room'}
      >
        {collapsed ? 'Show' : 'Hide'}
      </button>
    </div>
  )

  if (lines.length === 0) {
    return (
      <div className={`game-log ${collapsed ? 'collapsed' : ''}`}>
        {titleRow}
        {!collapsed && <div className="game-log-empty">No actions yet</div>}
      </div>
    )
  }

  return (
    <div className={`game-log ${collapsed ? 'collapsed' : ''}`}>
      {titleRow}
      {!collapsed && (
        <div className="game-log-scroll" ref={logRef}>
          {lines.map((l) => (
            <div key={l.key} className={`log-line log-${l.kind}`}>
              {l.time && <span className="log-time">{l.time}</span>}
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
