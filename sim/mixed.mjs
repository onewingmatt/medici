// Mixed-field win rates by difficulty at each player count.
// Alternates hard/easy around the table; counts total wins per difficulty.
// Usage: npx tsx sim/mixed.mjs [games]
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

function play(ids, diffs, seed) {
  const rng = mulberry32(seed)
  let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
  for (let i = 0; i < g.players.length; i++) {
    g.players[i].isBot = true
    g.players[i].difficulty = diffs[i]
  }
  let actions = 0
  while (g.phase !== 'game_over' && actions < 50000) {
    actions++
    if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
    let actorId = null
    if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
    else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    if (!actorId) return null
    const me = g.players.find((p) => p.id === actorId)
    const action = botAction(g, actorId, me.difficulty, rng)
    let result
    if (action.kind === 'draw') result = drawCard(g, actorId)
    else if (action.kind === 'stop') result = stopDraw(g, actorId)
    else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
    else result = pass(g, actorId)
    if (!result.ok) {
      if (g.phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) }
      else if (g.phase === 'auction') result = pass(g, actorId)
    }
    if (!result.ok) return null
    g = result.state
  }
  if (g.phase !== 'game_over') return null
  return g.finalResults[0].playerId
}

const N = Number(process.argv[2] ?? 200)
for (const count of [2, 3, 4, 5, 6]) {
  const wins = { hard: 0, easy: 0, medium: 0 }
  let played = 0
  for (let s = 1; s <= N; s++) {
    const ids = Array.from({ length: count }, (_, i) => `p${i}`)
    const diffs = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 'hard' : 'easy'))
    const w = play(ids, diffs, s * 100 + count)
    if (!w) continue
    played++
    const wIdx = ids.indexOf(w)
    wins[diffs[wIdx]]++
  }
  console.log(`${count}p (alternating hard/easy): hard=${wins.hard} easy=${wins.easy} (${played})`)
}
