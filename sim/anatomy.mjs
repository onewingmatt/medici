// Per-day ship race anatomy: who free-fills, what it's worth, day winner.
// Usage: npx tsx sim/anatomy.mjs [games] [bar]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
import { SHIP_PAYMENTS, TRACK_BONUS_BY_LEVEL } from '../shared/constants.ts'

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hardValue(state, playerId, group) {
  const me = state.players.find((p) => p.id === playerId)
  const groupValue = group.reduce((s, c) => s + c.value, 0)
  const myShip = me.ship.reduce((s, c) => s + c.value, 0)
  const pay = SHIP_PAYMENTS[state.players.length]?.[0] ?? 0
  const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
  const gap = maxOppShip - myShip
  let shipUp = 0
  if (pay > 0) {
    if (gap > 0) shipUp = groupValue >= gap ? Math.floor(pay * 0.45) : Math.floor(pay * 0.3 * (groupValue / gap))
    else shipUp = Math.floor(pay * 0.15 * Math.min(1, groupValue / Math.max(1, myShip)))
  }
  let trackUp = 0
  const seen = new Set()
  for (const c of group) {
    if (c.commodity === 'gold' || seen.has(c.commodity)) continue
    seen.add(c.commodity)
    const cnt = group.filter((x) => x.commodity === c.commodity).length
    const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
    const ol = me.trackLevels[c.commodity]
    trackUp += (TRACK_BONUS_BY_LEVEL[nl] ?? 0) - (TRACK_BONUS_BY_LEVEL[ol] ?? 0)
    const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
    if (nl >= maxOppTrack) trackUp += 3
    else if (nl + 1 >= maxOppTrack) trackUp += 1
  }
  return groupValue + shipUp + trackUp
}

const N = Number(process.argv[2] ?? 300)
const BAR = Number(process.argv[3] ?? 6)
const stats = {
  day: [0, 0, 0], // easy strict wins per day
  ff: { easy: 0, hard: 0, easyVal: 0, hardVal: 0 },
  shipVal: { easy: 0, hard: 0 }, // avg ship value at day end
  boughtVal: { easy: 0, hard: 0 },
  fills: 0,
}
for (let s = 1; s <= N; s++) {
  const rng = mulberry32(s * 100 + 1)
  let g = createGame([{ id: 'hard', name: 'hard' }, { id: 'easy', name: 'easy' }], rng)
  g.players[0].isBot = true; g.players[0].difficulty = 'hard'
  g.players[1].isBot = true; g.players[1].difficulty = 'easy'
  let actions = 0
  while (g.phase !== 'game_over' && actions < 5000) {
    actions++
    if (g.phase === 'scoring') {
      const ev = g.players.find(p => p.id === 'easy').ship.reduce((x, c) => x + c.value, 0)
      const hv = g.players.find(p => p.id === 'hard').ship.reduce((x, c) => x + c.value, 0)
      stats.shipVal.easy += ev; stats.shipVal.hard += hv
      if (ev > hv) stats.day[g.day - 1]++
      g = scoreDay(g, rng)
      continue
    }
    let actorId = null
    if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
    else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    if (!actorId) break
    const me = g.players.find((p) => p.id === actorId)
    let action
    if (actorId === 'hard') {
      if (g.phase === 'draw') {
        action = { kind: 'draw' }
      } else if (g.phase === 'auction') {
        const myValue = hardValue(g, actorId, g.auction.group)
        const spaces = 7 - me.ship.length
        const after = spaces - g.auction.group.length
        let sc = 0
        if (after <= 0) sc = 5
        else if (after <= 2) sc = 3
        else if (after <= 4) sc = 1
        const limit = Math.max(0, Math.floor(myValue) - 1 - sc - BAR)
        const high = g.auction.highBid
        if (limit <= high) action = { kind: 'pass' }
        else action = { kind: 'bid', amount: Math.max(high + 1, 1) }
      } else action = { kind: 'pass' }
    } else {
      action = botAction(g, actorId, me.difficulty, rng)
    }
    let result
    if (action.kind === 'draw') result = drawCard(g, actorId)
    else if (action.kind === 'stop') result = stopDraw(g, actorId)
    else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
    else result = pass(g, actorId)
    if (!result.ok) {
      if (g.phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) }
      else if (g.phase === 'auction') result = pass(g, actorId)
    }
    if (!result.ok) break
    g = result.state
  }
  for (const e of g.history) {
    if (e.type === 'free_fill') {
      const v = e.cards.reduce((x, c) => x + c.value, 0)
      stats.fills++
      if (e.playerId === 'easy') { stats.ff.easy++; stats.ff.easyVal += v }
      else { stats.ff.hard++; stats.ff.hardVal += v }
    }
    if (e.type === 'sold') {
      const v = e.group.reduce((x, c) => x + c.value, 0)
      stats.boughtVal[e.buyerId] += v
    }
  }
}
console.log(`easy strict day wins: ${stats.day} / ${N}`)
console.log(`free fills: easy ${stats.ff.easy} (avg ${(stats.ff.easyVal / Math.max(1, stats.ff.easy)).toFixed(1)}) hard ${stats.ff.hard} (avg ${(stats.ff.hardVal / Math.max(1, stats.ff.hard)).toFixed(1)}) total ${stats.fills}`)
console.log(`day-end ship value avg: easy ${(stats.shipVal.easy / (N * 3)).toFixed(1)} hard ${(stats.shipVal.hard / (N * 3)).toFixed(1)}`)
console.log(`bought value avg: easy ${(stats.boughtVal.easy / N).toFixed(1)} hard ${(stats.boughtVal.hard / N).toFixed(1)}`)
