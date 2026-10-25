import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

const actions = (page: Page) => page.locator('[data-interaction-focus="actions"]')
const switchPlayer = (page: Page) => page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true })
const settleFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
}))

test('online card reaction returns after the whole action once and ignores later opponent actions', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage({ viewport: { width: 375, height: 812 } }),
    await browser.newPage({ viewport: { width: 375, height: 812 } })]
  const [initiator, responder] = pages
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    const fixture = createWorkSession({ seed: 1367, configure: state => {
      state.players[1]!.occupationPlayed = ['D169_Plowsmith']
      state.players[1]!.resources.food = 3
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
    } })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }

    await driver.ui(0, () => initiator.locator('[data-action-id="forest"] button').first().click())
    await driver.ui(0, () => switchPlayer(initiator).click())
    const offer = (await roomSnapshot(responder)).interaction
    if (offer.stateId !== 'wait' || offer.request.kind !== 'choice') throw new Error('Expected Plowsmith offer')
    const accept = offer.request.options.find(option => option.value !== '__skip__' && !option.disabled)
    if (!accept) throw new Error('Expected available Plowsmith payment')
    await driver.ui(1, () => responder.locator(`.interaction-bar [data-choice-value="${accept.value}"]`).click())
    const farm = responder.locator('[data-interaction-focus="farm"][data-focus-player="p2"]')
    await expect(farm).toHaveAttribute('data-interaction-focused', 'true')
    await expect(initiator.locator('[data-interaction-focus="farm"][data-interaction-focused]')).toHaveCount(0)
    await farm.locator('[data-farm-tile-key="0-1"]').click()
    await driver.ui(1, () => responder.getByRole('button', { name: 'Confirm plow', exact: true }).click())
    expect((await roomSnapshot(responder)).state.players[1]!.fields).toEqual([{ row: 0, col: 1, stacks: [] }])
    expect((await roomSnapshot(responder)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 1,
      request: { kind: 'confirm-player-switch' } })
    await expect(actions(responder)).not.toHaveAttribute('data-interaction-focused')

    // Completing the nested plow still waits for the parent player's whole action.
    await driver.ui(1, () => switchPlayer(responder).click())
    expect((await roomSnapshot(initiator)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'confirm-next-player' } })
    expect((await roomSnapshot(responder)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'private-prompt', promptKind: 'confirm-next-player' } })
    await expect(actions(responder)).toHaveAttribute('data-interaction-focused', 'true', { timeout: 3000 })
    await expect.poll(() => actions(responder).evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0)

    // Public browsing must stay still across a seat advance and unrelated later actions.
    await responder.evaluate(() => scrollTo({ top: 1000, behavior: 'instant' }))
    const browseOffset = await responder.evaluate(() => scrollY)
    expect(browseOffset).toBeGreaterThan(200)
    // The turn badge can resize the header; keep the same board position visible.
    const browsePosition = () => actions(responder).evaluate(node => node.getBoundingClientRect().top)
    const browseAnchorTop = await browsePosition()
    await driver.ui(0, () => switchPlayer(initiator).click())
    await settleFrames(responder)
    expect(await browsePosition()).toBe(browseAnchorTop)
    await driver.command(1, { type: 'action', spaceId: 'grain-seeds' })
    await driver.command(1, { type: 'choice', value: 'confirm' })
    await driver.ui(0, () => initiator.locator('[data-action-id="farmland"] button').first().click())
    expect((await roomSnapshot(initiator)).interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'farm-select' } })
    await settleFrames(responder)
    expect(await browsePosition()).toBe(browseAnchorTop)
    await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: { tile: { row: 0, col: 1 } } })
    await settleFrames(responder)
    expect(await browsePosition()).toBe(browseAnchorTop)
  } finally { await Promise.all(pages.map(page => page.close())) }
})
