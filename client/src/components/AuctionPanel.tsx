// Auction panel — draw controls for the selector, the drawn group, and
// bid/pass controls for the current bidder.
import { useState } from 'react'
import { COMMODITY_COLORS, COMMODITY_MARKS, MARK_FONT, markMaskDataUri, PLAYER_SCHEMES } from './Board'
import type { Commodity } from '../../../shared/constants'
import type { Card } from '../../../shared/types'
import type { ClientGame } from '../types'
import { emit } from '../socket'
import { useStore } from '../store'

const COMMODITY_INITIAL: Record<string, string> = {
  cloth: 'C',
  fur: 'F',
  grain: 'G',
  dye: 'D',
  spice: 'S',
  gold: 'Au',
}

export function GroupCard({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  const color = card.commodity === 'gold' ? '#B8860B' : COMMODITY_COLORS[card.commodity as Commodity]
  return (
    <div className={`group-card ${size}`} style={{ borderColor: color }}>
      <span
        className="card-mark group-mark"
        style={
          {
            '--mark-color': color,
            '--mark-mask': markMaskDataUri(COMMODITY_MARKS[card.commodity]),
            fontFamily: MARK_FONT,
          } as React.CSSProperties
        }
      >
        {COMMODITY_MARKS[card.commodity]}
      </span>
      <div className="group-card-value" style={{ background: color }}>
        {card.value}
      </div>
      <div className="group-card-commodity" style={{ color }}>{COMMODITY_INITIAL[card.commodity]}</div>
    </div>
  )
}

export function AuctionPanel({ game, yourId }: { game: ClientGame; yourId: string | null }) {
  const [bidAmount, setBidAmount] = useState(1)
  const playerColors = useStore((s) => PLAYER_SCHEMES[s.playerScheme]?.colors ?? PLAYER_SCHEMES.bright.colors)

  if (!yourId) return null
  const me = game.players.find((p) => p.id === yourId)
  if (!me) return null

  const isSelector = game.phase === 'draw' && game.playerOrder[game.selectorIndex] === yourId
  const auction = game.auction
  const isBidder = game.phase === 'auction' && !!auction && auction.bidOrder[auction.currentBidderIndex] === yourId

  const group: Card[] = auction?.group ?? game.group
  const highBidderName = auction?.highBidderId
    ? game.players.find((p) => p.id === auction.highBidderId)?.name
    : null
  const currentBidderId = auction?.bidOrder[auction.currentBidderIndex]
  const currentBidderName = currentBidderId
    ? game.players.find((p) => p.id === currentBidderId)?.name
    : null

  const maxBid = me.money
  const minNext = (auction?.highBid ?? 0) + 1

  return (
    <div className="auction-panel">
      <div className="auction-group">
        {group.length === 0 ? (
          <div className="auction-empty">No group yet — draw cards to auction</div>
        ) : (
          group.map((c) => <GroupCard key={c.id} card={c} />)
        )}
      </div>

      <div className="auction-status">
        {game.phase === 'draw' && isSelector && (
          <div className="auction-actions">
            <button className="btn btn-primary" onClick={() => emit('game:draw')} disabled={group.length >= 3 || game.deckCount === 0}>
              Draw card ({group.length}/3)
            </button>
            <button className="btn" onClick={() => emit('game:stopDraw')} disabled={group.length === 0}>
              Auction this group
            </button>
          </div>
        )}
        {game.phase === 'draw' && !isSelector && (
          <div className="auction-wait">
            Waiting for {game.players.find((p) => p.id === game.playerOrder[game.selectorIndex])?.name} to draw…
          </div>
        )}

        {game.phase === 'auction' && (
          <>
            <div className="auction-line">
              {auction!.highBid > 0 ? (
                <>
                  High bid: <strong>{auction!.highBid}</strong> by {highBidderName}
                </>
              ) : (
                'No bids yet'
              )}
              {' · '}to bid: <strong>{currentBidderName}</strong>
            </div>
            {isBidder && (
              <div className="auction-actions">
                <div className="bid-row">
                  <input
                    type="number"
                    min={Math.min(minNext, maxBid)}
                    max={maxBid}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={bidAmount < minNext || bidAmount > maxBid || bidAmount < 1}
                    onClick={() => {
                      emit('auction:bid', { amount: bidAmount })
                      setBidAmount(Math.min(minNext, maxBid))
                    }}
                  >
                    Bid {bidAmount}
                  </button>
                  <button className="btn" onClick={() => emit('auction:pass')}>
                    Pass
                  </button>
                </div>
                <div className="bid-hint">
                  min {Math.min(minNext, maxBid)} · you have {me.money}
                </div>
              </div>
            )}
            {!isBidder && (
              <div className="auction-wait">
                Waiting for {currentBidderName}…
              </div>
            )}
          </>
        )}

        {game.phase === 'scoring' && <div className="auction-wait">Scoring the day…</div>}
        {game.phase === 'game_over' && <div className="auction-wait">Game over!</div>}
      </div>

      <div className="auction-meta">
        <span>Deck: {game.deckCount} cards</span>
        <span>Discarded: {game.discarded.length}</span>
        <span>Day {game.day}/3</span>
        <span
          className="money-indicator"
          style={{ borderColor: playerColors[game.playerOrder.indexOf(yourId) % playerColors.length] }}
        >
          {me.money >= 100 && <small>+100 </small>}
          {me.money >= 100 ? me.money - 100 : me.money} florins
        </span>
      </div>
    </div>
  )
}
