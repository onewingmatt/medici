// Crash-reconnect check, phase CREATE: make a room + start a game, write the
// reconnect credentials, then WAIT (do not close) so the server keeps a live
// socketId in the persisted blob — simulating a server crash (kill -9) rather
// than the graceful close that persist-check.mjs uses.
// The orchestrator kills the server after this prints "ready for kill".
import { io } from 'socket.io-client'
import { writeFileSync } from 'fs'

const URL = process.env.URL ?? 'http://localhost:3197'
const socket = io(URL, { transports: ['websocket'], reconnection: false })

const timeout = setTimeout(() => {
  console.error('create timed out')
  process.exit(1)
}, 60000)
timeout.unref?.()

socket.on('connect', () => socket.emit('room:create', { playerName: 'CrashP' }))
socket.on('room:state', (data) => {
  if (!data.reconnectToken) return
  socket.emit('add_bot', { difficulty: 'hard' })
  socket.emit('game:start')
  writeFileSync(
    '/tmp/medici-persist.json',
    JSON.stringify({ code: data.code, token: data.reconnectToken, yourId: data.yourId }),
  )
  console.log('ready for kill', data.code)
  // keep the socket open — the orchestrator kills the SERVER, not us
})
