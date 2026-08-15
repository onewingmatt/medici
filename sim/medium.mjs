// Test medium limit formulas vs easy and vs hard.
// Usage: npx tsx sim/medium.mjs [games]
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

// mode: 'cur' = current medium (0.9-1.0), 'lo' = 0.8-1.0, 'lo2' = 0.75-0.95, 'hardlike' = myValue-1-noise
function mediumLimit(state, playerId, group, rng, mode) {
  const a = state.auction
  const v = lotValue(state, playerId, group)
  let limit
  if (mode === 'cur') limit = Math.floor(v * (0.9 + rng() * 0.1))
  else if (mode === 'lo') limit = Math.floor(v * (0.8 + rng() * 0.2))
  else if (mode === 'lo2') limit = Math.floor(v * (0.75 + rng() * 0.2))
  else limit = Math.max(0, Math.floor(v) - 1 - Math.floor(rng() * 3))
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const N = Number(process.argv[2] ?? 250)
for (const mode of ['cur', 'lo', 'lo2', 'hardlike']) {
  for (const opp of ['easy', 'hard']) {
    const wins = { med: 0, opp: 0 }
    let played = 0
    for (let s = 1; s <= N; s++) {
      const rng = mulberry32(s * 100 + 7)
      let g = createGame([{ id: 'med', name: 'med' }, { id: opp, name: opp }], rng)
      g.players[0].isBot = true; g.players[0].difficulty = 'medium'
      g.players[1].isBot = true; g.players[1].difficulty = opp
      let actions = 0
      let ok = true
      while (g.phase !== 'game_over' && actions < 5000) {
        actions++
        if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
        let actorId = null
        if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
        else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
        if (!actorId) { ok = false; break }
        const me = g.players.find((p) => p.id === actorId)
        let action
        if (g.phase === 'auction' && actorId === 'med') {
          const amt = mediumLimit(g, actorId, g.auction.group, rng, mode)
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
      if (w === 'med') wins.med++; else wins.opp++
    }
    console.log(`mode=${mode.padEnd(8)} med vs ${opp}: med=${wins.med} ${opp}=${wins.opp} (${played})`)
  }
}
