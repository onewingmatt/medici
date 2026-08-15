// Browser QA — load the app, create a room with bots, start the game,
// let it play a while, screenshot the board.
// Usage: node scripts/screenshot.mjs [out.png] [waitSeconds]
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const out = process.argv[2] ?? 'data/refs/screenshot-board.png'
const waitSec = Number(process.argv[3] ?? 12)
const URL = process.env.URL ?? 'http://localhost:3001'

mkdirSync(dirname(out), { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

// lobby: name + create
await page.fill('input[placeholder="Merchant name"]', 'Captain')
await page.click('text=Create room')
await page.waitForTimeout(800)

// add three bots
for (const d of ['easy', 'medium', 'hard']) {
  await page.click(`text=${d}`)
  await page.waitForTimeout(250)
}

// start
await page.click('text=Start game')
await page.waitForTimeout(800)

// let bots play
await page.waitForTimeout(waitSec * 1000)

await page.screenshot({ path: out, fullPage: false })
console.log('screenshot saved:', out)
console.log('console errors:', errors.length ? errors.slice(0, 5) : 'none')

// dump some page state to verify rendering
const boardText = await page.locator('.board-svg').count()
const shipCount = await page.locator('.ship-mat').count()
console.log('board svg present:', boardText > 0)
console.log('ship mats rendered:', shipCount)
console.log('auction panel:', await page.locator('.auction-panel').count() > 0)
console.log('title:', await page.title())

await browser.close()
