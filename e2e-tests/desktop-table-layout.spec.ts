import { expect, test, type APIRequestContext } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { BACKEND_URL, getJson, postJson } from './fixtures'

async function prepareTable(request: APIRequestContext) {
  expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
    seed: 1001, playerCount: 2, customCardIds: [], enableThroughTheSeasons: true,
  })).ok).toBe(true)
  const { state }: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  const [owner, other] = state.players
  if (!owner || !other) throw new Error('Two-player fixture is required')
  owner.occupationHand = ['E111_Recluse', 'A126_MasterWorkman', 'C105_BasketCarrier', 'A119_FirewoodCollector', 'C122_Bricklayer']
  owner.minorHand = ['B057_Scullery', 'C066_EternalRyeCultivation', 'D073_SupplyBoat', 'A075_LumberMill', 'E036_HerbalGarden', 'A048_ShavingHorse', 'A060_OrientalFireplace']
  owner.occupationPlayed = ['D106_WhiskyDistiller', 'B100_Clutterer', 'C146_WorkshopAssistant', 'C120_AgriculturalLabourer']
  owner.minorPlayed = ['D075_WoodField', 'C022_BasketChair']
  owner.cardStates = {
    C146_WorkshopAssistant: { extraData: { pairs: ['WC', 'CS', 'RS'] } },
    C120_AgriculturalLabourer: { counters: { clay: 8 } },
    D075_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }] } },
    C022_BasketChair: { extraData: { heldWorkerId: '1' } },
  }
  owner.parentCards = { mother: 'PR12', father: 'PS07' }
  other.parentCards = { mother: 'PR07', father: 'PS02' }
  owner.resources.food = 20
  other.occupationHand = ['A102_Grocer']
  other.minorHand = ['__test_placeholder__']
  other.occupationPlayed = ['A119_FirewoodCollector']
  other.minorPlayed = []
  other.cardStates = {}
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
}

for (const width of [2239, 1920, 1440]) {
  test(`desktop table keeps readable cards and a full-width private hand at ${width}px`, async ({ page, request }) => {
    await prepareTable(request)
    await page.setViewportSize({ width, height: 1271 })
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.game-layout__hand .hand-cards')).toBeVisible()
    await expect(page.locator('.game-layout__center .hand-cards')).toHaveCount(0)
    await expect(page.locator('.desktop-public-farm[data-player-id="p2"] .farm-grid')).toBeVisible()
    await expect(page.locator('.desktop-public-farms .hand-cards')).toHaveCount(0)
    await expect(page.locator('.desktop-public-farms [data-card-anchor="A102_Grocer"]')).toHaveCount(0)
    await expect(page.locator('.game-layout__center .resource-clay .resource-chip-count')).toHaveText('8')
    await expect(page.getByTestId('played-card-held-worker-C022_BasketChair')).toBeVisible()
    await expect(page.locator('.seasons-board__map--compact')).toBeVisible()

    const geometry = await page.evaluate(() => {
      const center = document.querySelector('.game-layout__center')
      const played = center?.querySelector('.played-row .player-card')
      const hand = document.querySelector('.game-layout__hand')
      const handCard = hand?.querySelector('.player-card')
      if (!center || !played || !hand || !handCard) throw new Error('Table is missing a panel')
      const title = played.querySelector('.card-title')
      if (!title) throw new Error('Played card has no name')
      const scale = played.getBoundingClientRect().width / 235
      return {
        playedWidth: played.getBoundingClientRect().width,
        playedHeight: played.getBoundingClientRect().height,
        handCardWidth: handCard.getBoundingClientRect().width,
        handWidth: hand.getBoundingClientRect().width,
        personalWidth: center.getBoundingClientRect().width,
        playedTitleSize: Number.parseFloat(getComputedStyle(title).fontSize) * scale,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(geometry.playedWidth).toBeCloseTo(150, 0)
    expect(geometry.playedHeight).toBeCloseTo(150, 0)
    expect(geometry.handCardWidth).toBeGreaterThanOrEqual(188)
    expect(geometry.playedTitleSize).toBeGreaterThanOrEqual(12)
    if (width >= 1920) expect(geometry.handWidth).toBeGreaterThan(geometry.personalWidth + 500)
    expect(geometry.overflow).toBeLessThanOrEqual(1)

    const played = page.locator('.game-layout__center .played-row .player-card').first()
    await played.hover()
    await expect(page.locator('.card-hover-preview .card-desc')).toBeVisible()
    expect(await page.locator('.card-hover-preview').evaluate(element => element.getBoundingClientRect().width)).toBe(300)
    await page.mouse.move(0, 0)
    await expect(page.locator('.card-hover-preview')).toHaveCount(0)
    await played.focus()
    await expect(page.locator('.card-hover-preview .card-desc')).toBeVisible()
    await played.press('Escape')
    await expect(page.locator('.card-hover-preview')).toHaveCount(0)
    await page.locator('.game-layout__stage').click()

    await page.locator('.game-layout').screenshot({ path: `output/desktop-layout-${width}.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.game-layout__center .hand-cards')).toBeVisible()
    await expect(page.locator('.game-layout__hand')).toHaveCount(0)
    await expect(page.locator('.desktop-public-farms')).toHaveCount(0)
    await expect(page.locator('.seasons-board__map--compact')).toHaveCount(0)
    expect(await page.locator('.game-layout__center .played-row .player-card').first().evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(50)
    await page.setViewportSize({ width, height: 1271 })
    await expect(page.locator('.game-layout__hand .hand-cards')).toBeVisible()
    await expect(page.locator('.hand-cards')).toHaveCount(1)
    if (width === 2239) {
      await page.locator('[data-action-id="lessons"] button').click()
      const choice = page.locator('.game-layout__hand [data-card-anchor="A119_FirewoodCollector"]')
      await expect(choice).toHaveClass(/selectable/)
      await choice.click()
      await expect.poll(async () => {
        const response: { state: GameState } = await getJson(request, `${BACKEND_URL}/api/game/state`)
        return response.state.players[0]?.occupationPlayed ?? []
      }).toContain('A119_FirewoodCollector')
      await expect(page.locator('.game-layout__center .played-cards [data-card-anchor="A119_FirewoodCollector"]')).toBeVisible()
    }
  })
}
