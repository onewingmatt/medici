// Independent rules pass (2026-08-15) — edge cases re-derived from the Grail
// 2016 rulebook (qugs.org/rules/r46.pdf), not from the existing tests.
// Targets: the rulebook's worked auction example, presentation rule (rule 4),
// zero-money bidders, integer bids, money reconciliation, and full-game
// invariants over a deterministic bot sweep.
import { describe, it, expect } from 'vitest'
import { COMMODITIES, MAX_DRAW, MIN_BID, SHIP_CAPACITY, SHIP_CAPACITY_2P, TRACK_LEVELS } from '../shared/constants'
import { buildDeck } from '../shared/deck'
import {
  createGame,
  currentBidderId,
  currentSelector,
  drawCard,
  pass,
  bid,
  stopDraw,
} from '../shared/engine'
import { scoreDay, scoreShipPayments, shipValue } from '../shared/scoring'
import { botAction } from '../shared/bot'
import type { Card, GameState, PlayerState } from '../shared/types'
import type { CardCommodity, Commodity } from '../shared/constants'

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
  return createGame(ids.map((id) => ({ id, name: id.toUpperCase() })), mulberry32(seed))
}

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

// Draw `drawCount` cards as the selector and stop → open auction.
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

function finishAuction(g: GameState, responses: Record<string, 'pass' | number> = {}): GameState {
  let s = g
  let guard = 0
  while (s.phase === 'auction') {
    if (guard++ > 20) throw new Error('auction did not resolve')
    const bidder = currentBidderId(s)
    if (!bidder) throw new Error('no current bidder')
    const resp = responses[bidder] ?? 'pass'
    const rr = resp === 'pass' ? pass(s, bidder) : bid(s, bidder, resp)
    if (!rr.ok) throw new Error(`${bidder}: ${rr.error}`)
    s = rr.state
  }
  return s
}

let uid = 0
function mk(commodity: CardCommodity, value: number): Card {
  return { id: `i${uid++}-${commodity}-${value}`, commodity, value }
}

// ---------------------------------------------------------------------------
describe('rulebook worked auction example (Adam/Kylie/Jason/Diane)', () => {
  // Adam has 2 aboard, Kylie 3, Jason 4, Diane 2. Adam presents 3 cards.
  // Kylie and Jason MUST pass (would overflow). Diane bids 7. Adam bids 8,
  // wins as the last bidder, loads 3 (5 total), pays 8.
  it('full players cannot bid and the selector wins last with 8', () => {
    let g = fillShip(game(['adam', 'kylie', 'jason', 'diane']), 'adam', 2)
    g = fillShip(g, 'kylie', 3)
    g = fillShip(g, 'jason', 4)
    g = fillShip(g, 'diane', 2)
    g = forceSelector(g, 'adam')

    // Present a 3-card group. Only diane has room (2+3=5) and adam (2+3=5).
    // Kylie (3+3=6) and jason (4+3=7) are in the auction but MUST pass.
    const auc = openAuction(g, 'adam', 3)
    expect(auc.auction!.bidOrder).toEqual(['kylie', 'jason', 'diane', 'adam'])
    const k = bid(auc, 'kylie', 3)
    expect(k.ok).toBe(false) // would overflow
    const afterK = pass(auc, 'kylie')
    expect(afterK.ok).toBe(true)
    const j = bid(afterK.ok ? afterK.state : auc, 'jason', 3)
    expect(j.ok).toBe(false)
    const afterJ = pass(afterK.ok ? afterK.state : auc, 'jason')
    expect(afterJ.ok).toBe(true)

    const afterDiane = bid(afterJ.ok ? afterJ.state : auc, 'diane', 7)
    expect(afterDiane.ok).toBe(true)
    const afterAdam = bid(afterDiane.ok ? afterDiane.state : auc, 'adam', 8)
    expect(afterAdam.ok).toBe(true)
    if (afterAdam.ok) {
      const adam = afterAdam.state.players.find((p) => p.id === 'adam')!
      expect(adam.ship.length).toBe(5) // 2 + group of 3
      expect(adam.money).toBe(40 - 8)
      const diane = afterAdam.state.players.find((p) => p.id === 'diane')!
      expect(diane.ship.length).toBe(2)
      expect(diane.money).toBe(40)
    }
  })
})

// ---------------------------------------------------------------------------
describe('presentation rule (rulebook rule 4)', () => {
  it('selector may present a group larger than their own remaining space', () => {
    // a has 4 aboard (1 space) and presents 3 cards; b has room and can bid.
    let g = fillShip(game(['a', 'b', 'c', 'd']), 'a', 4)
    g = forceSelector(g, 'a')
    const auc = openAuction(g, 'a', 3) // 4+3 > 5 — allowed as presentation
    expect(auc.auction!.group.length).toBe(3)
    // drive to the selector's turn (b, c, d pass)
    let s = auc
    for (const id of ['b', 'c', 'd']) {
      const r = pass(s, id)
      expect(r.ok).toBe(true)
      if (r.ok) s = r.state
    }
    // a cannot BID on it (would overflow) — must pass
    const selfBid = bid(s, 'a', 9)
    expect(selfBid.ok).toBe(false)
    if (!selfBid.ok) expect(selfBid.error).toContain('does not fit')
    // if b had bid, they'd win: verify b's bid is accepted at their turn
    let s2 = auc
    const bBid = bid(s2, 'b', 9)
    expect(bBid.ok).toBe(true)
  })

  it('ends the day (stalled) when nobody else can bid even a 1-card group', () => {
    // everyone else full → the FIRST draw cannot be auctioned → day stalls
    const g0 = fillShip(fillShip(fillShip(game(['a', 'b', 'c', 'd']), 'b', 5), 'c', 5), 'd', 5)
    const g = forceSelector(g0, 'a')
    const r1 = drawCard(g, 'a')
    expect(r1.ok).toBe(true)
    if (r1.ok) {
      expect(r1.state.phase).toBe('scoring')
      expect(r1.state.history.at(-1)).toMatchObject({ type: 'day_end', reason: 'stalled' })
    }
  })
})

// ---------------------------------------------------------------------------
describe('zero-money bidders and integer bids', () => {
  it('a 0-florin player stays in the bid order but must pass', () => {
    let g = setMoney(game(['a', 'b', 'c']), 'c', 0)
    g = openAuction(forceSelector(g, 'a'), 'a', 1)
    expect(g.auction!.bidOrder).toContain('c') // room is what matters, not money
    // reach c's turn: b passes, then c is up
    const afterB = pass(g, 'b')
    expect(afterB.ok).toBe(true)
    const c = currentBidderId(afterB.ok ? afterB.state : g)
    expect(c).toBe('c')
    const bad = bid(afterB.ok ? afterB.state : g, 'c', 1)
    expect(bad.ok).toBe(false) // 0 florins cannot bid even the minimum
    const passC = pass(afterB.ok ? afterB.state : g, 'c')
    expect(passC.ok).toBe(true)
  })

  it('rejects non-integer bids', () => {
    const g = openAuction(forceSelector(game(['a', 'b']), 'a'), 'a', 1)
    const first = currentBidderId(g)!
    const r = bid(g, first, 2.5)
    expect(r.ok).toBe(false)
  })

  it('allows a bid equal to all remaining money (money hits exactly 0)', () => {
    let g = setMoney(game(['a', 'b']), 'b', 5)
    g = openAuction(forceSelector(g, 'a'), 'a', 1)
    const afterB = bid(g, 'b', 5)
    expect(afterB.ok).toBe(true)
    if (afterB.ok) {
      // a (selector) passes; b wins with money 0
      const done = pass(afterB.state, 'a')
      expect(done.ok).toBe(true)
      if (done.ok) {
        const b = done.state.players.find((p) => p.id === 'b')!
        expect(b.money).toBe(0)
        expect(b.ship.length).toBe(1)
      }
    }
  })
})

// ---------------------------------------------------------------------------
describe('scoring reconciliation and money invariants', () => {
  it('money after scoreDay equals money before plus ship payment plus all track totals', () => {
    const g: GameState = {
      ...game(['a', 'b', 'c'], 1),
      phase: 'scoring',
      players: game(['a', 'b', 'c'], 1).players.map((p, i) => ({
        ...p,
        money: 20 + i,
        ship: i === 0 ? [mk('cloth', 5), mk('grain', 3)] : i === 1 ? [mk('cloth', 2)] : [],
        trackLevels: {
          cloth: i === 0 ? 3 : 1,
          fur: 0,
          grain: i === 0 ? 2 : 0,
          dye: 0,
          spice: 0,
        },
      })) as PlayerState[],
    }
    const before = new Map(g.players.map((p) => [p.id, p.money]))
    const scored = scoreDay(g, mulberry32(1))

    // derive expected from the scoring log itself (self-consistency check)
    const shipEvent = scored.scoringLog.find((e) => e.type === 'ship_value')
    const trackEvents = scored.scoringLog.filter((e) => e.type === 'track')
    for (const p of scored.players) {
      let expected = before.get(p.id)!
      if (shipEvent && shipEvent.type === 'ship_value') {
        expected += shipEvent.lines.find((l) => l.playerId === p.id)!.payment
      }
      for (const te of trackEvents) {
        if (te.type !== 'track') continue
        expected += te.lines.find((l) => l.playerId === p.id)!.total
      }
      expect(p.money).toBe(expected)
      expect(p.money).toBeGreaterThanOrEqual(0)
    }
  })

  it('ship payment ties in 2p split (20+0)/2 = 10 each', () => {
    const g: GameState = {
      ...game(['a', 'b'], 1),
      phase: 'scoring',
      players: game(['a', 'b'], 1).players.map((p, i) => ({
        ...p,
        ship: [mk('cloth', 7)],
      })) as PlayerState[],
    }
    const lines = scoreShipPayments(g)
    for (const l of lines) expect(l.payment).toBe(10)
  })

  it('three-way ship tie at the top spans 1st-3rd payments and rounds down', () => {
    const g: GameState = {
      ...game(['a', 'b', 'c', 'd'], 1),
      phase: 'scoring',
      players: game(['a', 'b', 'c', 'd'], 1).players.map((p, i) => ({
        ...p,
        ship: [mk('cloth', i < 3 ? 9 : 1)],
      })) as PlayerState[],
    }
    const lines = scoreShipPayments(g)
    const pay = (id: string) => lines.find((l) => l.playerId === id)!.payment
    expect(pay('a')).toBe(20) // (30+20+10)/3 = 20
    expect(pay('b')).toBe(20)
    expect(pay('c')).toBe(20)
    expect(pay('d')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('full-game invariants over a deterministic bot sweep', () => {
  // Plays complete 3-day games with seeded RNG and all-bot players, checking
  // structural invariants that must hold after every game.
  function playGame(ids: string[], seed: number): GameState | null {
    const rng = mulberry32(seed)
    const diffs = ['easy', 'medium', 'hard']
    let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
    for (let i = 0; i < g.players.length; i++) {
      g.players[i].isBot = true
      g.players[i].difficulty = diffs[i % 3]
    }
    let actions = 0
    while (g.phase !== 'game_over' && actions < 50000) {
      actions++
      if (g.phase === 'scoring') {
        g = scoreDay(g, rng)
        continue
      }
      let actorId: string | null = null
      if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
      else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
      if (!actorId) return null
      const me = g.players.find((p) => p.id === actorId)!
      const action = botAction(g, actorId, me.difficulty!, rng)
      let result
      if (action.kind === 'draw') result = drawCard(g, actorId)
      else if (action.kind === 'stop') result = stopDraw(g, actorId)
      else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
      else result = pass(g, actorId)
      if (!result.ok) {
        if (g.phase === 'draw') {
          result = stopDraw(g, actorId)
          if (!result.ok) result = drawCard(g, actorId)
        } else if (g.phase === 'auction') {
          result = pass(g, actorId)
        }
      }
      if (!result.ok) return null
      g = result.state
    }
    return g.phase === 'game_over' ? g : null
  }

  it('every completed game respects money, ship, track, and day invariants', () => {
    let games = 0
    for (let seed = 1; seed <= 12; seed++) {
      for (const count of [2, 3, 4, 5, 6]) {
        const ids = Array.from({ length: count }, (_, i) => `p${i}`)
        const g = playGame(ids, seed * 100 + count)
        if (!g) continue
        games++

        // exactly three days were played
        const dayStarts = g.history.filter((e) => e.type === 'day_start')
        expect(dayStarts).toHaveLength(3)

        // money never negative, and within one +100 flip (0..199)
        for (const p of g.players) {
          expect(p.money).toBeGreaterThanOrEqual(0)
          expect(p.money).toBeLessThanOrEqual(199)
        }

        // ships hold at most capacity at game over (cleared only at day setup)
        const cap = count === 2 ? SHIP_CAPACITY_2P : SHIP_CAPACITY
        for (const p of g.players) expect(p.ship.length).toBeLessThanOrEqual(cap)

        // track levels within bounds
        for (const p of g.players) {
          for (const c of COMMODITIES) {
            expect(p.trackLevels[c]).toBeGreaterThanOrEqual(0)
            expect(p.trackLevels[c]).toBeLessThan(TRACK_LEVELS)
          }
        }

        // finalResults sorted descending, winnerIds = all at the max
        const results = g.finalResults!
        const monies = results.map((r) => r.money)
        expect([...monies].sort((a, b) => b - a)).toEqual(monies)
        const max = monies[0]
        const winners = results.filter((r) => r.money === max).map((r) => r.playerId)
        const last = g.history.at(-1)
        expect(last).toMatchObject({ type: 'game_over' })
        if (last && last.type === 'game_over') {
          expect(last.winnerIds).toEqual(winners)
        }
      }
    }
    expect(games).toBe(12 * 5)
  })

  it('free fill with an exactly-empty deck does not crash and ends scoring', () => {
    // a,b,c full; d has room; deck empty. Rulebook: d sails with empty holds.
    const g0 = fillShip(fillShip(fillShip(game(['a', 'b', 'c', 'd']), 'a', 5), 'b', 5), 'c', 5)
    const s = { ...g0, phase: 'scoring' as const, deck: [] }
    const end = scoreDay(s, mulberry32(1))
    expect(end.phase).toBe('draw') // day 2 starts normally
  })
})
