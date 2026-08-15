// Sweep 4: hard = draw 1 card only + quality floor on bids + slot cost.
// Usage: npx tsx sim/sweep4.mjs [games]
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

function hardValue(state, playerId, group, shipMode) {
  const me = state.players.find((p) => p.id === playerId)
  const groupValue = group.reduce((s, c) => s + c.value, 0)
  const myShip = me.ship.reduce((s, c) => s + c.value, 0)
  const pay = SHIP_PAYMENTS[state.players.length]?.[0] ?? 0
  const maxOppShip = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => p.ship.reduce((s, c) => s + c.value, 0)))
  const gap = maxOppShip - myShip
  let shipUp = 0
  if (pay > 0) {
    if (shipMode === 'orig') {
      if (gap > 0) shipUp = groupValue >= gap ? Math.floor(pay * 0.45) : Math.floor(pay * 0.3 * (groupValue / gap))
      else shipUp = Math.floor(pay * 0.15 * Math.min(1, groupValue / Math.max(1, myShip)))
    } else { // close
      const margin = Math.abs(gap)
      if (margin <= 2) shipUp = Math.floor(pay * 0.45)
      else if (gap > 0) shipUp = Math.floor(pay * 0.45 * Math.min(1, groupValue / gap))
      else shipUp = Math.floor(pay * 0.2 * Math.min(1, groupValue / margin))
    }
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
// strategies: draw ∈ {one, two}, floor ∈ {2,3,4}, shipMode ∈ {orig, close}, slot ∈ {0, 5/3/1}
const combos = []
for (const draw of ['one', 'two']) {
  for (const floor of [2, 3, 4]) {
    for (const shipMode of ['orig', 'close']) {
      for (const slot of [0, 1]) {
        combos.push({ draw, floor, shipMode, slot })
      }
    }
  }
}

for (const cfg of combos) {
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
          if (cfg.draw === 'one') action = g.group.length >= 1 ? { kind: 'stop' } : { kind: 'draw' }
          else action = g.group.length >= 2 ? { kind: 'stop' } : { kind: 'draw' }
        } else if (g.phase === 'auction') {
          const myValue = hardValue(g, actorId, g.auction.group, cfg.shipMode)
          const spaces = 7 - me.ship.length
          const after = spaces - g.auction.group.length
          let sc = 0
          if (cfg.slot === 1) {
            if (after <= 0) sc = 5
            else if (after <= 2) sc = 3
            else if (after <= 4) sc = 1
          }
          const limit = Math.max(0, Math.floor(myValue) - 1 - sc)
          const high = g.auction.highBid
          // floor: only bid when net value clears the floor
          if (limit <= high || Math.floor(myValue) - sc < cfg.floor) action = { kind: 'pass' }
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
  console.log(`draw=${cfg.draw} floor=${cfg.floor} ship=${cfg.shipMode} slot=${cfg.slot}: hard=${hWins} easy=${eWins} (${played}) hCards=${(hCards / Math.max(1, played)).toFixed(1)} eCards=${(eCards / Math.max(1, played)).toFixed(1)}`)
}
