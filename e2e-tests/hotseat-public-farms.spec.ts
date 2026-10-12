import { expect, test, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { getPlayerDisplayName } from '../client/utils/player-name'
import { BACKEND_URL, FRONTEND_URL, finishHotseatOpening } from './fixtures'

type HotseatProbe = { socket: WebSocket; payload?: GameSyncPayload; sent: Array<{ type: string }> }
declare global {
  interface Window { hotseatProbe: HotseatProbe }
}

// Observe real WS traffic; do not replace snapshots or loosen formal-room dev permissions.
const captureRoom = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        window.hotseatProbe = { socket: this, sent: [] }
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data as string) as ServerEvent
          if (message.type === 'stateUpdate') window.hotseatProbe.payload = message.payload
        })
      }
      override send(data: Parameters<WebSocket['send']>[0]) {
        if (typeof data === 'string') window.hotseatProbe.sent.push(JSON.parse(data) as { type: string })
        super.send(data)
      }
    }
  })
}
const snapshot = (page: Page) => page.evaluate(() => {
  const payload = window.hotseatProbe.payload
  if (!payload) throw new Error('No authoritative snapshot received')
  return payload
})
const ruleCommands = (page: Page) => page.evaluate(() => window.hotseatProbe.sent
  .filter(message => !['getCommandScope', 'joinRoom', 'getState', 'getHistory'].includes(message.type)))

const confirmHandoff = async (page: Page, name: string) => {
  const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
  await expect(handoff).toBeVisible()
  await expect(handoff).toContainText(`Pass the device to ${name}.`)
  await expect(page.locator('.farm-grid')).toHaveCount(0)
  await handoff.getByRole('button').click()
  await expect(page.locator('.game-layout')).toBeVisible()
}
const browse = async (page: Page, name: string, mobile: boolean) => {
  if (mobile) {
    await page.getByRole('button', { name: '切换玩家视角' }).click()
    await page.getByRole('listbox').getByRole('option', { name: new RegExp(name) }).click()
    await expect(page.getByRole('button', { name: '切换玩家视角' })).toContainText(name)
  } else {
    await page.getByRole('tab', { name: new RegExp(name) }).click()
    await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true')
  }
}

// Reach harvesting by legal public resource actions, avoiding random hand effects.
const reachCrossPlayerFeed = async (page: Page, names: string[]) => {
  let confirmedPlayerIndex = 0
  for (let step = 0; step < 65; step++) {
    const payload = await snapshot(page)
    const actor = payload.interaction.stateId === 'wait' ? payload.interaction.playerIndex : payload.state.currentPlayerIndex
    if (actor !== confirmedPlayerIndex) {
      await confirmHandoff(page, names[actor]!)
      confirmedPlayerIndex = actor
      continue // Handoff confirmation is local only, not a rule command.
    }
    if (payload.interaction.stateId === 'wait' && payload.interaction.request.kind === 'feed'
      && actor !== payload.state.currentPlayerIndex) return payload
    if (payload.interaction.stateId === 'wait' && payload.interaction.request.kind === 'feed') {
      await page.locator('.exchange-overlay .exchange-confirm').click()
    } else if (await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).isVisible()) {
      await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click()
    } else {
      const action = page.locator(['forest', 'clay-pit', 'reed-bank', 'grain-seeds']
        .map(id => `[data-action-id="${id}"] button:enabled`).join(', ')).first()
      await expect(action, `Expected a public resource action at step ${step}`).toBeVisible()
      await action.click()
    }
    // Every operation must yield a new authoritative snapshot before choosing the next input.
    await expect.poll(async () => JSON.stringify(await snapshot(page))).not.toBe(JSON.stringify(payload))
  }
  throw new Error('Cross-player feeding interaction was not reached')
}

test('real hotseat Moor drafts stay private during public browsing and remain usable on return', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await captureRoom(page)
  const username = `hotseat_moor_${Date.now().toString(36)}`
  const oauth = await page.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
    providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: 'Alice',
  } })
  expect(oauth.ok()).toBe(true)
  const complete = await page.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, { data: {
    username, displayName: 'Alice', password: 'hotseat-moor-pass', confirmPassword: 'hotseat-moor-pass',
  } })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await page.goto(FRONTEND_URL)
  await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
  await page.getByRole('checkbox', { name: /Snake opening/ }).uncheck()
  await page.getByRole('checkbox', { name: 'Enable Farmers of the Moor expansion', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Allow an incomplete Farmers of the Moor minor improvement pool', exact: true }).check()
  await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
  await finishHotseatOpening(page)
  const initial = await snapshot(page)
  expect(initial.state.players).toHaveLength(2)
  const names = initial.state.players.map((player, index) => getPlayerDisplayName('en', player.name, index, player.nameIsDefault))
  const cutPeat = page.locator('[data-card-id="moor-special-1-2-terrain"]').getByRole('button', { name: 'Cut Peat', exact: true })
  await expect(cutPeat).toBeEnabled()
  await page.evaluate(() => { window.hotseatProbe.sent = [] })
  await cutPeat.click()
  await expect(cutPeat).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.farm-tile.selectable').first()).toBeVisible()
  expect(await ruleCommands(page)).toEqual([])

  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await browse(page, names[1]!, mobile)
    await expect(cutPeat).toBeDisabled()
    await expect(cutPeat).toHaveAttribute('aria-pressed', 'false')
    await expect(cutPeat).not.toHaveClass(/\bselected\b/)
    await expect(page.locator('.farm-tile.selectable, .farm-tile.selected')).toHaveCount(0)
    await page.locator('[data-farm-tile-player="p2"]').first().click()
    expect(await ruleCommands(page)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(mobile ? 'moor-public-mobile.png' : 'moor-public-desktop.png') })
    await page.getByRole('button', { name: `Return to ${names[0]} to continue` }).click()
    await expect(cutPeat).toBeEnabled()
    await expect(cutPeat).toHaveAttribute('aria-pressed', 'true')
    await expect(cutPeat).toHaveClass(/\bselected\b/)
    await expect(page.locator('.farm-tile.selectable').first()).toBeVisible()
    expect(await ruleCommands(page)).toEqual([])
  }

  await page.locator('.farm-tile.selectable').first().click()
  await expect.poll(async () => (await snapshot(page)).state.players[0]!.resources.fuel)
    .toBe((initial.state.players[0]!.resources.fuel ?? 0) + 3)
  expect(((await snapshot(page)).state.players[0]!.farmTerrain ?? []).filter(tile => tile.kind === 'moor'))
    .toHaveLength((initial.state.players[0]!.farmTerrain ?? []).filter(tile => tile.kind === 'moor').length - 1)
  await expect(cutPeat).toHaveAttribute('aria-pressed', 'false')
  await expect(cutPeat).not.toHaveClass(/\bselected\b/)
  expect(await ruleCommands(page)).toMatchObject([{ type: 'specialAction' }])
  expect(pageErrors).toEqual([])
})

test('real hotseat public farms stay read-only on desktop/mobile, across reconnect, turns, harvest and reload', async ({ page }, testInfo) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await captureRoom(page)
  // Use a real cookie-backed owner so reconnect/reload exercise normal authentication.
  const username = `hotseat_1098_${Date.now().toString(36)}`
  const oauth = await page.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
    providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: 'Alice',
  } })
  expect(oauth.ok()).toBe(true)
  const complete = await page.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, { data: {
    username, displayName: 'Alice', password: 'hotseat-pass-1098', confirmPassword: 'hotseat-pass-1098',
  } })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await page.goto(`${FRONTEND_URL}/?devMode=1`)
  await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
  await page.getByRole('checkbox', { name: /Snake opening/ }).uncheck()
  await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
  await finishHotseatOpening(page)
  const initial = await snapshot(page)
  expect(initial.state.players).toHaveLength(2)
  const names = initial.state.players.map((player, index) => getPlayerDisplayName('en', player.name, index, player.nameIsDefault))
  await expect(page.locator('[data-hand-anchor="p1"]')).toBeVisible()

  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.evaluate(() => { window.hotseatProbe.sent = [] })
    await browse(page, names[1]!, mobile)
    await expect(page.locator('[data-farm-tile-player="p2"][data-farm-tile-key="0-2"]')).toBeVisible()
    await expect(page.locator('[data-hand-anchor]')).toHaveCount(0)
    await expect(page.locator('.dev-panel')).toHaveCount(0)
    await expect(page.locator('.interaction-bar')).toBeHidden()
    await expect(page.locator('[data-action-id="forest"] button')).toBeDisabled()
    await expect(page.locator('.farm-tile.selectable, .farm-tile.selected')).toHaveCount(0)
    await page.locator('[data-farm-tile-player="p2"][data-farm-tile-key="0-2"]').click()
    expect(await ruleCommands(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(mobile ? 'public-farm-mobile.png' : 'public-farm-desktop.png') })
    await page.getByRole('button', { name: `Return to ${names[0]} to continue` }).click()
    await expect(page.locator('[data-hand-anchor="p1"]')).toBeVisible()
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await browse(page, names[1]!, false)
  await page.evaluate(() => window.hotseatProbe.socket.close())
  await expect(page.locator('.farm-grid')).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Return to ${names[0]} to continue` })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: new RegExp(names[1]!) })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: `Return to ${names[0]} to continue` }).click()

  await page.locator('[data-action-id="forest"] button').click()
  await expect.poll(async () => (await snapshot(page)).state.players[0]!.resources.wood).toBe(3)
  await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await confirmHandoff(page, names[1]!)
  await expect(page.locator('[data-hand-anchor="p2"]')).toBeVisible()
  await page.locator('[data-action-id="farmland"] button').click()
  const plowTile = page.locator('[data-farm-tile-player="p2"][data-farm-tile-key="0-2"]')
  await expect(plowTile).toHaveClass(/selectable/)
  await plowTile.click()
  await expect(plowTile).toHaveClass(/selected/)
  await browse(page, names[0]!, false)
  await expect(page.locator('.farm-tile.selectable, .farm-tile.selected')).toHaveCount(0)
  await page.getByRole('button', { name: `Return to ${names[1]} to continue` }).click()
  await expect(plowTile).toHaveClass(/selected/)
  await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm plow', exact: true }).click()
  await expect.poll(async () => (await snapshot(page)).state.players[1]!.fields.some(field => field.row === 0 && field.col === 2)).toBe(true)
  await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click()
  await confirmHandoff(page, names[0]!)
  await browse(page, names[1]!, false)
  await expect(page.locator('[data-farm-tile-player="p2"][data-farm-tile-key="0-2"]')).toHaveClass(/field/)
  await page.getByRole('button', { name: `Return to ${names[0]} to continue` }).click()

  const crossPlayer = await reachCrossPlayerFeed(page, names)
  expect(crossPlayer.interaction.stateId).toBe('wait')
  if (crossPlayer.interaction.stateId !== 'wait') throw new Error('Expected feeding responder')
  const responder = crossPlayer.interaction.playerIndex
  expect(responder).not.toBe(crossPlayer.state.currentPlayerIndex)
  await expect(page.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveCount(0)
  await expect(page.locator(`[data-hand-anchor="p${responder + 1}"]`)).toBeVisible()
  await expect(page.locator('.exchange-overlay')).toBeVisible()
  await page.evaluate(() => { window.hotseatProbe.sent = [] })
  await browse(page, names[1 - responder]!, false)
  await expect(page.locator('[data-hand-anchor]')).toHaveCount(0)
  await expect(page.locator('.exchange-overlay')).toBeHidden()
  await expect(page.locator('.interaction-bar')).toBeHidden()
  expect(await ruleCommands(page)).toEqual([])
  await page.getByRole('button', { name: `Return to ${names[responder]} to continue` }).click()
  await expect(page.locator('.exchange-overlay')).toBeVisible()

  await browse(page, names[1 - responder]!, false)
  await page.reload()
  await confirmHandoff(page, names[responder]!)
  await expect(page.getByRole('tab', { name: new RegExp(names[responder]!) })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator(`[data-hand-anchor="p${responder + 1}"]`)).toBeVisible()
  expect(pageErrors).toEqual([])
})
