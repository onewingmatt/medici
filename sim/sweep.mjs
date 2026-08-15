// Full-game bot simulation sweep — runs many complete games across player
// counts to verify endgame scoring and game completion for RULES-AUDIT.
// Usage: node sim/sweep.mjs [seeds] [maxCount]
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

const MAX_SEEDS = Number(process.argv[2] ?? 20)
const MAX_COUNT = Number(process.argv[3] ?? 6)
const difficulties = ['easy', 'medium', 'hard']
const MAX_ACTIONS = 50000

let total = 0
let completed = 0
let stuck = 0
const winners = new Map()
const moneyStats = { min: Infinity, max: -Infinity, sum: 0, n: 0 }
const dayEndReasons = new Map()

for (let seed = 1; seed <= MAX_SEEDS; seed++) {
  for (let count = 2; count <= MAX_COUNT; count++) {
    total++
    const rng = mulberry32(seed * 100 + count)
    const ids = Array.from({ length: count }, (_, i) => `p${i}`)
    let g = createGame(ids.map((id) => ({ id, name: id })), rng)
    for (let i = 0; i < g.players.length; i++) {
      g.players[i].isBot = true
      g.players[i].difficulty = difficulties[i % 3]
    }

    let actions = 0
    let ok = true
    while (g.phase !== 'game_over' && actions < MAX_ACTIONS) {
      actions++
      if (g.phase === 'scoring') {
        g = scoreDay(g, rng)
        continue
      }
      let actorId = null
      if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
      else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
      if (!actorId) {
        ok = false
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
        if (g.phase === 'draw') {
          result = stopDraw(g, actorId)
          if (!result.ok) result = drawCard(g, actorId)
        } else if (g.phase === 'auction') {
          result = pass(g, actorId)
        }
      }
      if (!result.ok) {
        ok = false
        console.error(`STUCK seed=${seed} count=${count} phase=${g.phase} err=${result.error}`)
        break
      }
      g = result.state
    }

    if (!ok || g.phase !== 'game_over') {
      stuck++
      continue
    }
    completed++
    for (const e of g.history) {
      if (e.type === 'day_end') dayEndReasons.set(e.reason, (dayEndReasons.get(e.reason) ?? 0) + 1)
    }
    const winner = g.finalResults[0]
    winners.set(winner.playerId, (winners.get(winner.playerId) ?? 0) + 1)
    moneyStats.min = Math.min(moneyStats.min, winner.money)
    moneyStats.max = Math.max(moneyStats.max, winner.money)
    moneyStats.sum += winner.money
    moneyStats.n++
  }
}

console.log('=== SWEEP RESULT ===')
console.log(`games: ${total}, completed: ${completed}, stuck: ${stuck}`)
console.log(`day end reasons:`, Object.fromEntries(dayEndReasons))
console.log(
  `winner money: min=${moneyStats.min} max=${moneyStats.max} avg=${(moneyStats.sum / moneyStats.n).toFixed(1)}`,
)
console.log(`winners by seat:`, Object.fromEntries([...winners].sort((a, b) => b[1] - a[1])))
process.exit(stuck === 0 && completed === total ? 0 : 1)
