// Socket integration check for the summary pause + speed control:
// 1. After day 1 scoring, bots must NOT act (paused) until game:continue.
// 2. After game:continue, bots resume and the game completes.
// Run: URL=http://localhost:PORT BOT_DELAY_MS=50 node sim/pause-flow.mjs
import { io } from 'socket.io-client'

const URL = process.env.URL ?? 'http://localhost:3101'
const socket = io(URL, { transports: ['websocket'], reconnection: false })

let yourId = null
let state = null
let gameOver = false
let scoreEvents = 0
let boardEvents = 0
let pausedAt = 0
let continuedAt = 0
let boardSinceScored = 0
let boardSinceContinue = 0
let verifiedPause = false
let verifiedResume = false
const errors = []
const log = (name, data) => console.log(`[${name}]`, JSON.stringify(data))

socket.on('connect', () => {
  console.log('connected, creating room')
  socket.emit('room:create', { playerName: 'Observer' })
})

socket.on('room:state', (data) => {
  if (data.reconnectToken) {
    yourId = data.yourId
    if (!data.inGame && data.players.length === 1) {
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('add_bot', { difficulty: 'medium' })
      socket.emit('add_bot', { difficulty: 'hard' })
      socket.emit('game:start')
    }
  }
})

socket.on('game:board', (data) => {
  boardEvents++
  if (pausedAt && !continuedAt) boardSinceScored++
  if (continuedAt) boardSinceContinue++
  applyState(data.game)
})

socket.on('game:scored', (data) => {
  scoreEvents++
  applyState(data.game)
  if (data.game.phase === 'game_over') return
  // First day-boundary score (day 2 starting): bots must be paused.
  if (!pausedAt) {
    pausedAt = Date.now()
    boardSinceScored = 0
    setTimeout(() => {
      if (!verifiedPause) {
        if (boardSinceScored === 0) {
          console.log(`PASS: no bot activity for 2s after day ${data.game.day - 1} scoring (paused)`)
          verifiedPause = true
          socket.emit('game:continue')
          continuedAt = Date.now()
          boardSinceContinue = 0
          // also flip bots to fast for the rest of the game
          socket.emit('game:setSpeed', { fast: true })
          setTimeout(() => {
            if (boardSinceContinue === 0) {
              console.error('FAIL: no bot activity 4s after game:continue')
              process.exit(1)
            }
            verifiedResume = true
            console.log('PASS: bots resumed after game:continue')
          }, 4000)
        } else {
          console.error(`FAIL: bots acted under the summary (${boardSinceScored} board events)`)
          process.exit(1)
        }
      }
    }, 2000)
    return
  }
  // Later day boundaries: the pause applies again; the real client continues
  // when the human dismisses. Simulate that after a short reading delay.
  setTimeout(() => {
    if (!gameOver && data.game.day <= 3) socket.emit('game:continue')
  }, 400)
})

socket.on('game_over', (data) => {
  log('game_over', { results: data.results })
  gameOver = true
  const results = data.results
  if (!results || results.length === 0) {
    console.error('FAIL: game_over without results')
    process.exit(1)
  }
  if (!verifiedPause) {
    console.error('FAIL: pause was never verified')
    process.exit(1)
  }
  if (!verifiedResume) {
    console.error('FAIL: resume was never verified')
    process.exit(1)
  }
  if (errors.length) {
    console.error('FAIL: server errors:', errors)
    process.exit(1)
  }
  console.log(`PASS: full game completed with pause+resume — ${boardEvents} board events, ${scoreEvents} scoring events`)
  socket.close()
  process.exit(0)
})

socket.on('error', (data) => {
  errors.push(data.message)
  console.error('server error:', data.message)
})

function applyState(g) {
  state = g
  maybeAct()
}

// Observer policy: draw 1 card, stop, pass every auction. Suppressed while
// the summary is up (we are testing that the GAME waits, so we wait too).
function maybeAct() {
  if (!state || gameOver) return
  if (pausedAt && !continuedAt) return
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
  console.error(`FAIL: timed out (boardEvents=${boardEvents}, scoreEvents=${scoreEvents}, gameOver=${gameOver}, pause=${verifiedPause}, resume=${verifiedResume})`)
  process.exit(1)
}, Number(process.env.TIMEOUT_MS ?? 90000))
timeout.unref?.()
