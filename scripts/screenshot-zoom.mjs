// Zoomed screenshot of just the board element for focused QA.
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:3001'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.fill('input[placeholder="Merchant name"]', 'Captain')
await page.click('text=Create room')
await page.waitForTimeout(700)
for (const d of ['easy', 'medium', 'hard']) {
  await page.click(`text=${d}`)
  await page.waitForTimeout(200)
}
await page.click('text=Start game')
await page.waitForTimeout(8000)

// board only
const board = page.locator('.board-svg')
await board.screenshot({ path: '/tmp/medici-board-only.png' })
// top half of the board (bonus levels near center)
await page.waitForTimeout(200)
const box = await board.boundingBox()
if (box) {
  await page.screenshot({
    path: '/tmp/medici-board-center.png',
    clip: { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25, width: box.width * 0.5, height: box.height * 0.5 },
  })
}
console.log('saved board-only + center crops')
await browser.close()
