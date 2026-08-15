// Phase 1 engine tests — deck, draw, auction, loading, turn order, day end.
import { describe, it, expect } from 'vitest'
import {
  CARDS_PER_DAY,
  COMMODITIES,
  CARD_VALUES,
  DECK_SIZE,
  GOLD_VALUE,
  MAX_DRAW,
  MIN_BID,
  SHIP_CAPACITY,
  SHIP_CAPACITY_2P,
  startingMoney,
} from '../shared/constants'
import { buildDeck, shuffle } from '../shared/deck'
import {
  createGame,
  currentBidderId,
  currentSelector,
  drawCard,
  canDrawMore,
  pass,
  bid,
  startNextDay,
  stopDraw,
} from '../shared/engine'
import type { Card, GameState, PlayerState } from '../shared/types'

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function game(ids: string[] = ['a', 'b', 'c', 'd'], seed = 42): GameState {
  return createGame(
    ids.map((id) => ({ id, name: id.toUpperCase() })),
    mulberry32(seed),
  )
}

// Pin the selector to a specific player (removes seed dependence).
function forceSelector(g: GameState, id: string): GameState {
  return { ...g, selectorIndex: g.playerOrder.indexOf(id) }
}

function fillShip(g: GameState, id: string, count: number): GameState {
  const cards = buildDeck().slice(0, count)
  return {
    ...g,
    players: g.players.map((p) => (p.id === id ? { ...p, ship: cards } : p)) as PlayerState[],
  }
}

function setMoney(g: GameState, id: string, money: number): GameState {
  return {
    ...g,
    players: g.players.map((p) => (p.id === id ? { ...p, money } : p)) as PlayerState[],
  }
}

function setDisconnected(g: GameState, id: string): GameState {
  return {
    ...g,
    players: g.players.map((p) =>
      p.id === id ? { ...p, disconnected: true } : p,
    ) as PlayerState[],
  }
}

// Open the auction for `selector` (draws `drawCount` cards then stops).
function openAuction(g: GameState, selector: string, drawCount: number): GameState {
  let s = g
  for (let i = 0; i < drawCount; i++) {
    const r = drawCard(s, selector)
    if (!r.ok) throw new Error(`draw: ${r.error}`)
    s = r.state
  }
  const st = stopDraw(s, selector)
  if (!st.ok) throw new Error(`stopDraw: ${st.error}`)
  return st.state
}

// Drive an open auction to completion. responses: bidderId -> 'pass' | amount.
// Unlisted bidders pass. Expects the state to be in the auction phase.
function finishAuction(g: GameState, responses: Record<string, 'pass' | number> = {}): GameState {
  let s = g
  let guard = 0
  while (s.phase === 'auction') {
    if (guard++ > 20) throw new Error('auction did not resolve')
    const bidder = currentBidderId(s)
    if (!bidder) throw new Error('auction with no current bidder')
    const resp = responses[bidder] ?? 'pass'
    const rr = resp === 'pass' ? pass(s, bidder) : bid(s, bidder, resp)
    if (!rr.ok) throw new Error(`${bidder}: ${rr.error}`)
    s = rr.state
  }
  return s
}

// Craft an open auction state directly (for day-end edge cases).
function craftAuction(
  g: GameState,
  opts: { group?: Card[]; deck?: Card[]; bidOrder?: string[] } = {},
): GameState {
  const sel = currentSelector(g)!.id
  const group = opts.group ?? [g.deck[0]]
  return {
    ...g,
    deck: opts.deck ?? g.deck.slice(1),
    group: [],
    phase: 'auction',
    auction: {
      group,
      selectorId: sel,
      bidOrder: opts.bidOrder ?? [sel],
      currentBidderIndex: 0,
      highBid: 0,
      highBidderId: null,
      status: 'open',
    },
  }
}

// ---------------------------------------------------------------------------
describe('deck construction', () => {
  it('builds exactly 36 cards', () => {
    const deck = buildDeck()
    expect(deck.length).toBe(DECK_SIZE)
  })

  it('has 7 cards of each commodity', () => {
    const deck = buildDeck()
    for (const c of COMMODITIES) {
      expect(deck.filter((x) => x.commodity === c).length).toBe(7)
    }
  })

  it('has the correct values per commodity: 0,1,2,3,4,5,5', () => {
    const deck = buildDeck()
    for (const c of COMMODITIES) {
      const values = deck
        .filter((x) => x.commodity === c)
        .map((x) => x.value)
        .sort((a, b) => a - b)
      expect(values).toEqual([...CARD_VALUES].sort((a, b) => a - b))
    }
  })

  it('has exactly one gold card with value 10 and no commodity', () => {
    const gold = buildDeck().filter((x) => x.commodity === 'gold')
    expect(gold.length).toBe(1)
    expect(gold[0].value).toBe(GOLD_VALUE)
    expect(gold[0].commodity).toBe('gold')
  })

  it('has unique card ids', () => {
    const deck = buildDeck()
    expect(new Set(deck.map((x) => x.id)).size).toBe(deck.length)
  })

  it('shuffle is deterministic under a seeded rng and preserves the deck', () => {
    const deck = buildDeck()
    const s1 = shuffle(deck, mulberry32(7))
    const s2 = shuffle(deck, mulberry32(7))
    expect(s1.map((c) => c.id)).toEqual(s2.map((c) => c.id))
    expect(s1.length).toBe(deck.length)
    expect(new Set(s1.map((c) => c.id)).size).toBe(deck.length)
  })
})

// ---------------------------------------------------------------------------
describe('day setup', () => {
  it('deals the right cards-in-play per player count and removes the rest unseen', () => {
    for (const n of [2, 3, 4, 5, 6] as const) {
      const g = game(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, n), 1)
      expect(g.deck.length).toBe(CARDS_PER_DAY[n])
      expect(g.deck.length + g.removed.length).toBe(DECK_SIZE)
      expect(g.removed.length).toBe(DECK_SIZE - CARDS_PER_DAY[n])
    }
  })

  it('grants 40 florins to 2-4 players and 30 to 5-6 players', () => {
    expect(startingMoney(2)).toBe(40)
    expect(startingMoney(3)).toBe(40)
    expect(startingMoney(4)).toBe(40)
    expect(startingMoney(5)).toBe(30)
    expect(startingMoney(6)).toBe(30)
    for (const n of [2, 3, 4, 5, 6] as const) {
      const g = game(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, n), 1)
      for (const p of g.players) expect(p.money).toBe(startingMoney(n))
    }
  })

  it('uses 7 ship spaces in 2p and 5 otherwise', () => {
    expect(SHIP_CAPACITY_2P).toBe(7)
    expect(SHIP_CAPACITY).toBe(5)
  })

  it('starts every player at level 0 of every track with an empty ship', () => {
    const g = game()
    for (const p of g.players) {
      for (const c of COMMODITIES) {
        expect(p.trackLevels[c]).toBe(0)
      }
      expect(p.ship.length).toBe(0)
    }
  })

  it('starts on day 1 in the draw phase with a random selector', () => {
    const g = game()
    expect(g.day).toBe(1)
    expect(g.phase).toBe('draw')
    expect(currentSelector(g)).toBeDefined()
    expect(g.playerOrder).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is deterministic under a fixed seed', () => {
    expect(game(['a', 'b', 'c'], 5).selectorIndex).toBe(game(['a', 'b', 'c'], 5).selectorIndex)
    expect(game(['a', 'b', 'c'], 5).deck.map((c) => c.id)).toEqual(
      game(['a', 'b', 'c'], 5).deck.map((c) => c.id),
    )
  })

  it('starts days 2 and 3 with the least-florins player (random among ties)', () => {
    let g = game(['a', 'b', 'c'], 3)
    g = {
      ...g,
      phase: 'scoring',
      players: g.players.map((p) => ({ ...p, money: p.id === 'b' ? 5 : 40 })) as PlayerState[],
    }
    const d2 = startNextDay(g, mulberry32(1))
    expect(d2.day).toBe(2)
    expect(currentSelector(d2)!.id).toBe('b')

    // Tie between a and c → one of them starts, never b
    const tied = {
      ...g,
      players: g.players.map((p) => ({ ...p, money: p.id === 'b' ? 40 : 15 })) as PlayerState[],
    }
    const d2tie = startNextDay(tied, mulberry32(2))
    expect(['a', 'c']).toContain(currentSelector(d2tie)!.id)

    const d3 = startNextDay({ ...d2, phase: 'scoring' }, mulberry32(3))
    expect(d3.day).toBe(3)
    expect(currentSelector(d3)!.id).toBe('b') // b still least florins
  })

  it('re-deals a fresh 36-card shuffle with re-removal every day', () => {
    let g = game(['a', 'b', 'c', 'd', 'e'], 11)
    const day1Deck = g.deck.map((c) => c.id)
    g = { ...g, phase: 'scoring' }
    const d2 = startNextDay(g, mulberry32(12))
    expect(d2.deck.length).toBe(CARDS_PER_DAY[5])
    expect(d2.discarded.length).toBe(0)
    expect(d2.deck.map((c) => c.id)).not.toEqual(day1Deck)
  })
})

// ---------------------------------------------------------------------------
describe('draw rules', () => {
  it('rejects stopping with no cards drawn', () => {
    const g = forceSelector(game(), 'a')
    const r = stopDraw(g, 'a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('at least one')
  })

  it('draws cards onto the group and removes them from the deck', () => {
    let g = forceSelector(game(), 'a')
    const deckBefore = g.deck.length
    const first = g.deck[0]
    const r = drawCard(g, 'a')
    expect(r.ok).toBe(true)
    if (r.ok) {
      g = r.state
      expect(g.group.length).toBe(1)
      expect(g.group[0].id).toBe(first.id)
      expect(g.deck.length).toBe(deckBefore - 1)
    }
  })

  it('allows up to 3 cards and rejects a 4th', () => {
    let g = forceSelector(game(), 'a')
    for (let i = 0; i < MAX_DRAW; i++) {
      const r = drawCard(g, 'a')
      expect(r.ok).toBe(true)
      if (r.ok) g = r.state
    }
    expect(g.group.length).toBe(3)
    const r4 = drawCard(g, 'a')
    expect(r4.ok).toBe(false)
    if (!r4.ok) expect(r4.error).toContain('3')
  })

  it('rejects drawing by a non-selector', () => {
    const g = forceSelector(game(), 'a')
    const r = drawCard(g, 'b')
    expect(r.ok).toBe(false)
  })

  it('rejects drawing when the deck is empty', () => {
    const g = { ...forceSelector(game(), 'a'), deck: [] }
    const r = drawCard(g, 'a')
    expect(r.ok).toBe(false)
  })

  it('rejects drawing for a full selector (out of the auction)', () => {
    const g = fillShip(forceSelector(game(['a', 'b']), 'a'), 'a', 7)
    const r = drawCard(g, 'a')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('out of the auction')
  })

  it('blocks a draw that would make the group unpresentable (nobody else has room)', () => {
    let g = fillShip(fillShip(forceSelector(game(['a', 'b', 'c']), 'a'), 'b', 3), 'c', 5)
    const r1 = drawCard(g, 'a')
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      const r2 = drawCard(r1.state, 'a')
      expect(r2.ok).toBe(true)
      if (r2.ok) {
        const r3 = drawCard(r2.state, 'a')
        expect(r3.ok).toBe(false)
        if (!r3.ok) expect(r3.error).toContain('No other player')
        expect(r2.state.group.length).toBe(2)
      }
    }
  })

  it('ends the day (stalled) when even a 1-card group cannot be auctioned', () => {
    let g = setMoney(setMoney(forceSelector(game(['a', 'b', 'c']), 'a'), 'b', 0), 'c', 0)
    const r = drawCard(g, 'a')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.phase).toBe('scoring')
      expect(r.state.history.at(-1)).toMatchObject({ type: 'day_end', reason: 'stalled' })
    }
  })

  it('canDrawMore reflects legality', () => {
    let g = forceSelector(game(), 'a')
    expect(canDrawMore(g)).toBe(true)
    for (let i = 0; i < MAX_DRAW; i++) {
      const r = drawCard(g, 'a')
      if (r.ok) g = r.state
    }
    expect(canDrawMore(g)).toBe(false) // 3 drawn
    const empty = { ...forceSelector(game(), 'a'), deck: [] }
    expect(canDrawMore(empty)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('auction mechanics', () => {
  it('bids clockwise from the left of the selector, selector last', () => {
    const g = openAuction(forceSelector(game(['a', 'b', 'c', 'd']), 'a'), 'a', 1)
    expect(g.auction!.bidOrder).toEqual(['b', 'c', 'd', 'a'])
  })

  it('excludes full ships from the bidding order', () => {
    const g = openAuction(fillShip(forceSelector(game(['a', 'b', 'c', 'd']), 'a'), 'b', 5), 'a', 1)
    expect(g.auction!.bidOrder).toEqual(['c', 'd', 'a'])
  })

  it('excludes disconnected players from the bidding order', () => {
    const g = openAuction(setDisconnected(forceSelector(game(['a', 'b', 'c', 'd']), 'a'), 'c'), 'a', 1)
    expect(g.auction!.bidOrder).toEqual(['b', 'd', 'a'])
  })

  it('enforces the minimum bid of 1', () => {
    const g = openAuction(forceSelector(game(), 'a'), 'a', 1)
    const first = currentBidderId(g)!
    const bad = bid(g, first, 0)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('Minimum bid')
    const ok = bid(g, first, MIN_BID)
    expect(ok.ok).toBe(true)
  })

  it('requires bids to exceed the current high bid', () => {
    const g = openAuction(forceSelector(game(), 'a'), 'a', 1)
    const order = g.auction!.bidOrder
    let r1 = bid(g, order[0], 5)
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      const tie = bid(r1.state, order[1], 5)
      expect(tie.ok).toBe(false)
      if (!tie.ok) expect(tie.error).toContain('exceed')
      const higher = bid(r1.state, order[1], 6)
      expect(higher.ok).toBe(true)
    }
  })

  it('rejects bids above the bidder money', () => {
    const g = openAuction(setMoney(forceSelector(game(['a', 'b', 'c']), 'a'), 'b', 10), 'a', 1)
    const r2 = bid(g, 'b', 11)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toContain('only have 10')
    const r3 = bid(g, 'b', 10)
    expect(r3.ok).toBe(true)
  })

  it('rejects bids that would overflow the ship', () => {
    const g = openAuction(fillShip(forceSelector(game(['a', 'b', 'c']), 'a'), 'b', 4), 'a', 2)
    const rb = bid(g, 'b', 2)
    expect(rb.ok).toBe(false)
    if (!rb.ok) expect(rb.error).toContain('does not fit')
  })

  it('only lets the current bidder act', () => {
    const g = openAuction(forceSelector(game(), 'a'), 'a', 1)
    const order = g.auction!.bidOrder
    const outOfTurn = bid(g, order[1], 3)
    expect(outOfTurn.ok).toBe(false)
    if (!outOfTurn.ok) expect(outOfTurn.error).toContain('Not your turn')
  })

  it('discards the group when everyone passes', () => {
    let g = openAuction(forceSelector(game(), 'a'), 'a', 1)
    const groupIds = g.auction!.group.map((c) => c.id)
    g = finishAuction(g)
    expect(g.phase).toBe('draw')
    expect(g.discarded.map((c) => c.id)).toEqual(groupIds)
    for (const p of g.players) {
      expect(p.ship.length).toBe(0)
      expect(p.money).toBe(40)
    }
  })

  it('loads the whole group onto the winner ship and deducts the bid', () => {
    let g = openAuction(forceSelector(game(), 'a'), 'a', 2)
    const groupSize = g.auction!.group.length
    g = finishAuction(g, { b: 4, c: 6 })
    const c = g.players.find((p) => p.id === 'c')!
    expect(c.ship.length).toBe(groupSize)
    expect(c.money).toBe(40 - 6)
    const b = g.players.find((p) => p.id === 'b')!
    expect(b.ship.length).toBe(0)
    expect(b.money).toBe(40)
  })

  it('lets the selector win by bidding last', () => {
    let g = openAuction(forceSelector(game(), 'a'), 'a', 1)
    g = finishAuction(g, { a: 3 })
    const s = g.players.find((p) => p.id === 'a')!
    expect(s.ship.length).toBe(1)
    expect(s.money).toBe(40 - 3)
  })
})

// ---------------------------------------------------------------------------
describe('turn order', () => {
  it('passes the selector role to the left after each auction', () => {
    let g = forceSelector(game(['a', 'b', 'c', 'd']), 'a')
    g = finishAuction(openAuction(g, 'a', 1))
    expect(currentSelector(g)!.id).toBe('b')
  })

  it('skips full ships when advancing the selector', () => {
    let g = fillShip(forceSelector(game(['a', 'b', 'c']), 'a'), 'b', 5)
    g = finishAuction(openAuction(g, 'a', 1))
    expect(currentSelector(g)!.id).toBe('c')
  })
})

// ---------------------------------------------------------------------------
describe('day end', () => {
  it('ends the day in the scoring phase when the deck runs out', () => {
    let g = game(['a', 'b', 'c'])
    g = craftAuction(g, { deck: [], bidOrder: ['a'] })
    const r = pass(g, 'a')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.phase).toBe('scoring')
      expect(r.state.history.at(-1)).toMatchObject({ type: 'day_end', reason: 'deck_empty' })
    }
  })

  it('free-fills the last player with room from the top of the deck', () => {
    const g0 = fillShip(fillShip(fillShip(game(['a', 'b', 'c', 'd']), 'a', 5), 'b', 5), 'c', 5)
    const groupCard = g0.deck[0]
    const deckAfter = g0.deck.slice(1)
    const expected = deckAfter.slice(0, 5).map((c) => c.id)
    const g = craftAuction(g0, { group: [groupCard], deck: deckAfter, bidOrder: ['d'] })
    const r = pass(g, 'd')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const d = r.state.players.find((p) => p.id === 'd')!
      expect(d.ship.length).toBe(5)
      expect(d.ship.map((c) => c.id)).toEqual(expected)
      expect(r.state.phase).toBe('scoring')
      expect(r.state.history.some((e) => e.type === 'free_fill' && e.playerId === 'd')).toBe(true)
    }
  })

  it('sails with empty holds when the deck is short for the free fill', () => {
    const g0 = fillShip(fillShip(fillShip(game(['a', 'b', 'c', 'd']), 'a', 5), 'b', 5), 'c', 5)
    const groupCard = g0.deck[0]
    const deckAfter = g0.deck.slice(1, 3) // only 2 cards left for the free fill
    const g = craftAuction(g0, { group: [groupCard], deck: deckAfter, bidOrder: ['d'] })
    const r = pass(g, 'd')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const d = r.state.players.find((p) => p.id === 'd')!
      expect(d.ship.length).toBe(2)
      expect(r.state.deck.length).toBe(0)
      expect(r.state.phase).toBe('scoring')
    }
  })

  it('ends the day when all ships are full', () => {
    let g = fillShip(fillShip(game(['a', 'b', 'c']), 'a', 5), 'b', 5)
    g = fillShip(g, 'c', 4)
    g = craftAuction(g, { bidOrder: ['c'] })
    const r = bid(g, 'c', 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.phase).toBe('scoring')
      expect(r.state.history.at(-1)).toMatchObject({ type: 'day_end', reason: 'ships_full' })
    }
  })

  it('continues to the next selector when the day is not over', () => {
    let g = forceSelector(game(['a', 'b', 'c', 'd']), 'a')
    g = finishAuction(openAuction(g, 'a', 1))
    expect(g.phase).toBe('draw')
    expect(g.deck.length).toBeGreaterThan(0)
    expect(currentSelector(g)!.id).toBe('b')
  })
})

// ---------------------------------------------------------------------------
describe('2-player variant', () => {
  it('uses 7 ship spaces and 18 cards in 2-player games', () => {
    const g0 = forceSelector(game(['a', 'b'], 7), 'a')
    expect(g0.deck.length).toBe(18)
    // 2p capacity is 7: a 3-card group still fits b with 4 cards already aboard
    const g = openAuction(fillShip(g0, 'b', 4), 'a', 3)
    expect(g.auction!.bidOrder).toEqual(['b', 'a'])
    const r = bid(g, 'b', 2)
    expect(r.ok).toBe(true)
    // presentation guard still applies: b at 6 cannot take a 2-card group
    const g2 = fillShip(forceSelector(game(['a', 'b'], 7), 'a'), 'b', 6)
    const r1 = drawCard(g2, 'a')
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      const r2 = drawCard(r1.state, 'a')
      expect(r2.ok).toBe(false)
      if (!r2.ok) expect(r2.error).toContain('No other player')
    }
  })
})
