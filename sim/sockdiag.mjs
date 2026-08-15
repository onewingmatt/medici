import { io } from 'socket.io-client'
const s = io('http://localhost:3199', { transports: ['websocket'], reconnection: false })
s.on('connect', () => { console.log('connected', s.id); s.emit('room:create', { playerName: 'Diag' }) })
s.on('room:state', (d) => { console.log('room:state', d.code, d.yourId); process.exit(0) })
s.on('connect_error', (e) => { console.log('connect_error', e.message); process.exit(1) })
setTimeout(() => { console.log('timeout, no events'); process.exit(1) }, 8000)
