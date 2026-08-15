// Screenshot the Medici game at a small viewport with the log shrink fix.
import { chromium } from 'playwright'

const URL = 'http://localhost:3199'
const CODE = process.env.ROOM_CODE ?? '4PCF5'
const TOKEN = process.env.ROOM_TOKEN ?? '7ebe3641-943e-4276-872e-1e0ab7006b30'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(([c, t]) => {
  localStorage.setItem('medici:room', JSON.stringify({ code: c, token: t }))
}, [CODE, TOKEN])
await page.reload({ waitUntil: 'domcontentloaded' })
// wait for the game board to render
await page.waitForSelector('.board-svg, .lobby', { timeout: 10000 }).catch(() => {})
await page.waitForTimeout(5000)
await page.screenshot({ path: '/tmp/medici-small.png' })

// Also grab layout metrics
const metrics = await page.evaluate(() => {
  const ships = document.querySelector('.ships')
  const log = document.querySelector('.game-log')
  const side = document.querySelector('.app-side')
  const g = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }
  }
  return {
    viewport: { w: innerWidth, h: innerHeight },
    side: g(side),
    ships: g(ships),
    log: g(log),
    shipsOverflow: ships ? ships.scrollHeight > ships.clientHeight : null,
    logCollapsed: log ? log.classList.contains('collapsed') : null,
  }
})
console.log(JSON.stringify(metrics, null, 2))
await browser.close()
