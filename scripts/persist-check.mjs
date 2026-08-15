// Persistence check: PHASE=create makes a room + starts a game, saves the
// reconnect credentials to /tmp/medici-persist.json, exits.
// PHASE=reconnect loads them, reconnects to a fresh server, and verifies the
// room + game state were restored from SQLite.
import { io } from 'socket.io-client'
import { readFileSync, writeFileSync } from 'fs'

const URL = process.env.URL ?? 'http://localhost:3102'
const phase = process.env.PHASE ?? 'create'
const socket = io(URL, { transports: ['websocket'], reconnection: false })

const timeout = setTimeout(() => {
  console.error(`FAIL: ${phase} timed out`)
  process.exit(1)
}, 20000)
timeout.unref?.()

if (phase === 'create') {
  socket.on('connect', () => socket.emit('room:create', { playerName: 'P' }))
  socket.on('room:state', (data) => {
    if (!data.reconnectToken) return
    socket.emit('add_bot', { difficulty: 'hard' })
    socket.emit('game:start')
    writeFileSync(
      '/tmp/medici-persist.json',
      JSON.stringify({ code: data.code, token: data.reconnectToken, yourId: data.yourId }),
    )
    console.log('created room', data.code, 'and started a game')
    // wait a moment for the bot to act + persistence to flush
    setTimeout(() => {
      socket.close()
      process.exit(0)
    }, 1500)
  })
} else {
  const creds = JSON.parse(readFileSync('/tmp/medici-persist.json', 'utf8'))
  socket.on('connect', () => {
    socket.emit('room:reconnect', { code: creds.code, reconnectToken: creds.token })
  })
  socket.on('room:state', (data) => {
    if (!data.reconnectToken) return
    if (!data.inGame) {
      console.error('FAIL: room restored but not in game')
      process.exit(1)
    }
    console.log('room restored:', data.code, 'players:', data.players.length)
  })
  socket.on('game:board', (data) => {
    const g = data.game
    console.log(
      'game restored: day',
      g.day,
      'phase',
      g.phase,
      'deckCount',
      g.deckCount,
      'deck hidden:',
      g.deck === undefined,
    )
    if (g.deck === undefined && g.deckCount > 0 && g.players.length > 0) {
      console.log('PASS: persistence restored the in-progress game')
      process.exit(0)
    } else {
      console.error('FAIL: restored game state incomplete')
      process.exit(1)
    }
  })
}
