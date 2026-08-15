// Trace one 2p bot game to understand the easy-bot dominance.
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

const rng = mulberry32(102)
let g = createGame([{ id: 'p0', name: 'p0' }, { id: 'p1', name: 'p1' }], rng)
g.players[0].isBot = true; g.players[0].difficulty = 'easy'
g.players[1].isBot = true; g.players[1].difficulty = 'medium'

let actions = 0
while (g.phase !== 'game_over' && actions < 2000) {
  actions++
  if (g.phase === 'scoring') {
    const before = g.players.map((p) => `${p.id}:${p.money}`)
    g = scoreDay(g, rng)
    console.log(`--- DAY ${g.day - 1} scored --- before: [${before}] after: [${g.players.map((p) => `${p.id}:${p.money}`)}]`)
    console.log('   ship:', JSON.stringify(g.scoringLog.filter(e => e.type === 'ship_value').at(-1)))
    continue
  }
  let actorId = null
  let phase = g.phase
  if (phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
  else if (phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
  if (!actorId) { console.log('NO ACTOR', phase); break }
  const me = g.players.find((p) => p.id === actorId)
  const action = botAction(g, actorId, me.difficulty, rng)
  let result
  if (action.kind === 'draw') result = drawCard(g, actorId)
  else if (action.kind === 'stop') result = stopDraw(g, actorId)
  else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
  else result = pass(g, actorId)
  if (!result.ok) {
    if (phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) }
    else if (phase === 'auction') result = pass(g, actorId)
  }
  if (!result.ok) { console.log('STUCK', phase, result.error); break }
  g = result.state
  // log interesting transitions
  const last = g.history.at(-1)
  if (last.type === 'auction_start') {
    console.log(`turn p${g.playerOrder[g.selectorIndex]} group=[${last.group.map(c => `${c.commodity[0]}${c.value}`)}] order=${last.bidOrder}`)
  } else if (last.type === 'sold') {
    console.log(`   SOLD to ${last.buyerId} for ${last.amount}: [${last.group.map(c => `${c.commodity[0]}${c.value}`)}] money=[${g.players.map(p => `${p.id}:${p.money}`)}] ships=[${g.players.map(p => `${p.id}:${p.ship.length}`)}]`)
  } else if (last.type === 'discarded') {
    console.log(`   DISCARDED: [${last.group.map(c => `${c.commodity[0]}${c.value}`)}]`)
  } else if (last.type === 'day_end') {
    console.log(`   day ends (${last.reason})`)
  }
}

console.log('=== FINAL ===')
console.log(g.finalResults)
