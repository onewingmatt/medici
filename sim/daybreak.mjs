// Print day-end ship values for a handful of easy-vs-hard games.
// Usage: npx tsx sim/daybreak.mjs [games]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
import { shipValue } from '../shared/scoring.ts'

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

const N = Number(process.argv[2] ?? 6)
const days = [0, 0, 0, 0]  // easy ship-value wins by day (days 1-3), 4th = total
for (let s = 1; s <= N; s++) {
  const rng = mulberry32(s * 100 + 1)
  let g = createGame([{ id: 'easy', name: 'easy' }, { id: 'hard', name: 'hard' }], rng)
  g.players[0].isBot = true; g.players[0].difficulty = 'easy'
  g.players[1].isBot = true; g.players[1].difficulty = 'hard'
  let actions = 0
  let line = `game ${s}: `
  while (g.phase !== 'game_over' && actions < 5000) {
    actions++
    if (g.phase === 'scoring') {
      const ev = g.players.find(p => p.id === 'easy').ship.reduce((s2, c) => s2 + c.value, 0)
      const hv = g.players.find(p => p.id === 'hard').ship.reduce((s2, c) => s2 + c.value, 0)
      line += `D${g.day} [easy ${ev} vs hard ${hv}] `
      days[g.day - 1] += (ev > hv ? 1 : 0)
      g = scoreDay(g, rng)
      continue
    }
    let actorId = null
    if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
    else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    if (!actorId) break
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
    if (!result.ok) break
    g = result.state
  }
  if (g.phase !== 'game_over') continue
  const e = g.finalResults.find(r => r.playerId === 'easy')
  const h = g.finalResults.find(r => r.playerId === 'hard')
  console.log(line + `-> final easy ${e.money} hard ${h.money} (winner ${e.money > h.money ? 'easy' : 'hard'})`)
}
console.log('easy ship-value day wins:', days.slice(0, 3), 'out of', N)
