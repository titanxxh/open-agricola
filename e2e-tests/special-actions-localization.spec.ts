import { expect, test } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, postJson } from './fixtures'

const names = {
  zh: ['伐木', '刀耕火种', '挖泥炭', '马市', '雇工集市', '黑市', '非法工作'],
  en: ['Fell Trees', 'Slash and Burn', 'Cut Peat', 'Horse Market', 'Hiring Fair', 'Black Market', 'Illicit Work'],
}

for (const locale of ['zh', 'en'] as const) {
  for (const width of [1920, 390]) {
    test(`${locale} special action cards stay readable at ${width}px for every player count`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 1080 })
      await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
      const seenCards = new Set<string>()
      for (const playerCount of [2, 3, 4, 5, 6]) {
        const game = await postJson(request, `${BACKEND_URL}/api/game/new`, {
          seed: 958, maxPlayers: playerCount, enableFarmersOfTheMoor: true,
          allowIncompleteFarmersOfTheMoorMinorDeal: true,
        })
        expect(game.ok).toBe(true)
        expect(game.state.players).toHaveLength(playerCount)
        await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
        const panel = page.locator('.special-actions-panel')
        await expect(panel).toBeVisible()
        await expect(panel.locator('.special-action-card')).toHaveCount(game.state.farmersOfTheMoor.specialActionCards.length)
        await expect(panel.locator('img')).toHaveCount(0)
        await expect(panel.getByRole('button', { name: names[locale][2], exact: true }).first()
          .locator('[data-resource="fuel"]')).toHaveAttribute('data-amount', '3')
        await expect(panel.getByRole('button', { name: names[locale][3], exact: true }).first()
          .locator('[data-resource="horse"]')).toHaveAttribute('data-amount', '1')
        for (const card of await panel.locator('.special-action-card').all()) {
          seenCards.add((await card.getAttribute('data-card-id'))!)
          const titles = await card.locator('.special-action-card__action-label').allTextContents()
          expect(titles.length).toBeGreaterThan(0)
          expect(titles.length).toBeLessThanOrEqual(4)
          for (const title of titles) expect(names[locale]).toContain(title)
        }
        for (const button of await panel.getByRole('button').all()) {
          const metrics = await button.evaluate((element) => ({
            width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
            clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          }))
          expect(metrics.width).toBeGreaterThanOrEqual(44)
          expect(metrics.height).toBeGreaterThanOrEqual(44)
          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
        }
        await expect(panel.getByRole('button', { name: names[locale][5], exact: true }).first())
          .toContainText(locale === 'zh' ? '另付改良费用' : 'Pay improvement cost separately')
        if (playerCount === 2 || playerCount === 6) {
          await panel.screenshot({ path: `output/playwright/issue958-cards-${locale}-${width}-${playerCount}p.png` })
        }
      }
      expect(seenCards.size).toBe(12)
    })
  }
}

test('Chinese titles remain visible after using and borrowing a special action card', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
  const game = await postJson(request, `${BACKEND_URL}/api/game/new`, {
    seed: 958, maxPlayers: 2, enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  expect(game.ok).toBe(true)
  await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
  const card = page.locator('[data-card-id="moor-special-1-2-market-work"]')
  await card.getByRole('button', { name: '雇工集市', exact: true }).click()
  await expect(card.locator('.special-action-card__status')).toHaveText('已使用')
  await expect(card.getByRole('button', { name: '雇工集市' })).toBeDisabled()
  await expect(card).toHaveClass(/special-action-card--disabled/)
  await card.screenshot({ path: 'output/playwright/issue958-used.png' })

  const confirmed = await postJson(request, `${BACKEND_URL}/api/game/choice`, { playerIndex: 0, value: 'confirm' })
  expect(confirmed.ok).toBe(true)
  await page.goto(`${FRONTEND_URL}/?page=game&player=p2&embedded=1&devMode=1`)
  await expect(card.locator('.special-action-card__status')).toHaveText('借用 2 食物')
  await card.getByRole('button', { name: '雇工集市', exact: true }).click()
  await expect(card.locator('.special-action-card__status')).toHaveText('不可用')
  await expect(card).toHaveClass(/special-action-card--disabled/)
  for (const name of names.zh.slice(3)) {
    await expect(card.getByRole('button', { name, exact: true })).toHaveText(new RegExp(name))
    await expect(card.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await card.screenshot({ path: 'output/playwright/issue958-borrowed.png' })
})
