// Reconnect-skip regression: B disconnects on their turn (skip auto-plays
// them), then B reconnects and MUST be able to act on subsequent turns.
// Before the fix, the skip left the game player marked disconnected, so the
// engine skipped B forever after reconnecting.
// Run: URL=http://localhost:PORT node sim/reconnect-flow.mjs
import { io } from 'socket.io-client'

const URL = process.env.URL ?? 'http://localhost:3195'
const a = io(URL, { transports: ['websocket'], reconnection: false })
let b = io(URL, { transports: ['websocket'], reconnection: false })

let hostId = null
let guestId = null
let guestToken = null
let guestCode = null
let bGone = false
let bBack = false
let bTurnsActed = 0
let gameOver = false
const errors = []

a.on('connect', () => a.emit('room:create', { playerName: 'A' }))
a.on('room:state', (data) => {
  if (!data.reconnectToken || data.players.length > 1) return
  hostId = data.yourId
  guestCode = data.code
  b.emit('room:join', { code: data.code, playerName: 'B' })
})
b.on('room:state', (data) => {
  if (!data.reconnectToken) return
  guestId = data.yourId
  guestToken = data.reconnectToken
  a.emit('add_bot', { difficulty: 'medium' })
  a.emit('game:start')
})

a.on('game:board', (data) => {
  if (bBack) {
    const g = data.game
    const actor = g.phase === 'draw'
      ? g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])?.id
      : g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    console.log(`[A board] phase=${g.phase} day=${g.day} actor=${actor} disc=${g.players.map(p=>p.id+':'+p.disconnected).join(',')}`)
  }
  maybeActA(data.game)
  maybeDisconnectB(data.game)
})
b.on('game:board', (data) => {
  if (!bGone) maybeActB(data.game)
})

// B disconnects when it is B's turn.
function maybeDisconnectB(g) {
  if (bGone || !guestId) return
  if (g.phase !== 'draw' && g.phase !== 'auction') return
  const actor = g.phase === 'draw'
    ? g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])
    : g.auction && g.players.find((p) => p.id === g.auction.bidOrder[g.auction.currentBidderIndex])
  if (actor && actor.id === guestId) {
    console.log('B disconnects on their turn')
    bGone = true
    b.disconnect()
    b.close?.()
    // give the server time to skip B, then reconnect B with the token
    setTimeout(() => {
      console.log(`reconnecting with code=${guestCode} token=${guestToken?.slice(0,8)}`)
      b = io(URL, { transports: ['websocket'], reconnection: false })
      b.on('connect', () => {
        console.log('B new socket connected')
        b.emit('room:reconnect', { code: guestCode, reconnectToken: guestToken })
      })
      b.on('room:state', (d) => {
        if (d.reconnectToken) {
          bBack = true
          console.log('B reconnected')
        }
      })
      b.on('game:board', (d) => {
        const g = d.game
        const actor = g.phase === 'draw'
          ? g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])?.id
          : g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
        console.log(`[B board] phase=${g.phase} day=${g.day} actor=${actor} myTurn=${actor === guestId} disc=${g.players.map(p=>p.id+':'+p.disconnected).join(',')}`)
        if (bBack) maybeActB(d.game)
      })
      b.on('game:scored', (d) => {
        if (d.game.phase !== 'game_over') {
          setTimeout(() => b.emit('game:continue'), 200)
        }
        if (bBack) maybeActB(d.game)
      })
      b.on('error', (d) => errors.push(d.message))
      setTimeout(() => {
        if (!bBack) {
          console.error('FAIL: B did not reconnect')
          process.exit(1)
        }
      }, 10000)
    }, 500)
  }
}

// B acts when it is B's turn; count how many times B successfully acted.
function maybeActB(g) {
  if (!guestId || !bBack || g.phase === 'game_over' || g.phase === 'scoring') return
  if (g.phase === 'draw') {
    const sel = g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])
    if (sel && sel.id === guestId) {
      if (g.group.length === 0) b.emit('game:draw')
      else b.emit('game:stopDraw')
      bTurnsActed++
    }
  } else if (g.phase === 'auction') {
    if (g.auction && g.auction.bidOrder[g.auction.currentBidderIndex] === guestId) {
      b.emit('auction:pass')
      bTurnsActed++
    }
  }
}
function maybeActA(g) {
  if (!hostId || g.phase === 'game_over' || g.phase === 'scoring') return
  if (g.phase === 'draw') {
    const sel = g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])
    if (sel && sel.id === hostId) {
      if (g.group.length === 0) a.emit('game:draw')
      else a.emit('game:stopDraw')
    }
  } else if (g.phase === 'auction') {
    if (g.auction && g.auction.bidOrder[g.auction.currentBidderIndex] === hostId) {
      a.emit('auction:pass')
    }
  }
}

a.on('game:scored', (data) => {
  if (data.game.phase !== 'game_over') {
    setTimeout(() => a.emit('game:continue'), 200)
  }
  // the scored state IS the next day's board — act if it's A's turn
  maybeActA(data.game)
})

a.on('game_over', () => {
  gameOver = true
  if (!bBack) {
    console.error('FAIL: B never reconnected')
    process.exit(1)
  }
  if (bTurnsActed < 1) {
    console.error(`FAIL: B never acted after reconnecting (bTurnsActed=${bTurnsActed})`)
    process.exit(1)
  }
  if (errors.length) {
    console.error('FAIL: server errors:', errors)
    process.exit(1)
  }
  console.log(`PASS: B acted ${bTurnsActed} times after reconnecting; game completed`)
  process.exit(0)
})

for (const s of [a, b]) s.on('error', (d) => errors.push(d.message))

const timeout = setTimeout(() => {
  console.error(`FAIL: timed out (bGone=${bGone} bBack=${bBack} turns=${bTurnsActed} gameOver=${gameOver})`)
  process.exit(1)
}, 120000)
timeout.unref?.()
