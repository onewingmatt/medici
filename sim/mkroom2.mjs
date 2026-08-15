// Create a room, add bots, start, and have the observer act for a few seconds
// so ships get loaded, then go silent (game stalls at the human's next turn).
import { io } from 'socket.io-client'
const socket = io('http://localhost:3199', { transports: ['websocket'], reconnection: false })
let yourId = null
let state = null
let done = false
let roomCode = null
let roomToken = null

socket.on('connect', () => socket.emit('room:create', { playerName: 'VisualTester' }))

socket.on('room:state', (d) => {
  if (d.reconnectToken && !yourId) {
    yourId = d.yourId
    roomCode = d.code
    roomToken = d.reconnectToken
    if (!d.inGame) {
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('add_bot', { difficulty: 'medium' })
      socket.emit('add_bot', { difficulty: 'hard' })
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('game:start')
    }
  }
})

function act() {
  if (!state || done || !yourId) return
  if (state.phase === 'game_over' || state.phase === 'scoring') return
  if (state.phase === 'draw') {
    const sel = state.players.find((p) => p.id === state.playerOrder[state.selectorIndex])
    if (sel && sel.id === yourId) {
      if (state.group.length === 0) socket.emit('game:draw')
      else socket.emit('game:stopDraw')
    }
    return
  }
  if (state.phase === 'auction') {
    const a = state.auction
    if (a && a.bidOrder[a.currentBidderIndex] === yourId) socket.emit('auction:pass')
  }
}

socket.on('game:board', (d) => { state = d.game; act() })
socket.on('game:scored', (d) => { state = d.game; act() })

setTimeout(() => {
  done = true
  console.log(JSON.stringify({ code: roomCode, token: roomToken, yourId }))
}, 9000)

setTimeout(() => process.exit(1), 25000)
