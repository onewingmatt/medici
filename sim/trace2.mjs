// Trace easy vs hard 2p: which lots each bot wins and what they pay.
// Usage: npx tsx sim/trace2.mjs [seed]
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

const seed = Number(process.argv[2] ?? 102)
const rng = mulberry32(seed)
let g = createGame([{ id: 'easy', name: 'easy' }, { id: 'hard', name: 'hard' }], rng)
g.players[0].isBot = true; g.players[0].difficulty = 'easy'
g.players[1].isBot = true; g.players[1].difficulty = 'hard'

let actions = 0
let buysEasy = 0, buysHard = 0, spendEasy = 0, spendHard = 0
while (g.phase !== 'game_over' && actions < 5000) {
  actions++
  if (g.phase === 'scoring') {
    g = scoreDay(g, rng)
    continue
  }
  let actorId = null
  if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
  else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
  if (!actorId) { console.log('NO ACTOR', g.phase); break }
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
  if (!result.ok) { console.log('STUCK', g.phase, result.error); break }
  g = result.state
  const last = g.history.at(-1)
  if (last.type === 'sold') {
    const byId = new Map(g.players.map(p => [p.id, p]))
    const e = byId.get('easy'), h = byId.get('hard')
    if (last.buyerId === 'easy') { buysEasy++; spendEasy += last.amount }
    else { buysHard++; spendHard += last.amount }
    const ePick = last.group.map(c => `${c.commodity[0]}${c.value}`).join(',')
    console.log(`D${g.day} sel=${last.selectorId} group=[${ePick}] val=${last.group.reduce((s,c)=>s+c.value,0)} -> ${last.buyerId} for ${last.amount} | easy ${e.money} hard ${h.money} | ships easy ${e.ship.length} hard ${h.ship.length}`)
  }
}
console.log('=== FINAL ===')
console.log(`buys: easy=${buysEasy} (${spendEasy}) hard=${buysHard} (${spendHard})`)
console.log(g.finalResults)
