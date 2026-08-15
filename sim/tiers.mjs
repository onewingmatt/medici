// Test medium tier order at 3p-6p: easy < medium < hard.
// Usage: npx tsx sim/tiers.mjs [games]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
import { lotValue } from '../shared/bot.ts'

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

// medium limit override
function medLimit(state, playerId, group, rng, mode) {
  const a = state.auction
  const v = lotValue(state, playerId, group)
  let limit
  if (mode === 'cur') limit = Math.floor(v * (0.9 + rng() * 0.1))
  else if (mode === 'mid') limit = Math.floor(v * (0.85 + rng() * 0.1))
  else if (mode === 'low') limit = Math.floor(v * (0.8 + rng() * 0.15))
  else limit = Math.max(0, Math.floor(v) - 1)
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const N = Number(process.argv[2] ?? 250)
// field: alternating hard/medium/easy around the table
for (const mode of ['cur', 'mid', 'low', 'hard']) {
  for (const count of [3, 4, 5, 6]) {
    const wins = { hard: 0, medium: 0, easy: 0 }
    let played = 0
    for (let s = 1; s <= N; s++) {
      const rng = mulberry32(s * 100 + count)
      const ids = Array.from({ length: count }, (_, i) => `p${i}`)
      const tiers = ['hard', 'medium', 'easy']
      const diffs = Array.from({ length: count }, (_, i) => tiers[i % 3])
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
        if (g.phase === 'auction' && me.difficulty === 'medium') {
          const amt = medLimit(g, actorId, g.auction.group, rng, mode)
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
    console.log(`med=${mode.padEnd(4)} ${count}p: hard=${wins.hard} medium=${wins.medium} easy=${wins.easy} (${played})`)
  }
}
