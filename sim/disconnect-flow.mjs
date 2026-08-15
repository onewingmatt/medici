// Disconnect-skip check: two humans + a bot. Guest B disconnects mid-game;
// the game must keep moving past B's turn and complete. If the room stalls
// on B's disconnected turn, the timeout fires and this fails.
// Run: URL=http://localhost:PORT node sim/disconnect-flow.mjs
import { io } from 'socket.io-client'

const URL = process.env.URL ?? 'http://localhost:3198'
const a = io(URL, { transports: ['websocket'], reconnection: false })
const b = io(URL, { transports: ['websocket'], reconnection: false })

let hostId = null
let guestId = null
let bGone = false
let boards = 0
let gameOver = false
const errors = []

a.on('connect', () => a.emit('room:create', { playerName: 'A' }))
a.on('room:state', (data) => {
  if (!data.reconnectToken || data.players.length > 1) return
  hostId = data.yourId
  b.emit('room:join', { code: data.code, playerName: 'B' })
})
b.on('room:state', (data) => {
  if (!data.reconnectToken) return
  guestId = data.yourId
  a.emit('add_bot', { difficulty: 'medium' })
  a.emit('game:start')
})

a.on('game:board', (data) => {
  boards++
  if (bGone) {
    const g = data.game
    const actor = g.phase === 'draw'
      ? g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])?.id
      : g.auction?.bidOrder[g.auction.currentBidderIndex] ?? null
    console.log(`[post-disc] board #${boards} phase=${g.phase} day=${g.day} actor=${actor}`)
  }
  maybeActA(data.game)
})
b.on('game:board', (data) => {
  if (!bGone) maybeActB(data.game)
})

// B leaves abruptly mid-game (simulating a disconnect, not a clean leave).
a.on('game:board', (data) => {
  if (bGone || !guestId) return
  const g = data.game
  if (g.phase === 'draw' || g.phase === 'auction') {
    const actor = g.phase === 'draw'
      ? g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])
      : g.auction && g.players.find((p) => p.id === g.auction.bidOrder[g.auction.currentBidderIndex])
    if (actor && actor.id === guestId) {
      console.log(`B disconnects on their turn (guestId=${guestId})`)
      bGone = true
      b.disconnect()
      b.close?.()
      // If the game stalls, no more boards arrive and we time out.
      setTimeout(() => {
        if (!gameOver) {
          console.error('FAIL: game stalled after B disconnected (no game_over)')
          process.exit(1)
        }
      }, 60000)
    }
  }
})

a.on('game:scored', (data) => {
  // Day boundary: the server pauses for the summary. The test has no overlay,
  // so continue after a short read.
  if (data.game.phase !== 'game_over') {
    setTimeout(() => a.emit('game:continue'), 300)
  }
})

a.on('game_over', () => {
  gameOver = true
  if (!bGone) {
    console.error('FAIL: game ended before B disconnected')
    process.exit(1)
  }
  if (errors.length) {
    console.error('FAIL: server errors:', errors)
    process.exit(1)
  }
  console.log(`PASS: game completed after B disconnected mid-turn (${boards} board events)`)
  process.exit(0)
})

for (const s of [a, b]) {
  s.on('error', (d) => errors.push(d.message))
}

// A's policy: draw 1, stop, pass. B's policy: draw 1, stop, bid 1 then pass.
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
function maybeActB(g) {
  if (!guestId || g.phase === 'game_over' || g.phase === 'scoring') return
  if (g.phase === 'draw') {
    const sel = g.players.find((p) => p.id === g.playerOrder[g.selectorIndex])
    if (sel && sel.id === guestId) {
      if (g.group.length === 0) b.emit('game:draw')
      else b.emit('game:stopDraw')
    }
  } else if (g.phase === 'auction') {
    if (g.auction && g.auction.bidOrder[g.auction.currentBidderIndex] === guestId) {
      b.emit('auction:pass')
    }
  }
}

const timeout = setTimeout(() => {
  console.error(`FAIL: timed out (bGone=${bGone} boards=${boards} gameOver=${gameOver})`)
  process.exit(1)
}, 120000)
timeout.unref?.()
