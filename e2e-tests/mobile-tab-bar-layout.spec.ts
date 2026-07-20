import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const renderTabBar = async (page: Page) => {
  const styles = await Promise.all([
    readFile('client/styles/tokens.css', 'utf8'),
    readFile('client/styles/base.css', 'utf8'),
    readFile('client/styles/components.css', 'utf8'),
  ])

  await page.setContent(`
    <html style="--safe-area-inset-bottom: 34px">
      <head><style>${styles.join('\n')} html, body { margin: 0; }</style></head>
      <body>
        <main style="height: 900px; display: flex; align-items: flex-end">
          <button id="last-control" type="button">Last control</button>
        </main>
        <nav class="mobile-tab-bar" aria-label="Main navigation">
          <button class="mobile-tab-bar__tab is-active" data-tab="lobby" type="button">
            <span class="mobile-tab-bar__icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span>
            <span class="mobile-tab-bar__label">Lobby</span>
          </button>
          <button class="mobile-tab-bar__tab" data-tab="workshop" type="button">
            <span class="mobile-tab-bar__icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span>
            <span class="mobile-tab-bar__label">Workshop</span>
          </button>
          <button class="mobile-tab-bar__tab" data-tab="settings" type="button">
            <span class="mobile-tab-bar__icon" aria-hidden="true"><svg viewBox="0 0 24 24"></svg></span>
            <span class="mobile-tab-bar__label">Settings</span>
          </button>
        </nav>
      </body>
    </html>
  `)
}

test.describe('Mobile tab bar layout', () => {
  test.use({ viewport: { width: 640, height: 512 } })

  test('localizes the live platform navigation without emoji glyphs', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px')
    })
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname
      await route.fulfill({
        json: pathname === '/api/auth/me'
          ? { ok: true, user: { id: 'u1', username: 'testuser', displayName: 'Test User' } }
          : { ok: true, rooms: [] },
      })
    })
    await page.goto('/?page=lobby')

    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(navigation.locator('.mobile-tab-bar__icon svg')).toHaveCount(3)
    expect(await navigation.textContent()).not.toMatch(/\p{Extended_Pictographic}/u)

    const lobbyTab = navigation.getByRole('button', { name: 'Lobby' })
    await lobbyTab.focus()
    await expect(lobbyTab).toBeFocused()
    expect(await lobbyTab.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)))
      .toBeGreaterThanOrEqual(2)
  })

  test('keeps navigation, content, and focus clear at safe area and 200% zoom', async ({ page }) => {
    await renderTabBar(page)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

    const layout = await page.evaluate(() => {
      const nav = document.querySelector('.mobile-tab-bar')
      const lastControl = document.querySelector('#last-control')
      const tabs = [...document.querySelectorAll('.mobile-tab-bar__tab')]
      if (!nav || !lastControl || tabs.length === 0) throw new Error('Tab bar is not ready')
      const navRect = nav.getBoundingClientRect()
      const lastRect = lastControl.getBoundingClientRect()
      const tabBottom = Math.max(...tabs.map((tab) => tab.getBoundingClientRect().bottom))
      return {
        tabSafeAreaGap: window.innerHeight - tabBottom,
        contentGap: navRect.top - lastRect.bottom,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })

    expect(layout.tabSafeAreaGap).toBeGreaterThanOrEqual(34)
    expect(layout.contentGap).toBeGreaterThanOrEqual(0)
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0)

    await page.keyboard.press('Tab')
    const lastControl = page.locator('#last-control')
    await expect(lastControl).toBeFocused()
    expect(await lastControl.evaluate((element) => {
      const style = getComputedStyle(element)
      return parseFloat(style.outlineWidth)
    })).toBeGreaterThanOrEqual(2)

    await page.keyboard.press('Tab')
    const firstTab = page.locator('[data-tab="lobby"]')
    await expect(firstTab).toBeFocused()
    expect(await firstTab.evaluate((element) => {
      const style = getComputedStyle(element)
      return parseFloat(style.outlineWidth)
    })).toBeGreaterThanOrEqual(2)
  })
})
