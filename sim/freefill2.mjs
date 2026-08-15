import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const N = 300
let ffEasy = 0, ffHard = 0, ffEasyVal = 0, ffHardVal = 0
for (let s = 1; s <= N; s++) {
  const rng = mulberry32(s * 100 + 1)
  let g = createGame([{ id: 'easy', name: 'easy' }, { id: 'hard', name: 'hard' }], rng)
  g.players[0].isBot = true; g.players[0].difficulty = 'easy'
  g.players[1].isBot = true; g.players[1].difficulty = 'hard'
  let actions = 0
  while (g.phase !== 'game_over' && actions < 5000) {
    actions++
    if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
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
    if (!result.ok) { if (g.phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) } else if (g.phase === 'auction') result = pass(g, actorId) }
    if (!result.ok) break
    g = result.state
  }
  for (const e of g.history) {
    if (e.type === 'free_fill') {
      const v = e.cards.reduce((x, c) => x + c.value, 0)
      if (e.playerId === 'easy') { ffEasy++; ffEasyVal += v } else { ffHard++; ffHardVal += v }
    }
  }
}
console.log(`free fills: easy ${ffEasy} (val ${ffEasyVal}) hard ${ffHard} (val ${ffHardVal})`)
