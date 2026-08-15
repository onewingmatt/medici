// Headless bot simulation — drive a full game engine-side (no sockets) to
// isolate engine/bot bugs from server/scheduling bugs.
// Usage: node sim/headless.mjs [seed] [players]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction, isBotsTurn } from '../shared/bot.ts'

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

const seed = Number(process.argv[2] ?? 42)
const count = Number(process.argv[3] ?? 4)
const rng = mulberry32(seed)
const ids = Array.from({ length: count }, (_, i) => `p${i}`)
const difficulties = ['easy', 'medium', 'hard']

let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
for (let i = 0; i < g.players.length; i++) {
  g.players[i].isBot = true
  g.players[i].difficulty = difficulties[i % 3]
}

let actions = 0
const MAX_ACTIONS = 50000
let days = 1
let lastPhase = ''
while (g.phase !== 'game_over' && actions < MAX_ACTIONS) {
  actions++
  if (actions % 1000 === 0) {
    console.log(`[${actions}] day=${g.day} phase=${g.phase} deck=${g.deck.length} ships=${g.players.map((p) => p.ship.length).join(',')}`)
  }
  if (g.phase === 'scoring') {
    g = scoreDay(g, rng)
    days++
    continue
  }
  let actorId = null
  if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
  else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
  if (!actorId) {
    console.error('STUCK: no actor', g.phase)
    break
  }
  const me = g.players.find((p) => p.id === actorId)
  const action = botAction(g, actorId, me.difficulty, rng)
  let result
  if (action.kind === 'draw') result = drawCard(g, actorId)
  else if (action.kind === 'stop') result = stopDraw(g, actorId)
  else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
  else result = pass(g, actorId)
  if (!result.ok) {
    // fallback like the server does
    if (g.phase === 'draw') result = stopDraw(g, actorId)
    else if (g.phase === 'auction') result = pass(g, actorId)
  }
  if (!result.ok) {
    console.error(`STUCK: bot ${actorId} action ${JSON.stringify(action)} failed: ${result.error}; fallback also failed`)
    console.error(`phase=${g.phase} group=${JSON.stringify(g.group)} auction=${JSON.stringify(g.auction)}`)
    break
  }
  g = result.state
}

console.log('=== RESULT ===')
console.log(`actions=${actions} days=${days} phase=${g.phase}`)
if (g.phase === 'game_over') {
  const final = g.finalResults
  console.log(`final results: ${final.map((r) => `${r.playerId}:${r.money}`).join('  ')}`)
  console.log('SIM OK')
  process.exit(0)
} else {
  console.log('SIM HUNG')
  process.exit(1)
}
