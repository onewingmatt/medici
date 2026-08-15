// Sweep shipUpside and trackUpside multipliers for hard at 4p/6p vs easy.
// Usage: npx tsx sim/sweepup.mjs [games]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'

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

function hardLimit(state, playerId, group, sm, tm) {
  const me = state.players.find((p) => p.id === playerId)
  const a = state.auction
  const n = state.players.length
  const pay = n === 2 ? 20 : n === 3 ? 30 : n === 4 ? 30 : n === 5 ? 30 : 30
  const valueSum = group.reduce((s, c) => s + c.value, 0)
  const myShip = me.ship.reduce((s, c) => s + c.value, 0)
  const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
  const gap = maxOppShip - myShip
  let shipUp = 0
  if (sm > 0 && pay > 0) {
    if (gap > 0) shipUp = valueSum >= gap ? pay * sm : pay * sm * 0.6 * (valueSum / Math.max(1, gap))
    else shipUp = pay * sm * 0.33 * Math.min(1, valueSum / Math.max(1, myShip))
  }
  let trackUp = 0
  if (tm > 0) {
    const seen = new Set()
    for (const c of group) {
      if (c.commodity === 'gold' || seen.has(c.commodity)) continue
      seen.add(c.commodity)
      const cnt = group.filter((x) => x.commodity === c.commodity).length
      const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
      const ol = me.trackLevels[c.commodity]
      trackUp += tm * ([0, 0, 0, 0, 0, 5, 10, 20][nl] - [0, 0, 0, 0, 0, 5, 10, 20][ol])
      const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
      if (nl >= maxOppTrack) trackUp += tm * 3
      else if (nl + 1 >= maxOppTrack) trackUp += tm
    }
  }
  const limit = Math.max(0, Math.floor(valueSum + shipUp + trackUp) - 1)
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const N = Number(process.argv[2] ?? 200)
const COMBOS = [
  [0, 0], [0.05, 0], [0.1, 0], [0.15, 0], [0.2, 0], [0.3, 0],
  [0, 0.5], [0, 1],
  [0.05, 0.5], [0.1, 0.5], [0.05, 1], [0.1, 1], [0.15, 0.5], [0.2, 0.5],
  [0.05, 0.25], [0.1, 0.25], [0.15, 0.25],
]
for (const [sm, tm] of COMBOS) {
  for (const count of [4, 6]) {
    const wins = { hard: 0, easy: 0 }
    let played = 0
    for (let s = 1; s <= N; s++) {
      const rng = mulberry32(s * 100 + count)
      const ids = Array.from({ length: count }, (_, i) => `p${i}`)
      const diffs = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 'hard' : 'easy'))
      let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
      for (let i = 0; i < g.players.length; i++) { g.players[i].isBot = true; g.players[i].difficulty = diffs[i] }
      let actions = 0
      let ok = true
      while (g.phase !== 'game_over' && actions < 50000) {
        actions++
        if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
        let actorId = null
        if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
        else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
        if (!actorId) { ok = false; break }
        const me = g.players.find((p) => p.id === actorId)
        let action
        if (g.phase === 'auction' && me.difficulty === 'hard') {
          const amt = hardLimit(g, actorId, g.auction.group, sm, tm)
          action = amt === null ? { kind: 'pass' } : { kind: 'bid', amount: amt }
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
        if (!result.ok) { ok = false; break }
        g = result.state
      }
      if (!ok || g.phase !== 'game_over') continue
      played++
      const w = g.finalResults[0].playerId
      wins[diffs[ids.indexOf(w)]]++
    }
    console.log(`sm=${String(sm).padEnd(4)} tm=${String(tm).padEnd(4)} ${count}p: hard=${String(wins.hard).padStart(3)} easy=${String(wins.easy).padStart(3)} (${played})`)
  }
}
