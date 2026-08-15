// Quick experiment: is the easy-bot dominance a difficulty effect or a seat effect?
// Usage: npx tsx sim/experiment.mjs
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

function playGame(ids, difficulties, seed, maxActions = 50000) {
  const rng = mulberry32(seed)
  let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
  for (let i = 0; i < g.players.length; i++) {
    g.players[i].isBot = true
    g.players[i].difficulty = difficulties[i]
  }
  let actions = 0
  while (g.phase !== 'game_over' && actions < maxActions) {
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
  return { winner: g.finalResults[0].playerId, money: g.players.map(p => ({ id: p.id, money: p.money })), results: g.finalResults }
}

const N = 300
const difficulties = ['easy', 'medium', 'hard']

// Experiment 1: 2p easy vs hard, both seat orders
for (const [d0, d1] of [['easy', 'hard'], ['hard', 'easy']]) {
  let eWins = 0, hWins = 0, ties = 0, played = 0
  for (let s = 1; s <= N; s++) {
    const r = playGame(['p0', 'p1'], [d0, d1], s * 100 + 1)
    if (!r) continue
    played++
    const w = r.winner
    if (w === 'p0') eWins++
    else if (w === 'p1') hWins++
    else ties++
  }
  console.log(`2p ${d0}(p0) vs ${d1}(p1): ${d0}=${eWins} ${d1}=${hWins} ties=${ties} (played ${played})`)
}

// Experiment 2: 2p medium vs hard
for (const [d0, d1] of [['medium', 'hard'], ['hard', 'medium']]) {
  let aWins = 0, bWins = 0, ties = 0, played = 0
  for (let s = 1; s <= N; s++) {
    const r = playGame(['p0', 'p1'], [d0, d1], s * 100 + 2)
    if (!r) continue
    played++
    const w = r.winner
    if (w === 'p0') aWins++
    else if (w === 'p1') bWins++
    else ties++
  }
  console.log(`2p ${d0}(p0) vs ${d1}(p1): ${d0}=${aWins} ${d1}=${bWins} ties=${ties} (played ${played})`)
}

// Experiment 3: 2p easy vs medium
for (const [d0, d1] of [['easy', 'medium'], ['medium', 'easy']]) {
  let aWins = 0, bWins = 0, ties = 0, played = 0
  for (let s = 1; s <= N; s++) {
    const r = playGame(['p0', 'p1'], [d0, d1], s * 100 + 3)
    if (!r) continue
    played++
    const w = r.winner
    if (w === 'p0') aWins++
    else if (w === 'p1') bWins++
    else ties++
  }
  console.log(`2p ${d0}(p0) vs ${d1}(p1): ${d0}=${aWins} ${d1}=${bWins} ties=${ties} (played ${played})`)
}

// Experiment 4: 6p homogeneous — who wins when everyone is the same difficulty?
for (const d of difficulties) {
  const wins = {}
  let played = 0
  for (let s = 1; s <= N; s++) {
    const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    const r = playGame(ids, ids.map(() => d), s * 100 + 4)
    if (!r) continue
    played++
    wins[r.winner] = (wins[r.winner] ?? 0) + 1
  }
  console.log(`6p all-${d}: `, JSON.stringify(Object.entries(wins).sort((a, b) => b[1] - a[1])), `(played ${played})`)
}
