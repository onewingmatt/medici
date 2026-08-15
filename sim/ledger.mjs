// Aggregate ledger: where does easy's edge come from? Runs many easy-vs-hard
// 2p games and tallies spending, ship payments, track awards, cards bought.
// Usage: npx tsx sim/ledger.mjs [games]
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

const N = Number(process.argv[2] ?? 200)
const agg = { easy: { spend: 0, buy: 0, val: 0, shipPay: 0, trackAward: 0, trackBonus: 0, cards: 0, final: 0, wins: 0 }, hard: { spend: 0, buy: 0, val: 0, shipPay: 0, trackAward: 0, trackBonus: 0, cards: 0, final: 0, wins: 0 } }

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
    if (!result.ok) {
      if (g.phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) }
      else if (g.phase === 'auction') result = pass(g, actorId)
    }
    if (!result.ok) break
    g = result.state
  }
  if (g.phase !== 'game_over') continue

  // Walk scoring log for the ledger
  for (const e of g.scoringLog ?? []) {
    if (e.type === 'ship_value') {
      for (const l of e.lines) { agg[l.playerId].shipPay += l.payment }
    } else if (e.type === 'track') {
      for (const l of e.lines) { agg[l.playerId].trackAward += l.award; agg[l.playerId].trackBonus += l.bonus }
    }
  }
  // Count actual purchases from history
  for (const e of g.history) {
    if (e.type === 'sold') {
      const a = agg[e.buyerId]
      a.buy++; a.spend += e.amount
      const v = e.group.reduce((s, c) => s + c.value, 0)
      a.val += v
      a.cards += e.group.length
    }
  }
  const [w] = g.finalResults
  agg[w.playerId].wins++
  agg.easy.final += g.finalResults.find(r => r.playerId === 'easy').money
  agg.hard.final += g.finalResults.find(r => r.playerId === 'hard').money
}

for (const who of ['easy', 'hard']) {
  const a = agg[who]
  console.log(`${who}: wins=${a.wins} buys=${a.buy} spend=${a.spend} cards=${a.cards} val=${a.val} avgLot=${(a.val / Math.max(1, a.buy)).toFixed(1)} shipPay=${a.shipPay} trackAward=${a.trackAward} trackBonus=${a.trackBonus} finalAvg=${(a.final / N).toFixed(1)}`)
}
