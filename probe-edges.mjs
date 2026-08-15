// Edge-case probe — constructs states directly and checks hand-computed
// expectations for tie division, mixed zero-level awards, exact-fit bids,
// and stalled/deadlock paths. Prints PASS/FAIL per case.
import { createGame, drawCard, stopDraw, bid, pass } from './shared/engine.ts'
import { scoreShipPayments, scoreCommodityTrack, scoreDay } from './shared/scoring.ts'
import { CARDS_PER_DAY, SHIP_PAYMENTS } from './shared/constants.ts'

let passCount = 0
let failCount = 0
function check(desc, cond, got) {
  if (cond) { passCount++; console.log(`  PASS ${desc}`) }
  else { failCount++; console.log(`  FAIL ${desc}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ''}`) }
}
function mulberry32(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// helper: build a game with ships preset
function makeGame(n, ships, money = []) {
  const rng = mulberry32(1)
  let g = createGame(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), rng)
  g.players = g.players.map((p, i) => {
    const vals = ships[i] ?? []
    return {
      ...p,
      money: money[i] ?? p.money,
      ship: vals.map((v, k) => ({ id: `p${i}c${k}`, commodity: k === 0 ? 'cloth' : 'fur', value: v })),
    }
  })
  return g
}

console.log('=== Ship payment ties ===')
// A. 4p three-way top tie (totals 20,20,20,10): 1st-3rd tie = (30+20+10)/3 = 20 each; 4th 0
{
  const g = makeGame(4, [[5,5,5,5], [5,5,5,5], [5,5,5,5], [5,5]], [40,40,40,40])
  const lines = scoreShipPayments(g)
  const pay = lines.map(l => l.payment)
  check('A. 4p 3-way top tie: each 20', JSON.stringify(pay) === JSON.stringify([20,20,20,0]), pay)
}
// B. 2p all-equal (totals 15,15): (20+0)/2 = 10 each
{
  const g = makeGame(2, [[5,5,5], [5,5,5]], [40,40])
  const pay = scoreShipPayments(g).map(l => l.payment)
  check('B. 2p all-equal tie: 10 each', JSON.stringify(pay) === JSON.stringify([10,10]), pay)
}
// C. 6p: 30,20,15,10,5,0 exact (no ties)
{
  const g = makeGame(6, [[9],[8],[7],[6],[5],[4]], [40,40,40,40,40,40])
  const pay = scoreShipPayments(g).map(l => l.payment)
  check('C. 6p untied 30/20/15/10/5/0', JSON.stringify(pay) === JSON.stringify([30,20,15,10,5,0]), pay)
}
// D. 6p middle tie (totals 30,30,20,20,10,10): (30+20)/2=25, (15+10)/2=12, (5+0)/2=2 (round down)
{
  const g = makeGame(6, [[10],[10],[9],[9],[8],[8]], [40,40,40,40,40,40])
  const pay = scoreShipPayments(g).map(l => l.payment)
  check('D. 6p pairwise ties 25/25/12/12/2/2', JSON.stringify(pay) === JSON.stringify([25,25,12,12,2,2]), pay)
}

console.log('=== Track awards (mixed zero-level) ===')
// E. one player above, two at zero: highest 10; second = zero-tie split 5/2 -> 2 each
{
  const g = makeGame(3, [[],[],[]], [40,40,40])
  g.players[0].trackLevels = { cloth: 1, fur: 0, grain: 0, dye: 0, spice: 0 }
  const lines = scoreCommodityTrack(g, 'cloth')
  const totals = lines.map(l => l.total)
  check('E. 1-above + 2-zero: 10,2,2', JSON.stringify(totals) === JSON.stringify([10,2,2]), totals)
}
// F. all zero: 3-way tie 10+5 /3 = 5 each
{
  const g = makeGame(3, [[],[],[]], [40,40,40])
  const lines = scoreCommodityTrack(g, 'cloth')
  const totals = lines.map(l => l.total)
  check('F. all-zero 3-way: 5 each', JSON.stringify(totals) === JSON.stringify([5,5,5]), totals)
}
// G. 2p second place = 0: A 2 cards, B 1 card
{
  const g = makeGame(2, [[],[],[]], [40,40])
  g.players[0].trackLevels = { cloth: 2, fur: 0, grain: 0, dye: 0, spice: 0 }
  g.players[1].trackLevels = { cloth: 1, fur: 0, grain: 0, dye: 0, spice: 0 }
  const totals = scoreCommodityTrack(g, 'cloth').map(l => l.total)
  check('G. 2p second=0: 10,0', JSON.stringify(totals) === JSON.stringify([10,0]), totals)
}

console.log('=== Stalled / deadlock paths ===')
// H. Selector has room but all others 0 money -> first draw ends day 'stalled'
{
  const rng = mulberry32(7)
  let g = createGame(['p0','p1','p2'].map((id, i) => ({ id, name: id })), rng)
  g.players[1].money = 0
  g.players[2].money = 0
  g.selectorIndex = 0
  const r = drawCard(g, 'p0')
  check('H. no other bidder -> stalled day end', r.ok === true && r.state.phase === 'scoring' && r.state.dayEnded === true && r.state.history.some(e => e.type === 'day_end' && e.reason === 'stalled'), { ok: r.ok, phase: r.state?.phase, reason: r.state?.history?.filter(e => e.type === 'day_end').map(e => e.reason) })
}
// I. can draw first card when one other has money
{
  const rng = mulberry32(7)
  let g = createGame(['p0','p1','p2'].map((id, i) => ({ id, name: id })), rng)
  g.players[1].money = 0
  g.selectorIndex = 0
  const r = drawCard(g, 'p0')
  check('I. one bidder with money -> can draw', r.ok === true, r)
}
// J. exact-fit bid allowed (group fills ship exactly): bid accepted, loads on resolution
{
  const rng = mulberry32(3)
  let g = createGame(['p0','p1'].map((id, i) => ({ id, name: id })), rng)
  g.players[0].ship = [{ id: 'x1', commodity: 'cloth', value: 1 }, { id: 'x2', commodity: 'fur', value: 2 }, { id: 'x3', commodity: 'grain', value: 3 }, { id: 'x4', commodity: 'dye', value: 4 }]
  g.selectorIndex = 0
  const r1 = drawCard(g, 'p0')
  if (r1.ok) {
    const r2 = stopDraw(r1.state, 'p0')
    if (r2.ok) {
      const r3 = bid(r2.state, 'p1', 1)
      check('J. exact-fit bid accepted (p1 4+1=5)', r3.ok === true && r3.state.auction?.highBidderId === 'p1', r3.ok ? 'accepted' : r3.error)
    } else check('J. stopDraw failed', false, r2)
  } else check('J. drawCard failed', false, r1)
}

console.log('=== Deck edge ===')
// K. free fill with exact fit: p0 4, p1 4, p2 0; deck 3; p0 draws 1 -> p1 wins -> roomy=[p2] -> p2 fills from remaining 2
{
  const rng = mulberry32(5)
  let g = createGame(['p0','p1','p2'].map((id, i) => ({ id, name: id })), rng)
  g.players[0].ship = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, commodity: 'cloth', value: 1 }))
  g.players[1].ship = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, commodity: 'fur', value: 1 }))
  g.deck = [
    { id: 'd1', commodity: 'grain', value: 2 },
    { id: 'd2', commodity: 'dye', value: 3 },
    { id: 'd3', commodity: 'spice', value: 4 },
  ]
  g.selectorIndex = 0
  const r1 = drawCard(g, 'p0')
  if (r1.ok) {
    const r2 = stopDraw(r1.state, 'p0')
    if (r2.ok) {
      const r3 = bid(r2.state, 'p1', 1)
      if (r3.ok) {
        // bid order after p0 draws: p1 (4+1 fits), p2 (0+1 fits), p0 last. p1 bids; p2 + p0 pass.
        const r4 = pass(r3.state, 'p2')
        const r5 = r4.ok ? pass(r4.state, 'p0') : r4
        if (r5.ok && r5.state.phase === 'scoring') {
          const p2 = r5.state.players[2]
          check('K. free fill exact: p2 got 2 cards, deck 0', p2.ship.length === 2 && r5.state.deck.length === 0, { ship: p2.ship.length, deck: r5.state.deck.length, phase: r5.state.phase })
        } else check('K. resolution failed', false, r5)
      } else check('K. p1 bid failed', false, r3)
    } else check('K. stopDraw failed', false, r2)
  } else check('K. drawCard failed', false, r1)
}

console.log(`\n=== ${passCount}/${passCount + failCount} passed ===`)
process.exit(failCount > 0 ? 1 : 0)
