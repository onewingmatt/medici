// Deep trace: log every auction (group, bids, winner) for easy vs hard.
// Usage: npx tsx sim/trace3.mjs [seed]
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
let lastSold = null
while (g.phase !== 'game_over' && actions < 5000) {
  actions++
  if (g.phase === 'scoring') {
    const ev = g.players.find(p => p.id === 'easy').ship.reduce((s, c) => s + c.value, 0)
    const hv = g.players.find(p => p.id === 'hard').ship.reduce((s, c) => s + c.value, 0)
    console.log(`  >>> DAY ${g.day} end: ship easy ${ev} vs hard ${hv} | money easy ${g.players.find(p=>p.id==='easy').money} hard ${g.players.find(p=>p.id==='hard').money}`)
    g = scoreDay(g, rng)
    continue
  }
  let actorId = null
  const phase = g.phase
  if (phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
  else if (phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
  if (!actorId) { console.log('NO ACTOR', phase); break }
  const me = g.players.find((p) => p.id === actorId)
  const action = botAction(g, actorId, me.difficulty, rng)
  if (phase === 'auction' && action.kind === 'bid') {
    const grp = g.auction.group.map(c => `${c.commodity[0]}${c.value}`).join(',')
    console.log(`  bid: ${me.difficulty} offers ${action.amount} for [${grp}] high=${g.auction.highBid} sel=${g.auction.bidOrder.at(-1)}`)
  }
  if (phase === 'draw' && action.kind === 'stop') {
    const grp = g.group.map(c => `${c.commodity[0]}${c.value}`).join(',')
    console.log(`D${g.day} selector ${me.difficulty} STOPS with group [${grp}] ship=${me.ship.length}`)
  }
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
  const last = g.history.at(-1)
  if (last.type === 'sold') {
    const grp = last.group.map(c => `${c.commodity[0]}${c.value}`).join(',')
    const ev = g.players.find(p => p.id === 'easy').ship.length
    const hv = g.players.find(p => p.id === 'hard').ship.length
    console.log(`  -> SOLD [${grp}] to ${last.buyerId} for ${last.amount} | ships easy ${ev} hard ${hv}`)
  }
}
console.log('=== FINAL ===')
console.log(g.finalResults)
