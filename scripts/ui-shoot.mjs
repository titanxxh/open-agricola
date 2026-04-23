// Reusable Playwright screenshot script for UI overhaul verification.
// Usage:
//   LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-N-after node scripts/ui-shoot.mjs
//   Optional: BASE_URL=https://titanxxh.github.io/open-agricola/  (defaults to public Pages site)
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const OUT = process.env.OUT_DIR || 'output/tmp/batch-x-after'
const BASE = process.env.BASE_URL || 'https://titanxxh.github.io/open-agricola/'
const USER = process.env.LOGIN_USER || 'xxh'
const PASS = process.env.LOGIN_PASS || 'brasil'

fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

async function shot(name, fullPage = false) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
  console.log('SHOT', name)
}

async function go(url) {
  console.log('GOTO', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto-warn', e.message))
  await page.waitForTimeout(800)
}

try {
  // 1. Landing/login
  await go(BASE)
  await shot('01-landing-login', true)

  // 2. Login flow
  const userInput = page.locator('input[type=text]').first()
  if (await userInput.count()) {
    await userInput.fill(USER)
    await page.locator('input[type=password]').first().fill(PASS)
    await page.locator('button[type=submit]').first().click()
    await page.waitForTimeout(2500)
  }

  // 3. Lobby
  await go(BASE + '?page=lobby')
  await shot('04-lobby', true)

  // 4. Workshop
  await go(BASE + '?page=workshop')
  await shot('05-workshop', true)

  // 5. Settings
  await go(BASE + '?page=settings')
  await shot('06-settings', true)

  // 6. Game (single-player from lobby)
  await go(BASE + '?page=lobby')
  const single = page.getByRole('button', { name: /单人模式/ })
  if (await single.count()) {
    await single.click()
    await page.waitForTimeout(6000)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await shot('20-game-1920', false)
    await shot('21-game-1920-full', true)
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  // 7. Mobile views
  await page.setViewportSize({ width: 390, height: 844 })
  await go(BASE + '?page=lobby')
  await shot('09-mobile-lobby', true)
  await go(BASE + '?page=workshop')
  await shot('10-mobile-workshop', true)

  // workshop AI designer (open if button present)
  await go(BASE + '?page=workshop')
  await page.setViewportSize({ width: 1440, height: 900 })
  const createBtn = page.locator('button:has-text("创建"), button:has-text("修改卡牌")').first()
  if (await createBtn.count()) {
    await createBtn.click()
    await page.waitForTimeout(1500)
    await shot('11-workshop-designer', true)
  }
} finally {
  await browser.close()
}
