// Day scoring — ship value payments, commodity track advancement + awards,
// bonus levels, day cycle, game end. Pure functions, no I/O.
import { COMMODITIES, DAYS, SHIP_PAYMENTS, TRACK_BONUS_BY_LEVEL, TRACK_LEVELS } from './constants'
import type { Commodity } from './constants'
import type { RNG } from './deck'
import { startNextDay } from './engine'
import type {
  GameState,
  PlayerState,
  ScoringEvent,
  ShipPaymentLine,
  TrackAwardLine,
} from './types'

// ---------------------------------------------------------------------------
// Ship value payments (rulebook table, tie division spanning tied places)
// ---------------------------------------------------------------------------

export function shipValue(p: PlayerState): number {
  return p.ship.reduce((sum, c) => sum + c.value, 0)
}

export function scoreShipPayments(state: GameState): ShipPaymentLine[] {
  const n = state.players.length
  const payments = SHIP_PAYMENTS[n]
  const ranked = state.players
    .map((p) => ({ playerId: p.id, shipValue: shipValue(p) }))
    .sort((a, b) => b.shipValue - a.shipValue)

  const lines: ShipPaymentLine[] = []
  let i = 0
  while (i < ranked.length) {
    let j = i
    while (j + 1 < ranked.length && ranked[j + 1].shipValue === ranked[i].shipValue) j++
    // Positions i+1..j+1 are tied (1-indexed). Sum their payments, split evenly, round down.
    let sum = 0
    for (let k = i; k <= j; k++) sum += payments[k]
    const share = Math.floor(sum / (j - i + 1))
    for (let k = i; k <= j; k++) {
      lines.push({ playerId: ranked[k].playerId, shipValue: ranked[k].shipValue, payment: share })
    }
    i = j + 1
  }
  return lines
}

// ---------------------------------------------------------------------------
// Commodity track scoring
// ---------------------------------------------------------------------------

// Count of one commodity on a ship (gold excluded).
function countOf(p: PlayerState, commodity: Commodity): number {
  return p.ship.filter((c) => c.commodity === commodity).length
}

// Move counters up (capped at the top level), then award 10/5 (2p: 10/0) with
// tie-spanning division, plus full (undivided) bonus for the top three levels.
export function scoreCommodityTrack(state: GameState, commodity: Commodity): TrackAwardLine[] {
  const n = state.players.length
  const awardTable = n === 2 ? [10, 0] : [10, 5]

  // Advance counters (cumulative across days, capped at top).
  const advanced = state.players.map((p) => {
    const level = Math.min(
      TRACK_LEVELS - 1,
      p.trackLevels[commodity] + countOf(p, commodity),
    )
    return { playerId: p.id, level }
  })

  // Rank levels descending; tie groups span consecutive positions.
  const ranked = [...advanced].sort((a, b) => b.level - a.level)
  const lines: TrackAwardLine[] = []
  let i = 0
  while (i < ranked.length) {
    let j = i
    while (j + 1 < ranked.length && ranked[j + 1].level === ranked[i].level) j++
    let sum = 0
    for (let k = i; k <= j; k++) sum += awardTable[k] ?? 0
    const share = Math.floor(sum / (j - i + 1))
    for (let k = i; k <= j; k++) {
      const level = ranked[k].level
      const bonus = TRACK_BONUS_BY_LEVEL[level] ?? 0
      lines.push({
        playerId: ranked[k].playerId,
        level,
        award: share,
        bonus,
        total: share + bonus,
      })
    }
    i = j + 1
  }
  return lines
}

// ---------------------------------------------------------------------------
// Full day scoring
// ---------------------------------------------------------------------------

// Applies one day's scoring. Returns a state ready for the next day
// (phase 'draw') or game over after day 3.
export function scoreDay(state: GameState, rng: RNG): GameState {
  if (state.phase !== 'scoring') {
    throw new Error('scoreDay requires the scoring phase')
  }

  const shipLines = scoreShipPayments(state)
  const trackLines: { commodity: Commodity; lines: TrackAwardLine[] }[] = []

  // Ship value payments first.
  const players1 = state.players.map((p) => {
    const line = shipLines.find((l) => l.playerId === p.id)!
    return { ...p, money: p.money + line.payment }
  })

  // Then each commodity: advance counters and pay awards + bonuses.
  let players = players1
  for (const commodity of COMMODITIES) {
    const lines = scoreCommodityTrack({ ...state, players }, commodity)
    trackLines.push({ commodity, lines })
    const byId = new Map(lines.map((l) => [l.playerId, l]))
    players = players.map((p) => {
      const line = byId.get(p.id)!
      const level = Math.min(TRACK_LEVELS - 1, p.trackLevels[commodity] + countOf(p, commodity))
      return {
        ...p,
        money: p.money + line.total,
        trackLevels: { ...p.trackLevels, [commodity]: level },
      }
    })
  }

  const scoringLog: ScoringEvent[] = [
    ...(state.scoringLog ?? []),
    { type: 'ship_value', lines: shipLines },
    ...trackLines.map((t) => ({ type: 'track' as const, commodity: t.commodity, lines: t.lines })),
    {
      type: 'day_total',
      day: state.day,
      totals: players.map((p) => ({ playerId: p.id, money: p.money })),
    },
  ]

  const scored: GameState = {
    ...state,
    players,
    scoringLog,
    history: state.history.slice(),
  }

  if (state.day >= DAYS) {
    const sorted = [...players].sort((a, b) => b.money - a.money)
    const max = sorted[0].money
    const winnerIds = sorted.filter((p) => p.money === max).map((p) => p.id)
    const totals = sorted.map((p) => ({ playerId: p.id, money: p.money }))
    return {
      ...scored,
      phase: 'game_over',
      finalResults: totals,
      scoringLog: [...scoringLog, { type: 'game_over', winnerIds, totals }],
      history: [...state.history, { type: 'game_over', winnerIds, ts: Date.now() }],
    }
  }

  return startNextDay(scored, rng)
}
