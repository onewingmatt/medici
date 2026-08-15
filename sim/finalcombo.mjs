// Final combo check: sm/tm with slot cost and deny on/off, 3-6p.
// Usage: npx tsx sim/finalcombo.mjs [games]
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

function hardLimit(state, playerId, group, sm, tm, slot, deny) {
  const me = state.players.find((p) => p.id === playerId)
  const a = state.auction
  const n = state.players.length
  const pay = n === 2 ? 20 : 30
  const cap = n === 2 ? 7 : 5
  const valueSum = group.reduce((s, c) => s + c.value, 0)
  const myShip = me.ship.reduce((s, c) => s + c.value, 0)
  const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
  const gap = maxOppShip - myShip
  let shipUp = 0
  if (sm > 0) {
    if (gap > 0) shipUp = valueSum >= gap ? pay * sm : pay * sm * 0.6 * (valueSum / Math.max(1, gap))
    else shipUp = pay * sm * 0.33 * Math.min(1, valueSum / Math.max(1, myShip))
  }
  let trackUp = 0
  if (tm > 0) {
    const seen = new Set()
    for (const c of group) {
      if (c.commodity === 'gold' || seen.has(c.commodity)) continue
      seen.add(c.commodity)
      const cnt = group.filter((x) => x.commodity === c.commodity).length
      const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
      const ol = me.trackLevels[c.commodity]
      trackUp += tm * ([0, 0, 0, 0, 0, 5, 10, 20][nl] - [0, 0, 0, 0, 0, 5, 10, 20][ol])
      const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
      if (nl >= maxOppTrack) trackUp += tm * 3
      else if (nl + 1 >= maxOppTrack) trackUp += tm
    }
  }
  let limit = valueSum + shipUp + trackUp
  let denyAmt = 0
  if (deny) {
    const oppVals = state.players.filter((p) => p.id !== playerId).map((p) => {
      // rough opp value: valueSum only (opponents are easy)
      return valueSum
    })
    const maxOpp = oppVals.length ? Math.max(...oppVals) : 0
    const denyGap = Math.max(0, maxOpp - limit)
    denyAmt = denyGap > 4 ? Math.min(3, Math.floor(denyGap * 0.15)) : 0
  }
  limit = limit + denyAmt
  if (slot) {
    const spaces = cap - me.ship.length
    const after = spaces - group.length
    if (after <= 0) limit -= 5
    else if (after <= 2) limit -= 3
    else if (after <= 4) limit -= 1
  }
  limit = Math.max(0, Math.floor(limit) - 1)
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const N = Number(process.argv[2] ?? 250)
const COMBOS = [
  [0.06, 0.2, 0, 0], [0.06, 0.2, 1, 0], [0.06, 0.2, 0, 1], [0.06, 0.2, 1, 1],
  [0.04, 0.25, 1, 0], [0.04, 0.25, 0, 0], [0.08, 0.2, 1, 0],
]
for (const [sm, tm, slot, deny] of COMBOS) {
  const rows = []
  for (const count of [3, 4, 5, 6]) {
    const wins = { hard: 0, easy: 0 }
    let played = 0
    for (let s = 1; s <= N; s++) {
      const rng = mulberry32(s * 100 + count)
      const ids = Array.from({ length: count }, (_, i) => `p${i}`)
      const diffs = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? 'hard' : 'easy'))
      let g = createGame(ids.map((id, i) => ({ id, name: id })), rng)
      for (let i = 0; i < g.players.length; i++) { g.players[i].isBot = true; g.players[i].difficulty = diffs[i] }
      let actions = 0
      let ok = true
      while (g.phase !== 'game_over' && actions < 50000) {
        actions++
        if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
        let actorId = null
        if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
        else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
        if (!actorId) { ok = false; break }
        const me = g.players.find((p) => p.id === actorId)
        let action
        if (g.phase === 'auction' && me.difficulty === 'hard') {
          const amt = hardLimit(g, actorId, g.auction.group, sm, tm, slot, deny)
          action = amt === null ? { kind: 'pass' } : { kind: 'bid', amount: amt }
        } else {
          action = botAction(g, actorId, me.difficulty, rng)
        }
        let result
        if (action.kind === 'draw') result = drawCard(g, actorId)
        else if (action.kind === 'stop') result = stopDraw(g, actorId)
        else if (action.kind === 'bid') result = bid(g, actorId, action.amount)
        else result = pass(g, actorId)
        if (!result.ok) {
          if (g.phase === 'draw') { result = stopDraw(g, actorId); if (!result.ok) result = drawCard(g, actorId) }
          else if (g.phase === 'auction') result = pass(g, actorId)
        }
        if (!result.ok) { ok = false; break }
        g = result.state
      }
      if (!ok || g.phase !== 'game_over') continue
      played++
      const w = g.finalResults[0].playerId
      wins[diffs[ids.indexOf(w)]]++
    }
    rows.push(`${count}p:${wins.hard}/${wins.easy}`)
  }
  console.log(`sm=${sm} tm=${tm} slot=${slot} deny=${deny}: ${rows.join(' ')}`)
}
