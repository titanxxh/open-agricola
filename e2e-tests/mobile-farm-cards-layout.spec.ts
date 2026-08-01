import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('mobile farm and cards keep seven-card rows and zoom behavior', async ({ page }) => {
  const styles = await Promise.all([
    readFile('client/styles/tokens.css', 'utf8'),
    readFile('client/styles/base.css', 'utf8'),
    readFile('client/styles/card-sprite.css', 'utf8'),
    readFile('client/styles/pages/game.css', 'utf8'),
  ])

  await page.setViewportSize({ width: 320, height: 640 })
  await page.setContent(`
    <html>
      <head><style>${styles.join('\n')} html, body { margin: 0; }</style></head>
      <body>
        <main class="center">
          <div class="player-resources-compact">
            <span class="res-compact-group">
              <span class="res-compact-item is-nonzero"><span class="res-icon res-icon-wood"></span><span class="res-compact-num">2</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-clay"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-reed"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-stone"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-grain"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-vegetable"></span><span class="res-compact-num">0</span></span>
            </span>
            <span class="res-compact-divider"></span>
            <span class="res-compact-group">
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-food"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-sheep"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-boar"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-cattle"></span><span class="res-compact-num">0</span></span>
              <span class="res-compact-item is-zero"><span class="res-icon res-icon-begging"></span><span class="res-compact-num">0</span></span>
            </span>
          </div>
          <div class="farm-grid"></div>
          <div class="played-cards">
            <div class="played-row">
              ${Array.from({ length: 8 }, () => '<div class="player-card"></div>').join('')}
            </div>
          </div>
          <div class="hand-cards">
            <div class="hand-section">
              <div class="hand-row">
                ${Array.from({ length: 8 }, () => '<div class="player-card"></div>').join('')}
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `)

  const layout = await page.evaluate(() => {
    const resources = [...document.querySelectorAll<HTMLElement>('.res-compact-item')]
    const farmStyle = getComputedStyle(document.querySelector('.farm-grid')!)
    const zeroStyle = getComputedStyle(document.querySelector('.res-compact-item.is-zero')!)
    const nonzeroStyle = getComputedStyle(document.querySelector('.res-compact-item.is-nonzero')!)
    const measureRow = (selector: string) => {
      const row = document.querySelector<HTMLElement>(selector)!
      const cards = [...row.children].map((card) => card.getBoundingClientRect())
      return {
        firstRowCards: cards.filter((card) => Math.abs(card.top - cards[0].top) < 1).length,
        firstTop: cards[0].top,
        eighthTop: cards[7].top,
        maxCardWidth: Math.max(...cards.map((card) => card.width)),
        horizontalOverflow: row.scrollWidth - row.clientWidth,
      }
    }
    return {
      played: measureRow('.played-row'),
      hand: measureRow('.hand-row'),
      minResourceWidth: Math.min(...resources.map((resource) => resource.getBoundingClientRect().width)),
      farmTouchAction: farmStyle.touchAction,
      zeroOpacity: zeroStyle.opacity,
      nonzeroBackground: nonzeroStyle.backgroundColor,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })

  for (const row of [layout.played, layout.hand]) {
    expect(row.firstRowCards).toBe(7)
    expect(row.eighthTop).toBeGreaterThan(row.firstTop)
    expect(row.maxCardWidth).toBeLessThan(50)
    expect(row.horizontalOverflow).toBeLessThanOrEqual(0)
  }
  expect(layout.minResourceWidth).toBeGreaterThanOrEqual(40)
  expect(layout.farmTouchAction).toMatch(/pinch-zoom|manipulation/)
  expect(layout.zeroOpacity).toBe('1')
  expect(layout.nonzeroBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(0)
})
