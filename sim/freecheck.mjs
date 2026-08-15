import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const seed = 102
const rng = mulberry32(seed)
let g = createGame([{ id: 'easy', name: 'easy' }, { id: 'hard', name: 'hard' }], rng)
g.players[0].isBot = true; g.players[0].difficulty = 'easy'
g.players[1].isBot = true; g.players[1].difficulty = 'hard'
let actions = 0
const types = new Set()
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
  const last = g.history.at(-1)
  types.add(last.type)
  if (last.type === 'day_end') {
    console.log(`day_end reason=${last.reason} ships: easy ${g.players[0].ship.length} hard ${g.players[1].ship.length}`)
  }
  if (last.type === 'free_fill') {
    console.log(`FREE FILL -> ${last.playerId} cards=${last.cards.map(c=>c.value)} deckEmpty=${last.deckEmpty}`)
  }
}
console.log('types:', [...types])
