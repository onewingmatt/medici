// Medici engine — pure functions, no side effects, no I/O.
// Deterministic given an injected RNG. All actions return new state (immutable).
//
// State machine: createGame → DAY (draw → auction → resolve → next selector)
//   → 'scoring' (Phase 2 fills scoreDay) → startNextDay (×3) → game_over (Phase 2).
import {
  CARDS_PER_DAY,
  DAYS,
  MAX_DRAW,
  MIN_BID,
  SHIP_CAPACITY,
  SHIP_CAPACITY_2P,
  startingMoney,
} from './constants'
import { buildDeck, shuffle, type RNG } from './deck'
import type {
  ActionResult,
  AuctionState,
  GameState,
  PlayerSeed,
  PlayerState,
} from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function shipCapacityOf(state: GameState): number {
  return state.playerOrder.length === 2 ? SHIP_CAPACITY_2P : SHIP_CAPACITY
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      ship: p.ship.slice(),
      trackLevels: { ...p.trackLevels },
    })),
    deck: state.deck.slice(),
    removed: state.removed.slice(),
    discarded: state.discarded.slice(),
    group: state.group.slice(),
    history: state.history.slice(),
    scoringLog: state.scoringLog ? state.scoringLog.slice() : [],
    auction: state.auction
      ? {
          ...state.auction,
          group: state.auction.group.slice(),
          bidOrder: state.auction.bidOrder.slice(),
        }
      : null,
  }
}

function player(state: GameState, id: string): PlayerState {
  const p = state.players.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown player ${id}`)
  return p
}

function err(error: string): ActionResult {
  return { ok: false, error }
}

// Presentation rule: at least one OTHER connected player must be able to bid
// for a group of `size` (have room AND at least 1 florin). The selector may
// present a group larger than their own remaining space, but not one that
// nobody else can bid on. (Interpretation flagged in RULES-AUDIT.)
function canOtherBidFor(state: GameState, size: number, selectorId: string): boolean {
  const cap = shipCapacityOf(state)
  return state.players.some(
    (p) =>
      p.id !== selectorId &&
      !p.disconnected &&
      p.ship.length + size <= cap &&
      p.money >= MIN_BID,
  )
}

function isSelectable(state: GameState, p: PlayerState): boolean {
  return p.ship.length < shipCapacityOf(state) && !p.disconnected
}

// Clockwise from the player left of the selector; selector always last.
function buildBidOrder(state: GameState, selectorId: string): string[] {
  const n = state.players.length
  const startIdx = state.playerOrder.indexOf(selectorId)
  const order: string[] = []
  for (let step = 1; step < n; step++) {
    const idx = (startIdx + step) % n
    const p = player(state, state.playerOrder[idx])
    if (isSelectable(state, p)) order.push(p.id)
  }
  order.push(selectorId)
  return order
}

function nextSelectableIndex(state: GameState): number | null {
  const n = state.players.length
  for (let step = 1; step <= n; step++) {
    const idx = (state.selectorIndex + step) % n
    if (isSelectable(state, player(state, state.playerOrder[idx]))) return idx
  }
  return null
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function pickStartPlayer(state: GameState, rng: RNG): number {
  if (state.day === 1) {
    return Math.floor(rng() * state.players.length)
  }
  const minMoney = Math.min(...state.players.map((p) => p.money))
  const tied = state.players.filter((p) => p.money === minMoney)
  const pick = tied[Math.floor(rng() * tied.length)]
  return state.playerOrder.indexOf(pick.id)
}

function setupDay(state: GameState, rng: RNG): GameState {
  const all = shuffle(buildDeck(), rng)
  const inPlay = CARDS_PER_DAY[state.players.length]
  const deck = all.slice(0, inPlay)
  const removed = all.slice(inPlay)
  const startIdx = pickStartPlayer(state, rng)
  return {
    ...state,
    phase: 'draw',
    // Ships are per-day: everyone starts each day with empty holds.
    players: state.players.map((p) => ({ ...p, ship: [] })),
    deck,
    removed,
    discarded: [],
    group: [],
    selectorIndex: startIdx,
    auction: null,
    dayEnded: false,
    history: [
      ...state.history,
      {
        type: 'day_start',
        day: state.day,
        startPlayerId: state.playerOrder[startIdx],
        deckCount: deck.length,
      },
    ],
  }
}

export function createGame(seeds: PlayerSeed[], rng: RNG): GameState {
  const count = seeds.length
  if (count < 2 || count > 6) {
    throw new Error(`Medici requires 2-6 players, got ${count}`)
  }
  const players: PlayerState[] = seeds.map((s) => ({
    id: s.id,
    name: s.name,
    money: startingMoney(count),
    ship: [],
    trackLevels: { cloth: 0, fur: 0, grain: 0, dye: 0, spice: 0 },
    disconnected: false,
    isBot: false,
  }))
  const base: GameState = {
    day: 1,
    phase: 'draw',
    players,
    playerOrder: seeds.map((s) => s.id),
    deck: [],
    removed: [],
    discarded: [],
    group: [],
    selectorIndex: 0,
    auction: null,
    dayEnded: false,
    history: [],
    scoringLog: [],
  }
  return setupDay(base, rng)
}

export function startNextDay(state: GameState, rng: RNG): GameState {
  if (state.phase !== 'scoring') {
    throw new Error('startNextDay requires the scoring phase')
  }
  if (state.day >= DAYS) {
    throw new Error('Cannot start a day after day 3')
  }
  const next = { ...state, day: (state.day + 1) as 1 | 2 | 3 }
  return setupDay(next, rng)
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

export function currentSelector(state: GameState): PlayerState | undefined {
  return player(state, state.playerOrder[state.selectorIndex])
}

// Can the active selector legally draw another card right now?
export function canDrawMore(state: GameState): boolean {
  if (state.phase !== 'draw') return false
  const sel = currentSelector(state)
  if (!sel) return false
  if (state.group.length >= MAX_DRAW) return false
  if (state.deck.length === 0) return false
  return canOtherBidFor(state, state.group.length + 1, sel.id)
}

export function drawCard(state: GameState, playerId: string): ActionResult {
  const s = cloneState(state)
  if (s.phase !== 'draw') return err('Not in draw phase')
  if (s.playerOrder[s.selectorIndex] !== playerId) return err('Not your turn to draw')
  const sel = player(s, playerId)
  if (!isSelectable(s, sel)) return err('Your ship is full — you are out of the auction')
  if (s.group.length >= MAX_DRAW) return err('Cannot draw more than 3 cards')
  if (s.deck.length === 0) return err('Deck is empty')
  const nextSize = s.group.length + 1
  if (!canOtherBidFor(s, nextSize, playerId)) {
    // If even a 1-card group cannot be auctioned, no auction can ever occur:
    // the day cannot continue. (Edge case, flagged in RULES-AUDIT.)
    if (s.group.length === 0) return endDay(s, 'stalled')
    return err(`No other player can bid on a group of ${nextSize} — stop drawing`)
  }
  const card = s.deck[0]
  s.deck = s.deck.slice(1)
  s.group = [...s.group, card]
  s.history.push({ type: 'draw', playerId, card, groupSize: s.group.length })
  return { ok: true, state: s }
}

export function stopDraw(state: GameState, playerId: string): ActionResult {
  const s = cloneState(state)
  if (s.phase !== 'draw') return err('Not in draw phase')
  if (s.playerOrder[s.selectorIndex] !== playerId) return err('Not your turn to draw')
  const sel = player(s, playerId)
  if (!isSelectable(s, sel)) return err('Your ship is full — you are out of the auction')
  if (s.group.length < 1) return err('Must draw at least one card')
  if (!canOtherBidFor(s, s.group.length, playerId)) {
    return err('No other player can bid for this group')
  }
  const auction: AuctionState = {
    group: s.group,
    selectorId: playerId,
    bidOrder: buildBidOrder(s, playerId),
    currentBidderIndex: 0,
    highBid: 0,
    highBidderId: null,
    status: 'open',
  }
  s.auction = auction
  s.group = []
  s.phase = 'auction'
  s.history.push({
    type: 'auction_start',
    selectorId: playerId,
    group: auction.group,
    bidOrder: auction.bidOrder,
  })
  return { ok: true, state: s }
}

export function currentBidderId(state: GameState): string | null {
  const a = state.auction
  if (!a || a.status !== 'open') return null
  return a.bidOrder[a.currentBidderIndex] ?? null
}

export function bid(state: GameState, playerId: string, amount: number): ActionResult {
  const s = cloneState(state)
  if (s.phase !== 'auction' || !s.auction || s.auction.status !== 'open') {
    return err('No open auction')
  }
  const a = s.auction
  if (a.bidOrder[a.currentBidderIndex] !== playerId) return err('Not your turn to bid')
  if (!Number.isInteger(amount) || amount < MIN_BID) return err('Minimum bid is 1')
  if (amount <= a.highBid) {
    return err(`Bid must exceed the current high bid of ${a.highBid}`)
  }
  const p = player(s, playerId)
  if (amount > p.money) return err(`You only have ${p.money} florins`)
  if (p.ship.length + a.group.length > shipCapacityOf(s)) {
    return err('Group does not fit on your ship')
  }
  a.highBid = amount
  a.highBidderId = playerId
  s.history.push({ type: 'bid', playerId, amount })
  return advanceAuction(s)
}

export function pass(state: GameState, playerId: string): ActionResult {
  const s = cloneState(state)
  if (s.phase !== 'auction' || !s.auction || s.auction.status !== 'open') {
    return err('No open auction')
  }
  const a = s.auction
  if (a.bidOrder[a.currentBidderIndex] !== playerId) return err('Not your turn to bid')
  s.history.push({ type: 'pass', playerId })
  return advanceAuction(s)
}

// ---------------------------------------------------------------------------
// Auction resolution & day flow
// ---------------------------------------------------------------------------

function advanceAuction(s: GameState): ActionResult {
  const a = s.auction!
  a.currentBidderIndex += 1
  if (a.currentBidderIndex >= a.bidOrder.length) {
    a.status = 'resolved'
    return resolveAuction(s)
  }
  return { ok: true, state: s }
}

function resolveAuction(s: GameState): ActionResult {
  const a = s.auction!
  if (a.highBidderId) {
    const buyer = player(s, a.highBidderId)
    buyer.ship = [...buyer.ship, ...a.group]
    buyer.money -= a.highBid
    s.history.push({ type: 'sold', buyerId: buyer.id, amount: a.highBid, group: a.group })
  } else {
    s.discarded = [...s.discarded, ...a.group]
    s.history.push({ type: 'discarded', group: a.group })
  }
  s.auction = null
  s.phase = 'draw'
  return checkDayEnd(s)
}

function checkDayEnd(s: GameState): ActionResult {
  if (s.deck.length === 0) return endDay(s, 'deck_empty')
  const cap = shipCapacityOf(s)
  const roomy = s.players.filter((p) => p.ship.length < cap)
  if (roomy.length === 0) return endDay(s, 'ships_full')
  if (roomy.length === 1) return freeFill(s, roomy[0])
  const next = nextSelectableIndex(s)
  if (next === null) return endDay(s, 'stalled')
  s.selectorIndex = next
  return { ok: true, state: s }
}

// The last player with room fills their ship free from the top of the deck,
// no choices; sails with empty holds if the deck is short.
function freeFill(s: GameState, last: PlayerState): ActionResult {
  const spaces = shipCapacityOf(s) - last.ship.length
  const take = Math.min(spaces, s.deck.length)
  const cards = s.deck.slice(0, take)
  s.deck = s.deck.slice(take)
  last.ship = [...last.ship, ...cards]
  s.history.push({
    type: 'free_fill',
    playerId: last.id,
    cards,
    deckEmpty: s.deck.length === 0,
  })
  return endDay(s, 'ships_full')
}

export function endDay(s: GameState, reason: 'deck_empty' | 'ships_full' | 'stalled'): ActionResult {
  s.phase = 'scoring'
  s.dayEnded = true
  s.history.push({ type: 'day_end', day: s.day, reason })
  return { ok: true, state: s }
}
