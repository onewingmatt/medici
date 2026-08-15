// Test: hard with value-only bids (no upsides) vs easy at each player count.
// Usage: npx tsx sim/valueonly.mjs [games]
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

// hardMode: 'orig' = full valuation (current bot.ts), 'value' = valueSum only, 'valueTrack' = value + track, 'valueShip' = value + ship
function hardLimit(state, playerId, group, mode) {
  const me = state.players.find((p) => p.id === playerId)
  const a = state.auction
  const valueSum = group.reduce((s, c) => s + c.value, 0)
  let limit = valueSum
  if (mode === 'value') {
    limit = valueSum
  } else if (mode === 'valueShip' || mode === 'full') {
    // shipUpside (original)
    const pay = 30 // 6p max; use actual
    const myShip = me.ship.reduce((s, c) => s + c.value, 0)
    const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
    const gap = maxOppShip - myShip
    let shipUp = 0
    if (gap > 0) shipUp = valueSum >= gap ? Math.floor(30 * 0.45) : Math.floor(30 * 0.3 * (valueSum / Math.max(1, gap)))
    else shipUp = Math.floor(30 * 0.15 * Math.min(1, valueSum / Math.max(1, myShip)))
    limit = valueSum + shipUp
    if (mode === 'full') {
      // trackUpside
      const seen = new Set()
      for (const c of group) {
        if (c.commodity === 'gold' || seen.has(c.commodity)) continue
        seen.add(c.commodity)
        const cnt = group.filter((x) => x.commodity === c.commodity).length
        const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
        const ol = me.trackLevels[c.commodity]
        limit += [0, 0, 0, 0, 0, 5, 10, 20][nl] - [0, 0, 0, 0, 0, 5, 10, 20][ol]
        const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
        if (nl >= maxOppTrack) limit += 3
        else if (nl + 1 >= maxOppTrack) limit += 1
      }
      // deny
      const oppVals = state.players.filter((p) => p.id !== playerId).map(() => 0)
      // slot cost
      const spaces = 7 - me.ship.length
      const after = spaces - group.length
      if (after <= 0) limit -= 5
      else if (after <= 2) limit -= 3
      else if (after <= 4) limit -= 1
    }
  }
  limit = Math.max(0, Math.floor(limit) - 1)
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const N = Number(process.argv[2] ?? 200)
for (const mode of ['value', 'valueShip', 'full']) {
  for (const count of [4, 5, 6]) {
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
          const amt = hardLimit(g, actorId, g.auction.group, mode)
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
    console.log(`mode=${mode.padEnd(10)} ${count}p: hard=${wins.hard} easy=${wins.easy} (${played})`)
  }
}
