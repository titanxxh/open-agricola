import { expect, test } from '@playwright/test'

const backend = process.env.BACKEND_URL ?? 'http://localhost:5175'

test.use({ launchOptions: { args: ['--enable-itp', '--cookies-policy=no-third-party'] } })

test('sandboxed replay loads public resources and rejects other origins @webkit', async ({ page, request }) => {
  const response = await request.post(`${backend}/api/test/replays/completed`)
  expect(response.status()).toBe(201)
  const { roomId } = await response.json()
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  const publicReads: string[] = []
  page.on('response', response => {
    if (response.status() === 200) publicReads.push(response.url())
  })
  await page.goto(`/?room=${roomId}&perspective=open&layout=board`)
  const iframe = page.locator('.replay-shell--viewer iframe')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(iframe).toHaveAttribute('credentialless', '')
  const replay = page.frameLocator('.replay-shell--viewer iframe')
  await expect(replay.locator('.replay-app--board')).toBeVisible()
  expect(publicReads.some(url => url.includes('/replay-viewers/') && url.endsWith('/i18n/manifest.json'))).toBe(true)
  await expect(replay.locator('.replay-kicker')).toHaveText('Game Archive')
  await replay.locator('.replay-transport button').nth(2).click()
  await expect(replay.locator('.replay-transport output')).toContainText('1 / 2')

  const isolation = await replay.locator('body').evaluate(() => {
    let parentBlocked = false
    let storageBlocked = false
    try { void window.parent.document } catch { parentBlocked = true }
    try { void window.localStorage } catch { storageBlocked = true }
    return { parentBlocked, storageBlocked }
  })
  expect(isolation).toEqual({ parentBlocked: true, storageBlocked: true })
  const violation = await replay.locator('body').evaluate(async () => {
    const violation = new Promise<{ directive: string; blockedURI: string } | null>(resolve => {
      document.addEventListener('securitypolicyviolation', event => resolve({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
      }), { once: true })
      setTimeout(() => resolve(null), 3000)
    })
    await fetch('https://untrusted.example.invalid/replay-probe', { credentials: 'omit' }).catch(() => {})
    return await violation
  })
  expect(violation).toEqual({
    directive: 'connect-src',
    blockedURI: 'https://untrusted.example.invalid/replay-probe',
  })
})
