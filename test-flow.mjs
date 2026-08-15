// Socket integration test — drives a full Medici game server-side:
// create room → add bots → start → let bots play → verify events fire,
// especially game_over with final results.
//
// The observer human plays a fixed legal policy: draw 1 card, always pass.
// Run: URL=http://localhost:PORT BOT_DELAY_MS=50 node test-flow.mjs
import { io } from 'socket.io-client'

const URL = process.env.URL ?? 'http://localhost:3101'
const socket = io(URL, { transports: ['websocket'], reconnection: false })

let yourId = null
let reconnectToken = null
let state = null
let gameOver = false
let scoreEvents = 0
let boardEvents = 0
const errors = []

const log = (name, data) => console.log(`[${name}]`, JSON.stringify(data))

socket.on('connect', () => {
  console.log('connected, creating room')
  socket.emit('room:create', { playerName: 'Observer' })
})

socket.on('room:state', (data) => {
  if (data.reconnectToken) {
    yourId = data.yourId
    reconnectToken = data.reconnectToken
    log('room:state', { code: data.code, players: data.players.length, yourId })
    if (!data.inGame && data.players.length === 1) {
      // fill with three bots of each difficulty, then start
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('add_bot', { difficulty: 'medium' })
      socket.emit('add_bot', { difficulty: 'hard' })
      socket.emit('game:start')
    }
  }
})

socket.on('game:board', (data) => {
  boardEvents++
  applyState(data.game)
})

socket.on('game:scored', (data) => {
  scoreEvents++
  applyState(data.game)
})

socket.on('game_over', (data) => {
  log('game_over', { results: data.results, winnerIds: data.results.filter((r, i, a) => r.money === a[0].money).map((r) => r.playerId) })
  gameOver = true
  const results = data.results
  if (!results || results.length === 0) {
    console.error('FAIL: game_over without results')
    process.exit(1)
  }
  const max = results[0].money
  const winners = results.filter((r) => r.money === max)
  const dayTotals = (state?.scoringLog ?? []).filter((e) => e.type === 'day_total')
  console.log(`final: ${results.length} players, winner(s): ${winners.map((w) => w.playerId).join(',')} @ ${max}`)
  if (dayTotals.length !== 3) {
    console.error(`FAIL: expected 3 day_total events, got ${dayTotals.length}`)
    process.exit(1)
  }
  if (errors.length) {
    console.error('FAIL: server errors during game:', errors)
    process.exit(1)
  }
  console.log(`PASS: full game completed — ${boardEvents} board events, ${scoreEvents} scoring events, 3 days scored`)
  console.log(`PASS: deck hidden from client (deckCount=${state?.deckCount})`)
  socket.close()
  process.exit(0)
})

socket.on('error', (data) => {
  errors.push(data.message)
  console.error('server error:', data.message)
})

function applyState(g) {
  state = g
  if (boardEvents === 1 && g.deck !== undefined) {
    console.error('FAIL: deck is exposed to the client')
    process.exit(1)
  }
  maybeAct()
}

// Observer policy: draw 1 card, stop, then pass every auction.
// Each action waits for the server's next broadcast before acting again.
function maybeAct() {
  if (!state || gameOver) return
  if (state.phase === 'game_over' || state.phase === 'scoring') return
  if (!yourId) return

  if (state.phase === 'draw') {
    const sel = state.players.find((p) => p.id === state.playerOrder[state.selectorIndex])
    if (sel && sel.id === yourId) {
      if (state.group.length === 0) socket.emit('game:draw')
      else socket.emit('game:stopDraw')
    }
    return
  }
  if (state.phase === 'auction') {
    const auction = state.auction
    if (auction && auction.bidOrder[auction.currentBidderIndex] === yourId) {
      socket.emit('auction:pass')
    }
  }
}

const timeout = setTimeout(() => {
  console.error(`FAIL: timed out (boardEvents=${boardEvents}, scoreEvents=${scoreEvents}, gameOver=${gameOver})`)
  console.error('errors:', errors)
  process.exit(1)
}, Number(process.env.TIMEOUT_MS ?? 120000))
timeout.unref?.()
