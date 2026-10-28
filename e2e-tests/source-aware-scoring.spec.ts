import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

const CARD = 'M027_GardenPath'

for (const width of [1920, 375]) test(`independent scoring markers follow their holder and locale at ${width}px`, async ({ browser, request }) => {
  const pages: [Page, Page] = [
    await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 375 }),
    await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 375 }),
  ]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 428029, options: { enableFarmersOfTheMoor: true }, configure(state) {
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
        Object.assign(player.resources, { clay: 2, food: 20, fuel: 3 })
      }
      state.players[0]!.minorHand = [CARD]
    } })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks })) })
    } finally { fixture.dispose() }

    const purchase = async (actor: number, spaceId: string) => {
      await driver.command(actor, { type: 'action', spaceId })
      for (let step = 0; step < 10; step++) {
        const current = await roomSnapshot(pages[actor]!)
        if (current.interaction.stateId !== 'wait') throw new Error('Expected a purchase interaction')
        if (current.interaction.request.kind === 'confirm-next-player') return
        const options = current.interaction.request.options ?? []
        const option = current.interaction.promptKey === 'prompt.selectPayment' ? options[0]
          : options.find(option => option.value.startsWith('action-improvement-')) ?? options.find(option => option.value === CARD)
        if (!option) throw new Error(JSON.stringify(current.interaction))
        await driver.command(actor, { type: 'choice', value: option.value })
      }
      throw new Error('Purchase did not complete')
    }
    const checkPad = async (page: Page, locale: 'en' | 'zh', values: string[], step: string) => {
      await page.locator('.game-layout__right').getByRole('button', { name: locale === 'en' ? 'Scoring Pad' : '计分板', exact: true }).click()
      const pad = page.locator('.scoring-pad')
      const marker = pad.locator('[data-score-row="marker-M027_GardenPath-garden-path"]')
      await expect(marker).toHaveCount(1)
      await expect(marker.locator('.scoring-label')).toHaveText(locale === 'en' ? '· Garden Path' : '· 花园小径')
      await expect(marker.locator('.scoring-cell-value')).toHaveText(values)
      await marker.scrollIntoViewIfNeeded()
      await expect(marker).toBeInViewport()
      expect(await pad.locator('.scoring-content').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      await pad.screenshot({ path: `output/playwright/source-aware-scoring-${width}-${step}.png` })
      await pad.getByRole('button', { name: locale === 'en' ? 'Close' : '关闭', exact: true }).click()
    }

    await purchase(0, 'meeting-place')
    expect(publicRoomState(await roomSnapshot(pages[0]))).toEqual(publicRoomState(await roomSnapshot(pages[1])))
    await checkPad(pages[0], 'en', ['0', '-1'], 'first-owner')
    await checkPad(pages[1], 'en', ['0', '-1'], 'peer-first-owner')
    await pages[0].locator('.header-locale-select button').click()
    await pages[0].getByRole('option', { name: '简体中文', exact: true }).click()
    await driver.command(0, { type: 'choice', value: 'confirm' })
    await purchase(1, 'major-improvement')
    expect(publicRoomState(await roomSnapshot(pages[0]))).toEqual(publicRoomState(await roomSnapshot(pages[1])))
    await checkPad(pages[0], 'zh', ['-1', '0'], 'transferred-zh')
    await checkPad(pages[1], 'en', ['-1', '0'], 'transferred-en')
    await driver.reload()
    await checkPad(pages[0], 'en', ['-1', '0'], 'restored')
    await driver.command(1, { type: 'undoAction' })
    await checkPad(pages[0], 'en', ['0', '-1'], 'undone')
  } finally { await Promise.all(pages.map(page => page.close())) }
})
