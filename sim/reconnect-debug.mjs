import { io } from 'socket.io-client'
import { readFileSync } from 'fs'
const creds = JSON.parse(readFileSync('/tmp/medici-persist.json', 'utf8'))
const URL = process.env.URL ?? 'http://localhost:3197'
const socket = io(URL, { transports: ['websocket'], reconnection: false })
socket.on('connect', () => { console.log('connected, emitting reconnect'); socket.emit('room:reconnect', { code: creds.code, reconnectToken: creds.token }) })
socket.on('room:state', (d) => { console.log('room:state', JSON.stringify({ code: d.code, inGame: d.inGame, players: d.players.length })); process.exit(0) })
socket.on('game:board', (d) => { console.log('game:board day', d.game.day) })
socket.on('error', (d) => { console.log('ERROR', d.message); process.exit(1) })
socket.on('connect_error', (e) => { console.log('connect_error', e.message); process.exit(1) })
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 8000)
