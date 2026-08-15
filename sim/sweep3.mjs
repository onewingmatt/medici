// Sweep a minimum-value BAR for hard bids: only bid when net value is high
// enough that the lot is worth a ship slot. Usage: npx tsx sim/sweep3.mjs [games]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
import { SHIP_PAYMENTS, TRACK_BONUS_BY_LEVEL } from '../shared/constants.ts'

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

function hardValue(state, playerId, group) {
  const me = state.players.find((p) => p.id === playerId)
  const groupValue = group.reduce((s, c) => s + c.value, 0)
  const myShip = me.ship.reduce((s, c) => s + c.value, 0)
  const pay = SHIP_PAYMENTS[state.players.length]?.[0] ?? 0
  const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
  const gap = maxOppShip - myShip
  let shipUp = 0
  if (pay > 0) {
    if (gap > 0) shipUp = groupValue >= gap ? Math.floor(pay * 0.45) : Math.floor(pay * 0.3 * (groupValue / gap))
    else shipUp = Math.floor(pay * 0.15 * Math.min(1, groupValue / Math.max(1, myShip)))
  }
  let trackUp = 0
  const seen = new Set()
  for (const c of group) {
    if (c.commodity === 'gold' || seen.has(c.commodity)) continue
    seen.add(c.commodity)
    const cnt = group.filter((x) => x.commodity === c.commodity).length
    const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
    const ol = me.trackLevels[c.commodity]
    trackUp += (TRACK_BONUS_BY_LEVEL[nl] ?? 0) - (TRACK_BONUS_BY_LEVEL[ol] ?? 0)
    const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
    if (nl >= maxOppTrack) trackUp += 3
    else if (nl + 1 >= maxOppTrack) trackUp += 1
  }
  return groupValue + shipUp + trackUp
}

const N = Number(process.argv[2] ?? 200)
const BARS = [0, 2, 3, 4, 5, 6]

for (const bar of BARS) {
  let hWins = 0, eWins = 0, played = 0, hCards = 0, eCards = 0
  for (let s = 1; s <= N; s++) {
    const rng = mulberry32(s * 100 + 1)
    let g = createGame([{ id: 'hard', name: 'hard' }, { id: 'easy', name: 'easy' }], rng)
    g.players[0].isBot = true; g.players[0].difficulty = 'hard'
    g.players[1].isBot = true; g.players[1].difficulty = 'easy'
    let actions = 0
    let ok = true
    while (g.phase !== 'game_over' && actions < 5000) {
      actions++
      if (g.phase === 'scoring') { g = scoreDay(g, rng); continue }
      let actorId = null
      if (g.phase === 'draw') actorId = g.playerOrder[g.selectorIndex]
      else if (g.phase === 'auction') actorId = g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
      if (!actorId) { ok = false; break }
      const me = g.players.find((p) => p.id === actorId)
      let action
      if (actorId === 'hard') {
        if (g.phase === 'draw') {
          action = { kind: 'draw' } // baseline draw: draw up to 3 (ev23 replaced by simple)
        } else if (g.phase === 'auction') {
          const myValue = hardValue(g, actorId, g.auction.group)
          const spaces = 7 - me.ship.length
          const after = spaces - g.auction.group.length
          let sc = 0
          if (after <= 0) sc = 5
          else if (after <= 2) sc = 3
          else if (after <= 4) sc = 1
          const limit = Math.max(0, Math.floor(myValue) - 1 - sc - bar)
          const high = g.auction.highBid
          if (limit <= high) action = { kind: 'pass' }
          else action = { kind: 'bid', amount: Math.max(high + 1, 1) }
        } else action = { kind: 'pass' }
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
    const [w] = g.finalResults
    if (w.playerId === 'hard') hWins++; else eWins++
    for (const e of g.history) {
      if (e.type === 'sold') {
        if (e.buyerId === 'hard') hCards += e.group.length
        else eCards += e.group.length
      }
    }
  }
  console.log(`bar=${bar}: hard=${hWins} easy=${eWins} (${played}) hardCards/g=${(hCards / played).toFixed(1)} easyCards/g=${(eCards / played).toFixed(1)}`)
}
