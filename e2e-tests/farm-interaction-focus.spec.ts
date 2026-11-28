// @covers client/components/board/
// @covers client/components/interaction/
import { devices, expect, test, type APIRequestContext, type Page, type WebSocketRoute } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { GameState, SessionResponse } from '../shared/contract/types'
import type { ClientCommand, ServerEvent } from '../shared/contract/protocol/ws'
import { browserRequestHeaders, BACKEND_URL } from './fixtures'
import { matrixVariant } from './helpers/extended'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

async function prepare(page: Page, request: APIRequestContext, configure?: (state: GameState) => void, moor = false, locale = 'en') {
  const options = { playerCount: 2, enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor }
  expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, { headers: browserRequestHeaders(), data: { ...options, seed: 1368, customCardIds: [] } })).ok()).toBe(true)
  const fixture = createWorkSession({ seed: 1368, options, configure: state => {
    state.round = 14
    Object.assign(state.players[0]!.resources, { wood: 20, reed: 10, food: 10, grain: 2, vegetable: 1 })
    configure?.(state)
  } })
  try {
    expect((await request.post(`${BACKEND_URL}/api/game/load`, { headers: browserRequestHeaders(),
      data: { state: fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks })) },
    })).ok()).toBe(true)
  } finally { fixture.dispose() }
  await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  await expect(page.locator('.game-layout')).toBeVisible()
}

const farm = (page: Page) => page.locator('[data-interaction-focus="farm"][data-focus-player="p1"]')
async function expectFarmVisible(page: Page) {
  await expect(farm(page)).toHaveAttribute('data-interaction-focused', 'true')
  await expect.poll(() => farm(page).evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const bar = document.querySelector('.interaction-bar')!.getBoundingClientRect()
    const dock = document.querySelector('.section-nav')?.getBoundingClientRect()
    return bounds.top >= 0 && bounds.bottom <= (dock && dock.height > 0 ? dock.top : bar.top)
  })).toBe(true)
}
async function action(page: Page, id: string): Promise<SessionResponse> {
  const sent = page.waitForResponse(response => response.url().endsWith('/api/game/action'))
  await page.locator(`[data-action-id="${id}"] button`).first().click()
  const response: SessionResponse = await (await sent).json()
  expect(response.ok, response.error).toBe(true)
  return response
}
async function choice(page: Page, value: string): Promise<SessionResponse> {
  const sent = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await page.locator(`.interaction-bar [data-choice-value="${value}"]`).click()
  const response: SessionResponse = await (await sent).json()
  expect(response.ok, response.error).toBe(true)
  return response
}

const pastureEdges = ['H-2-2', 'H-3-2', 'V-2-2', 'V-2-3']
const fenceEdge = (page: Page, edge: string) => farm(page).locator(`[data-fence-edge="${edge}"] .farm-fence-hit`)
const fenceConfirm = (page: Page) => page.locator('.interaction-bar [data-choice-value="confirm"]')

test.describe('mobile fence confirmation', () => {
  const phone = devices['iPhone 13']
  test.use({
    userAgent: phone.userAgent,
    viewport: phone.viewport,
    screen: phone.screen,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
  })

  for (const [locale, message] of [
    ['en', 'Fence failed: fences do not enclose a region (Selected 1 edges)'],
    ['zh', '围栏失败：围栏未形成封闭区域（已选 1 条围栏边）'],
  ] as const) {
    test(`keeps an open fence editable after a localized rejection in ${locale}`, async ({ page, request }) => {
      await prepare(page, request, undefined, false, locale)
      await action(page, 'fencing')
      const confirm = fenceConfirm(page)
      const firstEdge = fenceEdge(page, pastureEdges[0]!)
      await firstEdge.tap()
      const commit = async (): Promise<SessionResponse> => {
        const response = page.waitForResponse(reply => reply.url().endsWith('/api/game/commit-selection'))
        await confirm.tap()
        return (await response).json()
      }
      const rejected = await commit()
      expect(rejected).toMatchObject({ ok: false, error: 'NO_ENCLOSED_AREA' })
      expect(rejected.state.players[0]).toMatchObject({ resources: { wood: 20 }, fenceSegments: [] })
      await expect(page.locator('.interaction-error')).toHaveText(message)
      await expect(firstEdge).toHaveAttribute('aria-pressed', 'true')

      for (const edge of pastureEdges.slice(1)) await fenceEdge(page, edge).tap()
      await expect(page.locator('.interaction-error')).toHaveCount(0)
      const accepted = await commit()
      expect(accepted.ok, accepted.error).toBe(true)
      expect(accepted.state.players[0]!.fenceSegments).toHaveLength(4)
      expect(accepted.state.players[0]!.resources.wood).toBe(16)
    })
  }

  for (const interruption of ['before commit', 'after commit'] as const) {
    test(`guards repeated confirmation and recovers once when disconnected ${interruption}`, async ({ page, browser, request }) => {
      const sockets: Array<{ client: WebSocketRoute; upstream: WebSocketRoute }> = []
      const confirmations: Extract<ClientCommand, { type: 'commitSelection' }>[] = []
      await page.routeWebSocket('**/ws', client => {
        const upstream = client.connectToServer()
        sockets.push({ client, upstream })
        const isFirstSocket = sockets.length === 1
        client.onMessage(raw => {
          const message: ClientCommand = JSON.parse(raw.toString())
          if (message.type === 'commitSelection') {
            confirmations.push(message)
            if (isFirstSocket && interruption === 'before commit') return
          }
          upstream.send(raw)
        })
        upstream.onMessage(raw => {
          const message: ServerEvent = JSON.parse(raw.toString())
          if (isFirstSocket && interruption === 'after commit' && confirmations[0]?.requestId &&
            (message.type === 'stateUpdate' || message.type === 'commandReceipt') &&
            message.requestId === confirmations[0].requestId) return
          client.send(raw)
        })
      })
      const peer = await browser.newPage()
      try {
        await joinRoomClients([page, peer], request)
        const driver = roomDriver([page, peer])
        const session = createWorkSession({ seed: 1368, configure(state) {
          state.round = 14
          state.players[0]!.resources.wood = 10
        } })
        try {
          await driver.command(0, { type: 'loadGame', state: session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks })) })
        } finally { session.dispose() }

        const beginFence = async () => {
          await driver.ui(0, () => page.locator('[data-action-id="fencing"] button').first().tap())
          for (const edge of pastureEdges) await fenceEdge(page, edge).tap()
          await expect(page.getByTestId('fence-selection-cost')).toHaveText('Cost: 4 wood')
        }
        await beginFence()
        const confirm = fenceConfirm(page)
        // All clicks run in the same browser task before waiting for a render.
        await confirm.evaluate(button => {
          if (!(button instanceof HTMLButtonElement)) throw new Error('Missing fence confirm button')
          button.click()
          button.click()
          button.click()
        })
        await expect(confirm).toBeDisabled()
        await expect.poll(() => confirmations.length).toBe(1)
        const original = confirmations[0]?.commandContext?.commandId
        expect(original).toBeTruthy()
        expect((await roomSnapshot(page)).state.players[0]!.fenceSegments).toHaveLength(0)
        if (interruption === 'after commit') {
          await expect.poll(async () => (await roomSnapshot(peer)).state.players[0]!.fenceSegments.length).toBe(4)
        } else {
          expect((await roomSnapshot(peer)).state.players[0]!.fenceSegments).toHaveLength(0)
        }

        const socket = sockets[0]
        if (!socket) throw new Error('Missing first room connection')
        await socket.client.close({ code: 1006 })
        await socket.upstream.close({ code: 1012 })
        await expect.poll(() => sockets.length).toBe(2)
        await expect.poll(async () => (await roomSnapshot(page)).interaction)
          .toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
        expect(confirmations.map(command => command.commandContext?.commandId))
          .toEqual(interruption === 'before commit' ? [original, original] : [original])
        for (const actor of [page, peer]) {
          await expect.poll(async () => (await roomSnapshot(actor)).state.players[0]!.fenceSegments.length).toBe(4)
          const settled = await roomSnapshot(actor)
          expect(settled.state.players[0]!.resources.wood).toBe(6)
          expect(settled.state.players[0]!.fenceSegments).toHaveLength(4)
          expect(settled.state.events.filter(event => event.type === 'farm.fenceBuilt')).toHaveLength(1)
          expect(settled.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing')).toHaveLength(1)
        }

        await driver.command(0, { type: 'undoAction' })
        await beginFence()
        await expect(confirm).toBeEnabled()
        await driver.ui(0, () => confirm.tap())
        expect(confirmations.at(-1)?.commandContext?.commandId).not.toBe(original)
        expect((await roomSnapshot(page)).state.players[0]!.resources.wood).toBe(6)
      } finally { await peer.close() }
    })
  }
})

for (const operation of ['room', 'stable', 'plow', 'sow'] as const) {
  test(`${operation} focuses the farm and confirms an authoritative ordinary target`, async ({ page, request }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await prepare(page, request, state => {
      if (operation === 'sow') state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    })
    let response = await action(page, operation === 'room' || operation === 'stable' ? 'farm-expansion' : operation === 'plow' ? 'farmland' : 'grain-utilization')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const label = operation === 'room' ? 'actions.construct.name' : operation === 'stable' ? 'actions.buildStable.name' : 'actions.sow.name'
      const option = response.interaction.request.options.find(option => option.labelKey === label || (operation === 'stable' && option.labelKey === 'actions.stables.name'))
      if (!option) throw new Error(`Expected ${operation}: ${JSON.stringify(response.interaction.request)}`)
      response = await choice(page, option.value)
    }
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected farm input')
    const selection = response.interaction.request.farm
    await expectFarmVisible(page)
    if (selection.farmType === 'sow') await farm(page).locator('.sow-choice-button[title="Grain"]').first().click()
    else if (selection.farmType !== 'fence') {
      const tile = selection.selectableTiles[0]
      if (!tile) throw new Error('Expected a legal farm tile')
      await farm(page).locator(`[data-farm-tile-key="${tile.row}-${tile.col}"]`).click()
    }
    const confirm = page.locator('.interaction-bar [data-choice-value="confirm"]')
    await expect(confirm).toBeEnabled()
    const visible = await confirm.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= innerHeight
    })
    expect(visible).toBe(true)
    const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
    await confirm.click()
    const after: SessionResponse = await (await committed).json()
    expect(after.ok, after.error).toBe(true)
    const player = after.state.players[0]!
    if (operation === 'room') expect(player.rooms).toBe(3)
    if (operation === 'stable') expect(player.stableTiles).toHaveLength(1)
    if (operation === 'plow') expect(player.fields).toHaveLength(1)
    if (operation === 'sow') expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })
}

test('farm redevelopment fences eight edges with exactly eight wood', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => {
    state.players[0]!.houseType = 'clay'
    Object.assign(state.players[0]!.resources, { wood: 8, stone: 2, reed: 1 })
  })
  const start = await action(page, 'farm-redevelopment')
  const fence = start.interaction.stateId === 'wait' && start.interaction.request.kind === 'choice'
    ? start.interaction.request.options.find(option => option.labelKey === 'actions.fencing.name')
    : undefined
  if (!fence) throw new Error('Expected fencing after renovation')
  await choice(page, fence.value)
  await expectFarmVisible(page)
  for (const edge of ['V-0-3', 'V-1-3', 'H-2-3', 'H-2-4', 'V-1-5', 'V-0-5', 'H-0-4', 'H-0-3']) {
    await farm(page).locator(`[data-fence-edge="${edge}"] .farm-fence-hit`).click()
  }
  await expect(page.getByTestId('fence-selection-cost')).toHaveText('Cost: 8 wood')
  const confirm = page.locator('.interaction-bar [data-choice-value="confirm"]')
  await expect(confirm).toBeEnabled()
  await page.screenshot({ path: 'output/playwright/farm-redevelopment-eight-wood-selected.png' })
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await confirm.click()
  const response = await committed
  expect(response.request().postDataJSON()).not.toHaveProperty('payload.extraWood')
  const after: SessionResponse = await response.json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.houseType).toBe('stone')
  expect(after.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0, reed: 0 })
  expect(after.state.players[0]!.fenceSegments).toHaveLength(8)
  await page.screenshot({ path: 'output/playwright/farm-redevelopment-eight-wood-completed.png' })
})

for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`fence touch targets remain distinct and above the operation bar at ${viewport.width}x${viewport.height}`, matrixVariant(viewport.width === 375), async ({ browser, request }) => {
    const context = await browser.newContext({ viewport, hasTouch: true })
    const page = await context.newPage()
    try {
      await prepare(page, request)
      await action(page, 'fencing')
      await expectFarmVisible(page)
      for (const edge of ['H-2-2', 'H-3-2', 'V-2-2', 'V-2-3']) {
        const control = farm(page).locator(`[data-fence-edge="${edge}"] .farm-fence-hit`)
        const bounds = await control.boundingBox()
        expect(bounds).not.toBeNull()
        expect(Math.min(bounds!.height, bounds!.width)).toBeGreaterThanOrEqual(36)
        expect(await control.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.getAttribute('aria-label')
        })).toBe(await control.getAttribute('aria-label'))
        await control.tap({ timeout: 5000, position: edge.startsWith('H-')
          ? { x: bounds!.width / 2, y: bounds!.height / 2 + 10 }
          : { x: bounds!.width / 2 + 10, y: bounds!.height / 2 } })
        await expect(control).toHaveAttribute('aria-pressed', 'true')
      }
      await expect(page.locator('.interaction-bar')).toContainText('Selected 4 edges')
      await expect(page.getByTestId('fence-selection-cost')).toHaveText('Cost: 4 wood')
      await page.screenshot({ path: `output/playwright/farm-focus-fence-active-${viewport.width}x${viewport.height}.png` })
      const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
      await page.locator('.interaction-bar [data-choice-value="confirm"]').tap()
      const after: SessionResponse = await (await committed).json()
      expect(after.ok, after.error).toBe(true)
      expect(after.state.players[0]!.fenceSegments).toHaveLength(4)
      expect(after.state.players[0]!.resources.wood).toBe(16)
      await page.screenshot({ path: `output/playwright/farm-focus-fence-${viewport.width}x${viewport.height}.png` })
    } finally { await context.close() }
  })
}

test('an extended farm remains visible and accepts a legal outer field target', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => {
    state.players[0]!.farmyardExtensions = [{ id: 'north-extension', tiles: [{ row: -1, col: 1 }] }]
  })
  await action(page, 'farmland')
  await expectFarmVisible(page)
  const target = farm(page).locator('[data-farm-tile-key="-1-1"]')
  await expect(target).toHaveClass(/selectable/)
  await target.click()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await page.locator('.interaction-bar [data-choice-value="confirm"]').click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.fields).toEqual([{ row: -1, col: 1, stacks: [] }])
})

test('collecting animals focuses their farm holders and keeps the confirmation visible', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => {
    state.players[0]!.pastures = [{ id: 'animal-target', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    state.players[0]!.fenceSegments = ['H-2-2', 'H-3-2', 'V-2-2', 'V-2-3'].map(edge => ({ edge, type: 'fence' }))
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
  })
  await action(page, 'sheep-market')
  await expectFarmVisible(page)
  const confirm = page.locator('.interaction-reorg-panel').getByRole('button', { name: 'Confirm', exact: true })
  await expect(confirm).toBeEnabled()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/choice'))
  await confirm.click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.resources.sheep).toBe(2)
  expect(after.state.players[0]!.pastures[0]!.animalCount).toBe(2)
})

test('a card-granted plow focuses the farm before the wood action finishes', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => { state.players[0]!.occupationPlayed = ['A091_ShiftingCultivator'] })
  let response = await action(page, 'forest')
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'; step++) {
    const option = response.interaction.request.options.find(option => option.value !== '__skip__')
    if (!option) throw new Error('Expected the card-granted plow')
    response = await choice(page, option.value)
  }
  await expectFarmVisible(page)
  await farm(page).locator('.farm-tile.selectable').first().click()
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/commit-selection'))
  await page.locator('.interaction-bar [data-choice-value="confirm"]').click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.fields).toHaveLength(1)
  expect(after.state.players[0]!.resources.food).toBe(7)
})

test('local Moor terrain selection focuses the farm before submitting a special action', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepare(page, request, state => { state.players[0]!.farmTerrain = [{ row: 2, col: 2, kind: 'moor' }] }, true)
  await page.locator('.special-actions-panel').getByRole('button', { name: 'Cut Peat', exact: true }).click()
  await expectFarmVisible(page)
  const tile = farm(page).locator('[data-farm-tile-key="2-2"]')
  await expect(tile).toHaveClass(/selectable/)
  const committed = page.waitForResponse(response => response.url().endsWith('/api/game/special-action'))
  await tile.click()
  const after: SessionResponse = await (await committed).json()
  expect(after.ok, after.error).toBe(true)
  expect(after.state.players[0]!.farmTerrain).toEqual([])
})
