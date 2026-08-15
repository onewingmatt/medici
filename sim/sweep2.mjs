// Sweep draw + bid strategies for hard bot vs easy.
// Usage: npx tsx sim/sweep2.mjs [gamesPerVariant]
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

// slotCost by strategy name
function slotFor(name, spaces, groupLen, oppRoom) {
  const after = spaces - groupLen
  switch (name) {
    case 'none': return 0
    case '5/3/1': return after <= 0 ? 5 : after <= 2 ? 3 : after <= 4 ? 1 : 0
    case '6/4/2': return after <= 0 ? 6 : after <= 2 ? 4 : after <= 4 ? 2 : 0
    case 'fill6': return after <= 0 ? 6 : after <= 2 ? 3 : 0
    case 'always2': return 2
    default: return 0
  }
}

// draw strategies for hard
function hardShouldDraw(state, playerId, strategy) {
  const me = state.players.find((p) => p.id === playerId)
  if (state.group.length >= 3) return false
  if (state.deck.length === 0) return false
  if (me.ship.length + state.group.length + 1 > 7) return false
  if (state.group.length === 0) return true
  const gv = state.group.reduce((s, c) => s + c.value, 0)
  switch (strategy) {
    case 'oneOnly': return false // always stop after 1 card
    case 'twoOnly': return state.group.length < 2
    case 'stopGood3': return gv >= 3 ? false : state.group.length < 2 // stop when group good
    case 'stopGood4': return gv >= 4 ? false : true // stop when group good, else draw more
    case 'ev23': { // baseline: original hard behavior
      const seen = []
      for (const e of state.history) {
        if (e.type === 'draw') seen.push(e.card)
        else if (e.type === 'sold') seen.push(...e.group)
        else if (e.type === 'discarded') seen.push(...e.group)
        else if (e.type === 'free_fill') seen.push(...e.cards)
      }
      seen.push(...state.group)
      if (state.auction) seen.push(...state.auction.group)
      const seenVal = seen.reduce((s, c) => s + c.value, 0)
      const unseen = 36 - seen.length
      const ev = unseen > 0 ? (110 - seenVal) / unseen : 0
      return ev >= 2.3
    }
    default: return true
  }
}

const BID_STRATS = ['none', '5/3/1', '6/4/2', 'fill6', 'always2']
const DRAW_STRATS = ['ev23', 'oneOnly', 'twoOnly', 'stopGood3', 'stopGood4']
const N = Number(process.argv[2] ?? 150)

for (const d of DRAW_STRATS) {
  for (const b of BID_STRATS) {
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
        if (actorId === 'hard') {
          if (g.phase === 'draw') {
            action = hardShouldDraw(g, actorId, d) ? { kind: 'draw' } : { kind: 'stop' }
          } else if (g.phase === 'auction') {
            const myValue = hardValue(g, actorId, g.auction.group)
            const spaces = 7 - me.ship.length
            const oppRoom = Math.max(0, ...g.players.filter((p) => p.id !== actorId).map((p) => 7 - p.ship.length))
            const sc = slotFor(b, spaces, g.auction.group.length, oppRoom)
            const limit = Math.max(0, Math.floor(myValue) - 1 - sc)
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
    }
    console.log(`draw=${d.padEnd(9)} bid=${b.padEnd(8)} hard=${String(hWins).padStart(3)} easy=${String(eWins).padStart(3)} (${played})`)
  }
}
