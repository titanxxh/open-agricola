import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('mobile farm and cards keep readable native-scroll and zoom behavior', async ({ page }) => {
  const styles = await Promise.all([
    readFile('client/styles/tokens.css', 'utf8'),
    readFile('client/styles/base.css', 'utf8'),
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
          <div class="hand-row">
            <div class="player-card">Occupation one</div>
            <div class="player-card">Occupation two</div>
            <div class="player-card">Occupation three</div>
          </div>
        </main>
      </body>
    </html>
  `)

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.hand-row > *')]
    const resources = [...document.querySelectorAll<HTMLElement>('.res-compact-item')]
    const handStyle = getComputedStyle(document.querySelector('.hand-row')!)
    const farmStyle = getComputedStyle(document.querySelector('.farm-grid')!)
    const zeroStyle = getComputedStyle(document.querySelector('.res-compact-item.is-zero')!)
    const nonzeroStyle = getComputedStyle(document.querySelector('.res-compact-item.is-nonzero')!)
    return {
      minCardWidth: Math.min(...cards.map((card) => card.getBoundingClientRect().width)),
      minResourceWidth: Math.min(...resources.map((resource) => resource.getBoundingClientRect().width)),
      handOverflow: handStyle.overflowX,
      handTouchAction: handStyle.touchAction,
      farmTouchAction: farmStyle.touchAction,
      zeroOpacity: zeroStyle.opacity,
      nonzeroBackground: nonzeroStyle.backgroundColor,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })

  expect(layout.minCardWidth).toBeGreaterThanOrEqual(140)
  expect(layout.minResourceWidth).toBeGreaterThanOrEqual(40)
  expect(layout.handOverflow).toBe('auto')
  expect(
    layout.handTouchAction === 'manipulation' ||
    ['pan-x', 'pan-y', 'pinch-zoom'].every((value) => layout.handTouchAction.includes(value)),
  ).toBe(true)
  expect(layout.farmTouchAction).toMatch(/pinch-zoom|manipulation/)
  expect(layout.zeroOpacity).toBe('1')
  expect(layout.nonzeroBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(0)
})
