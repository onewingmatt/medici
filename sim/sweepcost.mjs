// Sweep slot-cost variants for hard bot: play hard vs easy, count wins.
// Usage: npx tsx sim/sweepcost.mjs [gamesPerVariant]
import { createGame, drawCard, stopDraw, bid, pass } from '../shared/engine.ts'
import { scoreDay } from '../shared/scoring.ts'
import { botAction } from '../shared/bot.ts'
import { SHIP_PAYMENTS } from '../shared/constants.ts'

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

// Custom hard chooseBid with configurable slot cost (0=off, 1=5/3/1, 2=oppRoom, 3=lead-aware)
function hardLimit(state, playerId, group, rng, variant) {
  const me = state.players.find((p) => p.id === playerId)
  const a = state.auction
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
  // track upside (simplified: same as bot.ts)
  let trackUp = 0
  const seen = new Set()
  for (const c of group) {
    if (c.commodity === 'gold' || seen.has(c.commodity)) continue
    seen.add(c.commodity)
    const cnt = group.filter((x) => x.commodity === c.commodity).length
    const nl = Math.min(7, me.trackLevels[c.commodity] + cnt)
    const ol = me.trackLevels[c.commodity]
    trackUp += ((TRACK_BONUS_BY_LEVEL[nl] ?? 0) - (TRACK_BONUS_BY_LEVEL[ol] ?? 0))
    const maxOppTrack = Math.max(...state.players.filter((p) => p.id !== playerId).map((p) => p.trackLevels[c.commodity]))
    if (nl >= maxOppTrack) trackUp += 3
    else if (nl + 1 >= maxOppTrack) trackUp += 1
  }
  const myValue = groupValue + shipUp + trackUp
  const spaces = 7 - me.ship.length // 2p capacity
  const oppRoom = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map((p) => 7 - p.ship.length))
  const after = spaces - group.length
  let slotCost = 0
  if (variant === 0) {
    slotCost = 0
  } else if (variant === 1) {
    if (after <= 0) slotCost = 5
    else if (after <= 2) slotCost = 3
    else if (after <= 4) slotCost = 1
  } else if (variant === 2) {
    if (after <= 0) slotCost = Math.min(9, oppRoom * 3)
    else if (after <= 2) slotCost = 3
  } else if (variant === 3) {
    // lead-aware: cost high when buying races me to become the filler
    if (after <= 0) slotCost = Math.min(9, oppRoom * 3)
    else if (spaces <= oppRoom) slotCost = 3
    else if (after <= oppRoom) slotCost = 2
  } else if (variant === 4) {
    if (after <= 0) slotCost = 6
    else if (after <= 2) slotCost = 4
    else if (after <= 4) slotCost = 2
  } else if (variant === 5) {
    if (after <= 0) slotCost = 7
    else if (after <= 2) slotCost = 4
    else if (after <= 4) slotCost = 1
  } else if (variant === 6) {
    // fill-aware + junk bar: never bid below a floor that grows as ship fills
    if (after <= 0) slotCost = 6
    else if (spaces <= 2) slotCost = 4
    else if (spaces <= 4) slotCost = 2
  }
  const limit = Math.max(0, Math.floor(myValue) - 1 - slotCost)
  if (limit <= (a?.highBid ?? 0)) return null
  return Math.max((a?.highBid ?? 0) + 1, 1)
}

const TRACK_BONUS_BY_LEVEL = [0, 0, 0, 0, 0, 5, 10, 20]

const VARIANTS = ['none', '5/3/1', 'oppRoom9/3', 'leadAware', '6/4/2', '7/4/1', 'fillAware']
const N = Number(process.argv[2] ?? 200)

for (let v = 0; v < VARIANTS.length; v++) {
  let hWins = 0, eWins = 0, played = 0
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
      if (actorId === 'hard' && g.phase === 'auction' && v > 0) {
        const amt = hardLimit(g, actorId, g.auction.group, rng, v)
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
    const [w] = g.finalResults
    if (w.playerId === 'hard') hWins++; else eWins++
  }
  console.log(`variant ${VARIANTS[v]}: hard=${hWins} easy=${eWins} (${played})`)
}
