import { io } from 'socket.io-client'
const socket = io('http://localhost:3199', { transports: ['websocket'], reconnection: false })
let code = null
socket.on('connect', () => socket.emit('room:create', { playerName: 'VisualTester' }))
socket.on('room:state', (d) => {
  if (d.reconnectToken && !code) {
    code = d.code
    if (!d.inGame && d.players.length === 1) {
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('add_bot', { difficulty: 'medium' })
      socket.emit('add_bot', { difficulty: 'hard' })
      socket.emit('add_bot', { difficulty: 'easy' })
      socket.emit('game:start')
      setTimeout(() => {
        console.log(JSON.stringify({ code: d.code, token: d.reconnectToken, yourId: d.yourId }))
        process.exit(0)
      }, 8000) // let bots play a bit so ships are loaded
    }
  }
})
setTimeout(() => { console.error('timeout'); process.exit(1) }, 15000)
