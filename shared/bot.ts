// Bot AI — pure decision functions. Difficulty tiers:
//   easy:   near-random around card value
//   medium: value heuristic with variance
//   hard:   lot intrinsic value + track majority upside + ship-space scarcity + deny premium
// All decisions are legal-safe: the engine validates anyway, but bots check
// capacity, money, and turn before choosing.
import {
  MAX_DRAW,
  MIN_BID,
  TRACK_BONUS_BY_LEVEL,
  TRACK_LEVELS,
} from './constants'
import type { Commodity } from './constants'
import type { RNG } from './deck'
import { currentBidderId, currentSelector, shipCapacityOf } from './engine'
import type { Card, Difficulty, GameState, PlayerState } from './types'

const TOTAL_DECK_VALUE = 110 // 5 × (0+1+2+3+4+5+5) + 10
const DECK_SIZE = 36

export type BotAction =
  | { kind: 'draw' }
  | { kind: 'stop' }
  | { kind: 'bid'; amount: number }
  | { kind: 'pass' }

function player(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown player ${id}`)
  return p
}

// All cards visible so far this day (drawn, sold, discarded, free-filled, current group).
function seenCards(state: GameState): Card[] {
  const seen: Card[] = []
  for (const e of state.history) {
    if (e.type === 'draw') seen.push(e.card)
    else if (e.type === 'sold') seen.push(...e.group)
    else if (e.type === 'discarded') seen.push(...e.group)
    else if (e.type === 'free_fill') seen.push(...e.cards)
  }
  seen.push(...state.group)
  if (state.auction) seen.push(...state.auction.group)
  return seen
}

// Expected value of the next card drawn, from known information only.
export function expectedNextCardValue(state: GameState): number {
  const seen = seenCards(state)
  const seenValue = seen.reduce((s, c) => s + c.value, 0)
  const unseen = DECK_SIZE - seen.length
  if (unseen <= 0) return 0
  return (TOTAL_DECK_VALUE - seenValue) / unseen
}

// Track upside of buying `group`: bonus-level delta + majority award expectation.
function trackUpside(state: GameState, me: PlayerState, group: Card[]): number {
  let upside = 0
  const commodities = new Set<Commodity>()
  for (const c of group) {
    const cc = c.commodity
    if (cc === 'gold' || commodities.has(cc)) continue
    commodities.add(cc)
    const countInGroup = group.filter((x) => x.commodity === cc).length
    const oldLevel = me.trackLevels[cc]
    const newLevel = Math.min(TRACK_LEVELS - 1, oldLevel + countInGroup)
    const bonusDelta =
      (TRACK_BONUS_BY_LEVEL[newLevel] ?? 0) - (TRACK_BONUS_BY_LEVEL[oldLevel] ?? 0)
    upside += bonusDelta
    const maxOpp = Math.max(
      ...state.players.filter((p) => p.id !== me.id).map((p) => p.trackLevels[cc]),
    )
    if (newLevel >= maxOpp) upside += 3 // majority award expectation (uncertain — discounted)
    else if (newLevel + 1 >= maxOpp) upside += 1 // close to the lead
  }
  return upside
}

export function lotValue(state: GameState, playerId: string, group: Card[]): number {
  const me = player(state, playerId)
  const valueSum = group.reduce((s, c) => s + c.value, 0)
  return valueSum + trackUpside(state, me, group)
}

function groupFor(state: GameState): Card[] {
  if (state.auction && state.auction.status === 'open') return state.auction.group
  return state.group
}

function fitsShip(state: GameState, me: PlayerState, group: Card[]): boolean {
  return me.ship.length + group.length <= shipCapacityOf(state)
}

// ---------------------------------------------------------------------------
// Auction decision
// ---------------------------------------------------------------------------

// Increment bidding: in this game each player bids exactly once, in order.
// Bidding just above the current high (up to your limit) preserves money
// (money IS points) while still contesting lots you value. Early bidders
// probe cheap; the selector's last-bid advantage is preserved.
function bidIncrement(limit: number, highBid: number): number | null {
  if (limit <= highBid) return null
  return Math.max(highBid + 1, MIN_BID)
}

export function chooseBid(
  state: GameState,
  playerId: string,
  difficulty: Difficulty,
  rng: RNG,
): number | null {
  const me = player(state, playerId)
  const auction = state.auction
  if (!auction || auction.status !== 'open') return null
  const group = auction.group
  if (!fitsShip(state, me, group)) return null
  const highBid = auction.highBid

  if (difficulty === 'easy') {
    // Novice: noisy limit around card value; sometimes overpays, sometimes
    // lets good lots go.
    const value = group.reduce((s, c) => s + c.value, 0)
    const limit = Math.floor(value * (0.7 + rng() * 0.7))
    return bidIncrement(limit, highBid)
  }

  const myValue = lotValue(state, playerId, group)
  if (difficulty === 'medium') {
    const limit = Math.floor(myValue * (0.9 + rng() * 0.1))
    return bidIncrement(limit, highBid)
  }

  // hard: near-value limit with a small deny premium. Money IS points, so
  // overpaying to deny only pays when the denied gain is large.
  const oppValues = state.players
    .filter((p) => p.id !== playerId && fitsShip(state, p, group))
    .map((p) => lotValue(state, p.id, group))
  const maxOpp = oppValues.length ? Math.max(...oppValues) : 0
  const denyGap = Math.max(0, maxOpp - myValue)
  const deny = denyGap > 4 ? Math.min(3, Math.floor(denyGap * 0.15)) : 0
  // ship-space scarcity: a nearly-full ship makes every slot count — slight discount
  const spaces = shipCapacityOf(state) - me.ship.length
  const scarcity = spaces <= group.length ? 0 : Math.min(2, spaces - group.length)
  const limit = Math.max(0, Math.floor(myValue) - 1 + deny - Math.floor(scarcity * 0.5))
  return bidIncrement(limit, highBid)
}

// ---------------------------------------------------------------------------
// Draw decision (selector)
// ---------------------------------------------------------------------------

export function chooseDraw(
  state: GameState,
  playerId: string,
  difficulty: Difficulty,
  rng: RNG,
): 'draw' | 'stop' {
  const me = player(state, playerId)
  if (state.phase !== 'draw') return 'stop'
  if (state.group.length >= MAX_DRAW) return 'stop'
  if (state.deck.length === 0) return 'stop'
  if (me.ship.length + state.group.length + 1 > shipCapacityOf(state)) return 'stop'
  // A selector must always draw at least one card.
  if (state.group.length === 0) return 'draw'

  const expected = expectedNextCardValue(state)
  if (difficulty === 'easy') {
    return rng() < Math.min(0.85, expected / 5) ? 'draw' : 'stop'
  }
  const threshold = difficulty === 'medium' ? 2.5 : 2.3
  if (expected < threshold) return 'stop'
  // Don't keep drawing if the group is already valuable to us — risk of pricing ourselves out.
  const current = lotValue(state, playerId, groupFor(state))
  if (current >= 8 && difficulty === 'medium') return 'stop'
  return 'draw'
}

// ---------------------------------------------------------------------------
// Dispatch — what should this bot do right now?
// ---------------------------------------------------------------------------

export function botAction(
  state: GameState,
  playerId: string,
  difficulty: Difficulty,
  rng: RNG,
): BotAction {
  if (state.phase === 'draw' && currentSelector(state)?.id === playerId) {
    return chooseDraw(state, playerId, difficulty, rng) === 'draw'
      ? { kind: 'draw' }
      : { kind: 'stop' }
  }
  if (state.phase === 'auction' && currentBidderId(state) === playerId) {
    const amount = chooseBid(state, playerId, difficulty, rng)
    return amount === null ? { kind: 'pass' } : { kind: 'bid', amount }
  }
  // Not this bot's turn — caller should not have scheduled us.
  throw new Error(`botAction called for ${playerId} but it is not their turn`)
}

// Highest-level check the scheduler uses before scheduling a bot.
export function isBotsTurn(state: GameState, playerId: string): boolean {
  if (state.phase === 'draw') return currentSelector(state)?.id === playerId
  if (state.phase === 'auction') return currentBidderId(state) === playerId
  return false
}
