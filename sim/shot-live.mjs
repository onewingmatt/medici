// End-to-end visual check: create a room via socket, drive the human for a
// few seconds so ships load, then screenshot the page at a chosen viewport.
// Usage: npx tsx sim/shot-live.mjs [width] [height]
import { io } from 'socket.io-client'
import { chromium } from 'playwright'

const W = Number(process.argv[2] ?? 1280)
const H = Number(process.argv[3] ?? 720)
const URL = 'http://localhost:3199'

// --- phase 1: drive a real game with the observer acting ---
const sio = io(URL, { transports: ['websocket'], reconnection: false })
let yourId = null
let roomCode = null
let roomToken = null
let state = null
let acting = true
const settled = new Promise((resolve) => {
  sio.on('connect', () => sio.emit('room:create', { playerName: 'VisualTester' }))
  sio.on('room:state', (d) => {
    if (d.reconnectToken && !yourId) {
      yourId = d.yourId
      roomCode = d.code
      roomToken = d.reconnectToken
      if (!d.inGame) {
        sio.emit('add_bot', { difficulty: 'easy' })
        sio.emit('add_bot', { difficulty: 'medium' })
        sio.emit('add_bot', { difficulty: 'hard' })
        sio.emit('add_bot', { difficulty: 'easy' })
        sio.emit('game:start')
      }
    }
  })
  const act = () => {
    if (!state || !acting || !yourId) return
    if (state.phase === 'game_over' || state.phase === 'scoring') return
    if (state.phase === 'draw') {
      const sel = state.players.find((p) => p.id === state.playerOrder[state.selectorIndex])
      if (sel && sel.id === yourId) {
        if (state.group.length === 0) sio.emit('game:draw')
        else sio.emit('game:stopDraw')
      }
      return
    }
    if (state.phase === 'auction') {
      const a = state.auction
      if (a && a.bidOrder[a.currentBidderIndex] === yourId) sio.emit('auction:pass')
    }
  }
  sio.on('game:board', (d) => { state = d.game; act() })
  sio.on('game:scored', (d) => {
    state = d.game
    // dismiss the summary so the game keeps moving while we load ships
    if (d.game.phase !== 'game_over') sio.emit('game:continue')
    act()
  })
  setTimeout(() => { acting = false; resolve() }, 8000)
})
await settled

console.log(`room ${roomCode} (${yourId}) — game in progress`)

// Release the node identity so the browser can take it over via reconnect.
sio.close()
await new Promise((r) => setTimeout(r, 1200))

// --- phase 2: browser joins the same room ---
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[browser ${m.type()}]`, m.text().slice(0, 200))
})
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(([c, t]) => {
  localStorage.setItem('medici:room', JSON.stringify({ code: c, token: t }))
}, [roomCode, roomToken])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.board-svg, .lobby', { timeout: 10000 }).catch(() => {})
await page.waitForTimeout(3000)

const diag = await page.evaluate(() => ({
  savedRoom: localStorage.getItem('medici:room'),
  bodyText: document.body?.innerText?.slice(0, 200),
  toast: document.querySelector('.toast')?.textContent ?? null,
}))
console.log('DIAG', JSON.stringify(diag))

const metrics = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel)
  const g = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
  }
  const auction = q('.auction-panel') ?? q('[class*="auction"]')
  const ships = q('.ships')
  const log = q('.game-log')
  const shipMats = [...document.querySelectorAll('.ship-mat')].map((el) => {
    const r = el.getBoundingClientRect()
    return { h: Math.round(r.height), w: Math.round(r.width) }
  })
  return {
    viewport: { w: innerWidth, h: innerHeight },
    lobby: !!q('.lobby'),
    header: g(q('.app-header')),
    auction: g(auction),
    ships: g(ships),
    log: g(log),
    shipMats,
    shipsOverflow: ships ? ships.scrollHeight > ships.clientHeight : null,
    logCollapsed: log ? log.classList.contains('collapsed') : null,
  }
})
console.log(JSON.stringify(metrics, null, 2))
await page.screenshot({ path: '/tmp/medici-small.png' })
await browser.close()
process.exit(0)
