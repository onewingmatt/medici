// Phase 2 scoring tests — ship payments, tie division, tracks, bonuses,
// 3-day cycle, game end. Includes the rulebook's worked examples.
import { describe, it, expect } from 'vitest'
import { COMMODITIES, DAYS, SHIP_PAYMENTS, TRACK_BONUS_BY_LEVEL, TRACK_LEVELS } from '../shared/constants'
import { createGame } from '../shared/engine'
import { scoreCommodityTrack, scoreDay, scoreShipPayments, shipValue } from '../shared/scoring'
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

function game(ids: string[], seed = 1): GameState {
  return createGame(
    ids.map((id) => ({ id, name: id.toUpperCase() })),
    mulberry32(seed),
  )
}

let uid = 0
function mk(commodity: CardCommodity, value: number): Card {
  return { id: `t${uid++}-${commodity}-${value}`, commodity, value }
}

function craft(
  ids: string[],
  opts: {
    ships?: Record<string, Card[]>
    tracks?: Record<string, Partial<Record<Commodity, number>>>
    money?: Record<string, number>
  } = {},
): GameState {
  const g = game(ids, 1)
  return {
    ...g,
    phase: 'scoring',
    players: g.players.map((p) => ({
      ...p,
      ship: opts.ships?.[p.id] ?? [],
      money: opts.money?.[p.id] ?? p.money,
      trackLevels: { cloth: 0, fur: 0, grain: 0, dye: 0, spice: 0, ...(opts.tracks?.[p.id] ?? {}) },
    })) as PlayerState[],
  }
}

function moneyOf(g: GameState, id: string): number {
  return g.players.find((p) => p.id === id)!.money
}

// ---------------------------------------------------------------------------
describe('ship value payments', () => {
  it('pays per the rulebook 5-player example: 23,20,16,16,14 → 30,20,7,7,0', () => {
    const g = craft(['a', 'b', 'c', 'd', 'e'], {
      ships: {
        a: [mk('cloth', 5), mk('dye', 5), mk('grain', 3), mk('grain', 0), mk('gold', 10)], // 23
        b: [mk('grain', 5), mk('dye', 4), mk('fur', 4), mk('fur', 3), mk('spice', 4)], // 20
        c: [mk('cloth', 3), mk('spice', 5), mk('cloth', 2), mk('cloth', 1), mk('dye', 5)], // 16
        d: [mk('spice', 3), mk('grain', 5), mk('grain', 4), mk('grain', 2), mk('fur', 2)], // 16
        e: [mk('spice', 5), mk('spice', 2), mk('dye', 3), mk('dye', 0), mk('cloth', 4)], // 14
      },
    })
    expect(shipValue(g.players[0])).toBe(23)
    const lines = scoreShipPayments(g)
    const pay = (id: string) => lines.find((l) => l.playerId === id)!.payment
    expect(pay('a')).toBe(30)
    expect(pay('b')).toBe(20)
    expect(pay('c')).toBe(7)
    expect(pay('d')).toBe(7)
    expect(pay('e')).toBe(0)
  })

  it('divides tied places spanning their positions and rounds down', () => {
    const g = craft(['a', 'b', 'c', 'd'], {
      ships: { a: [mk('cloth', 8)], b: [mk('cloth', 8)], c: [mk('cloth', 4)], d: [mk('cloth', 4)] },
    })
    const lines = scoreShipPayments(g)
    const pay = (id: string) => lines.find((l) => l.playerId === id)!.payment
    expect(pay('a')).toBe(25) // (30+20)/2
    expect(pay('b')).toBe(25)
    expect(pay('c')).toBe(5) // (10+0)/2
    expect(pay('d')).toBe(5)
  })

  it('pays 2p as 20 / 0', () => {
    const g = craft(['a', 'b'], { ships: { a: [mk('cloth', 15)], b: [mk('cloth', 5)] } })
    const lines = scoreShipPayments(g)
    expect(lines.find((l) => l.playerId === 'a')!.payment).toBe(20)
    expect(lines.find((l) => l.playerId === 'b')!.payment).toBe(0)
  })

  it('pays 6p 3rd place 15 (Grail 2016 rulebook, not the older 10)', () => {
    expect(SHIP_PAYMENTS[6]).toEqual([30, 20, 15, 10, 5, 0])
    const g = craft(['a', 'b', 'c', 'd', 'e', 'f'], {
      ships: {
        a: [mk('cloth', 25)], b: [mk('cloth', 20)], c: [mk('cloth', 15)],
        d: [mk('cloth', 10)], e: [mk('cloth', 5)], f: [mk('cloth', 1)],
      },
    })
    const lines = scoreShipPayments(g)
    const pay = (id: string) => lines.find((l) => l.playerId === id)!.payment
    expect(pay('a')).toBe(30)
    expect(pay('b')).toBe(20)
    expect(pay('c')).toBe(15)
    expect(pay('d')).toBe(10)
    expect(pay('e')).toBe(5)
    expect(pay('f')).toBe(0)
  })

  it('counts gold in ship value', () => {
    const g = craft(['a', 'b'], { ships: { a: [mk('gold', 10), mk('cloth', 2), mk('fur', 3)] } })
    expect(shipValue(g.players[0])).toBe(15)
  })
})

// ---------------------------------------------------------------------------
describe('commodity tracks', () => {
  it('moves counters up by card count and awards 10/5 by rank', () => {
    const g = craft(['a', 'b', 'c', 'd'], {
      ships: {
        a: [mk('grain', 0), mk('grain', 1), mk('grain', 2)],
        b: [mk('grain', 5), mk('grain', 5)],
        c: [mk('grain', 4)],
        d: [],
      },
    })
    const lines = scoreCommodityTrack(g, 'grain')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(line('a').level).toBe(3)
    expect(line('b').level).toBe(2)
    expect(line('c').level).toBe(1)
    expect(line('d').level).toBe(0)
    expect(line('a').award).toBe(10)
    expect(line('b').award).toBe(5)
    expect(line('c').award).toBe(0)
    expect(line('d').award).toBe(0)
  })

  it('ignores card values and gold for track movement', () => {
    const g = craft(['a', 'b'], { ships: { a: [mk('cloth', 5), mk('cloth', 5), mk('gold', 10)] } })
    const lines = scoreCommodityTrack(g, 'cloth')
    expect(lines.find((l) => l.playerId === 'a')!.level).toBe(2) // gold not counted
    const goldLines = scoreCommodityTrack(g, 'spice')
    expect(goldLines.find((l) => l.playerId === 'a')!.level).toBe(0)
  })

  it('divides tied track awards across the spanned positions (5/3 → 1 each)', () => {
    // Rulebook example: three players tied for second get 5/3 = 1 each
    const g = craft(['y', 'p', 'w', 'g2'], {
      tracks: { y: { cloth: 7 }, p: { cloth: 0 }, w: { cloth: 0 }, g2: { cloth: 0 } },
    })
    const lines = scoreCommodityTrack(g, 'cloth')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(line('y').award).toBe(10)
    expect(line('p').award).toBe(1)
    expect(line('w').award).toBe(1)
    expect(line('g2').award).toBe(1)
  })

  it('pays the second position 0 in a 2-player game', () => {
    const g = craft(['a', 'b'], { ships: { a: [mk('dye', 1), mk('dye', 1)], b: [mk('dye', 1)] } })
    const lines = scoreCommodityTrack(g, 'dye')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(line('a').award).toBe(10)
    expect(line('b').award).toBe(0)
  })

  it('awards zero-purchasers who tie at the bottom (gold frame) level', () => {
    const g = craft(['a', 'b', 'c'], { ships: { a: [], b: [], c: [] } })
    const lines = scoreCommodityTrack(g, 'fur')
    for (const l of lines) {
      expect(l.level).toBe(0)
      expect(l.award).toBe(5) // (10+5+0)/3 = 5
    }
  })

  it('grants the full 5/10/20 bonus on levels 5/6/7 and none below', () => {
    const g = craft(['a', 'b', 'c', 'd'], {
      tracks: { a: { spice: 7 }, b: { spice: 6 }, c: { spice: 5 }, d: { spice: 4 } },
    })
    const lines = scoreCommodityTrack(g, 'spice')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(TRACK_BONUS_BY_LEVEL).toEqual([0, 0, 0, 0, 0, 5, 10, 20])
    expect(line('a').bonus).toBe(20)
    expect(line('b').bonus).toBe(10)
    expect(line('c').bonus).toBe(5)
    expect(line('d').bonus).toBe(0)
  })

  it('does not divide bonuses between players on the same bonus level', () => {
    const g = craft(['a', 'b'], { tracks: { a: { grain: 7 }, b: { grain: 7 } } })
    const lines = scoreCommodityTrack(g, 'grain')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(line('a').bonus).toBe(20)
    expect(line('b').bonus).toBe(20)
    // award tie: (10+0)/2 = 5 each in 2p
    expect(line('a').award).toBe(5)
    expect(line('b').award).toBe(5)
  })

  it('caps track movement at the top level', () => {
    const g = craft(['a', 'b'], {
      tracks: { a: { grain: 6 } },
      ships: { a: [mk('grain', 0), mk('grain', 0)] },
    })
    const lines = scoreCommodityTrack(g, 'grain')
    expect(lines.find((l) => l.playerId === 'a')!.level).toBe(TRACK_LEVELS - 1)
  })

  it('reproduces the rulebook combined example: yellow 30, white/green 12 each, pink 0', () => {
    const g = craft(['yellow', 'white', 'green', 'pink'], {
      tracks: { yellow: { fur: 7 }, white: { fur: 6 }, green: { fur: 6 }, pink: { fur: 4 } },
    })
    const lines = scoreCommodityTrack(g, 'fur')
    const line = (id: string) => lines.find((l) => l.playerId === id)!
    expect(line('yellow').total).toBe(30) // 10 + 20 bonus
    expect(line('white').total).toBe(12) // 2 (5/2 rounded) + 10 bonus
    expect(line('green').total).toBe(12)
    expect(line('pink').total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
describe('full day scoring and game cycle', () => {
  it('pays ship value first, then track awards with bonuses, in scoringLog order', () => {
    const g = craft(['a', 'b'], {
      ships: { a: [mk('gold', 10), mk('cloth', 4)], b: [mk('cloth', 3)] },
    })
    const scored = scoreDay(g, mulberry32(1))
    const log = scored.scoringLog
    expect(log[0].type).toBe('ship_value')
    const shipLines = log[0]
    if (shipLines.type === 'ship_value') {
      expect(shipLines.lines.find((l) => l.playerId === 'a')!.payment).toBe(20)
    }
    // five track events
    const trackEvents = log.filter((e) => e.type === 'track')
    expect(trackEvents.length).toBe(5)
    expect(trackEvents.map((e) => (e.type === 'track' ? e.commodity : ''))).toEqual([
      ...COMMODITIES,
    ])
    expect(log.at(-1)?.type).toBe('day_total')
  })

  it('moves to day 2 with cumulative track levels after day 1 scoring', () => {
    const g = craft(['a', 'b', 'c'], {
      ships: { a: [mk('grain', 0), mk('grain', 0), mk('grain', 0)] },
    })
    const scored = scoreDay(g, mulberry32(1))
    expect(scored.day).toBe(2)
    expect(scored.phase).toBe('draw')
    expect(scored.players.find((p) => p.id === 'a')!.trackLevels.grain).toBe(3)
    expect(scored.players.find((p) => p.id === 'b')!.trackLevels.grain).toBe(0)
  })

  it('keeps track levels across all three days (cumulative state)', () => {
    let g = craft(['a', 'b'], {
      ships: { a: [mk('fur', 0), mk('fur', 0)] },
    })
    // day 1: a gains 2 fur
    g = scoreDay(g, mulberry32(1))
    // day 2: a gains 3 more fur → level 5 (bonus level)
    g = {
      ...g,
      phase: 'scoring',
      players: g.players.map((p) =>
        p.id === 'a' ? { ...p, ship: [mk('fur', 0), mk('fur', 0), mk('fur', 0)] } : p,
      ) as PlayerState[],
    }
    g = scoreDay(g, mulberry32(2))
    expect(g.players.find((p) => p.id === 'a')!.trackLevels.fur).toBe(5)
    expect(g.day).toBe(3)
    // day 3: a gains 2 more → top level 7, 20 bonus
    g = {
      ...g,
      phase: 'scoring',
      players: g.players.map((p) =>
        p.id === 'a' ? { ...p, ship: [mk('fur', 0), mk('fur', 0)] } : p,
      ) as PlayerState[],
    }
    g = scoreDay(g, mulberry32(3))
    expect(g.players.find((p) => p.id === 'a')!.trackLevels.fur).toBe(7)
    expect(g.phase).toBe('game_over')
  })

  it('ends the game after day 3 with the richest player winning', () => {
    let s = craft(['a', 'b', 'c'], {})
    s = { ...s, day: 3, players: s.players.map((p) => ({ ...p, money: p.id === 'b' ? 90 : 30 })) as PlayerState[] }
    const end = scoreDay(s, mulberry32(1))
    expect(end.phase).toBe('game_over')
    expect(end.finalResults![0].playerId).toBe('b')
    expect(end.history.at(-1)).toMatchObject({ type: 'game_over', winnerIds: ['b'] })
  })

  it('shares the victory when the top players tie', () => {
    let s = craft(['a', 'b', 'c'], {})
    s = { ...s, day: 3, players: s.players.map((p) => ({ ...p, money: 55 })) as PlayerState[] }
    const end = scoreDay(s, mulberry32(1))
    expect(end.phase).toBe('game_over')
    expect(end.history.at(-1)).toMatchObject({ type: 'game_over', winnerIds: ['a', 'b', 'c'] })
    expect(end.finalResults).toHaveLength(3)
  })

  it('runs a complete 3-day cycle ending in game over', () => {
    let g = craft(['a', 'b'], {})
    let days = 1
    while (g.phase !== 'game_over') {
      expect(g.day).toBe(days)
      g = scoreDay({ ...g, phase: 'scoring' }, mulberry32(days))
      days++
    }
    expect(days).toBe(DAYS + 1)
    expect(g.finalResults).toBeDefined()
    expect(g.scoringLog.filter((e) => e.type === 'day_total')).toHaveLength(3)
  })

  it('tracks cumulative money across days in day_total events', () => {
    let g = craft(['a', 'b'], {})
    g = scoreDay(g, mulberry32(1))
    const totals = g.scoringLog.filter((e) => e.type === 'day_total')
    expect(totals).toHaveLength(1)
    const first = totals[0]
    if (first.type === 'day_total') {
      for (const t of first.totals) {
        // empty ships still earn: ship tie (20+0)/2=10 + five track ties (10+0)/2=5 each
        expect(t.money).toBe(40 + 10 + 25)
      }
    }
  })
})
