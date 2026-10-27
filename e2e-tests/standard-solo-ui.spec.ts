import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test'
import type { StateUpdateEnvelope } from '../shared/contract/protocol/game'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { recordSoloEvidence, SoloBrowserDriver } from './helpers/standard-solo-acceptance'
import { checkpoint } from './helpers/standard-solo-process'

test.use({ actionTimeout: 10_000 })

const cookieValue = (response: APIResponse, name: string): string => {
  const cookie = response.headersArray().find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))
  if (!cookie) throw new Error(`Missing ${name} cookie`)
  return cookie.value.split(';')[0]!.slice(name.length + 1)
}

async function authenticate(context: BrowserContext, request: APIRequestContext, username: string) {
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, { data: {
    providerUserId: `solo-ui-${username}`, providerLogin: username, email: `${username}@example.com`, displayName: username,
  } })
  expect(oauth.ok()).toBe(true)
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: { username, displayName: username, password: 'solo-ui-pass-550', confirmPassword: 'solo-ui-pass-550' },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  await context.addCookies([{ name: 'oa_session', value: cookieValue(complete, 'oa_session'), url: FRONTEND_URL }])
  await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
}

function observe(page: Page) {
  const driver = new SoloBrowserDriver(page)
  return { driver,
    get snapshots() { return driver.events.filter((event): event is StateUpdateEnvelope => event.type === 'stateUpdate') },
    get sent() { return driver.commands },
    latest: () => driver.payload,
  }
}

async function openSolo(page: Page, chooseSeven = false, parents = false, expansions = false) {
  await page.goto(FRONTEND_URL)
  await page.getByRole('button', { name: 'Solo game', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Start a solo game' })
  await expect(setup.getByText('1 player', { exact: true })).toBeVisible()
  if (chooseSeven) await setup.getByRole('radio', { name: /Choose 7 from 10/ }).check()
  if (parents) await setup.getByRole('checkbox', { name: /Parent Cards/ }).check()
  if (expansions) {
    await setup.getByRole('checkbox', { name: 'Enable Through the Seasons expansion' }).check()
    await setup.getByRole('checkbox', { name: 'Enable Farmers of the Moor expansion' }).check()
  }
  await setup.getByRole('button', { name: 'Start solo game', exact: true }).click()
  await expect(page).toHaveURL(/\?room=[^&]+$/)
  await expect(page.locator('.ws-invite-roomid')).toHaveCount(0)
}

async function declineElderOpening(driver: SoloBrowserDriver) {
  await expect.poll(() => driver.state.phase).toBe('playing')
  const opening = driver.interaction
  if (opening.stateId === 'idle') return
  expect(driver.state.round).toBe(1)
  expect(driver.state.roundPhase).toBe('preparation')
  expect(opening).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'E096_Elder',
    spaceId: '__stage:onRoundStart', promptKey: 'ui.interactionOptionalAction', request: { kind: 'choice' } })
  if (opening.stateId !== 'wait' || opening.request.kind !== 'choice') throw new Error('Expected the optional Elder opening choice')
  expect(opening.allowedCommands).toContain('resolveChoice')
  const skip = opening.request.options.find(option => option.value === '__skip__')
  expect(skip).toBeDefined()
  expect(skip?.disabled).not.toBe(true)
  const resources = structuredClone(driver.state.players[0]!.resources)
  await driver.choice('__skip__')
  await expect.poll(() => driver.interaction.stateId).toBe('idle')
  expect(driver.state.players[0]!.resources).toEqual(resources)
  expect(driver.state.players[0]!.occupationHand).toContain('E096_Elder')
  expect(driver.state.players[0]!.occupationPlayed).not.toContain('E096_Elder')
}

test('solo random starts directly and keeps ordinary action confirmation', async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const outsider = await browser.newContext()
  try {
    const username = `solo_random_${Date.now().toString(36)}`
    await authenticate(context, request, username)
    const page = await context.newPage()
    const state = observe(page)
    await openSolo(page)
    await expect(page.locator('.game-layout')).toBeVisible()
    await declineElderOpening(state.driver)
    expect(state.latest().state.players).toHaveLength(1)
    expect(state.latest().state.round).toBe(1)
    const wood = state.latest().state.players[0]!.resources.wood
    await page.locator('[data-action-id="forest"] button').first().click()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    expect(state.latest().state.players[0]!.resources.wood).toBe(wood + 2)
    expect(state.latest().state.round).toBe(1)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const food = state.latest().state.players[0]!.resources.food
    await page.locator('[data-action-id="day-laborer"] button').first().click()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    expect(state.latest().state.players[0]!.resources.food).toBe(food + 2)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect.poll(() => state.latest().state.round).toBe(2)
    expect(state.sent.filter(command => command.type === 'createRoom')).toHaveLength(1)
    const { roomId, version } = state.driver.envelope
    const player = structuredClone(state.latest().state.players[0]!)
    const snapshotCount = state.snapshots.length
    await page.goto(FRONTEND_URL)
    const game = page.locator('.my-game')
    await expect(game).toHaveCount(1)
    await expect(game.locator('.my-game__name')).toHaveText([username])
    await expect(game.locator('[data-player-color]')).toHaveAttribute('data-player-color', player.color)
    await expect(game).toContainText('Started')
    await expect(game.locator('time')).toBeVisible()
    await expect(game).not.toContainText(roomId)
    await game.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(page.locator('.game-layout')).toBeVisible()
    await expect.poll(() => state.snapshots.length).toBeGreaterThan(snapshotCount)
    expect(state.driver.envelope).toMatchObject({ roomId, version })
    expect(state.latest().state.round).toBe(2)
    expect(state.latest().state.players[0]!.resources).toEqual(player.resources)
    expect(state.latest().state.players[0]!.occupationHand).toEqual(player.occupationHand)
    expect(state.latest().state.players[0]!.minorHand).toEqual(player.minorHand)

    await authenticate(outsider, request, `solo_outsider_${Date.now().toString(36)}`)
    const otherPage = await outsider.newPage()
    const [mine, publicRooms] = await Promise.all([
      otherPage.waitForResponse(response => new URL(response.url()).pathname === '/api/lobby/my-rooms'),
      otherPage.waitForResponse(response => new URL(response.url()).pathname === '/api/rooms'),
      otherPage.goto(FRONTEND_URL),
    ])
    for (const response of [mine, publicRooms]) {
      expect(response.ok()).toBe(true)
      const result: { ok: boolean; rooms: Array<{ id: string }> } = await response.json()
      expect(result.ok).toBe(true)
      expect(result.rooms.map(room => room.id)).not.toContain(roomId)
    }
    await expect(otherPage.getByRole('button', { name: 'Solo game', exact: true })).toBeVisible()
    await expect(otherPage.locator('body')).not.toContainText(username)
    await expect(otherPage.locator('body')).not.toContainText(roomId)
    await page.screenshot({ path: 'output/playwright/solo-random-desktop.png' })
  } finally { await Promise.all([context.close(), outsider.close()]) }
})

test('solo choose-7 preserves candidates and the confirmed result across fresh browser contexts', async ({ browser, request }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
  const second = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  let confirmedContext: BrowserContext | undefined
  try {
    await authenticate(context, request, `solo_choose_${Date.now().toString(36)}`)
    const page = await context.newPage()
    const state = observe(page)
    await openSolo(page, true, true)
    const overlay = page.getByRole('dialog', { name: 'Choose your starting hand' })
    await expect(overlay).toBeVisible()
    const source = state.latest().interaction
    if (source.stateId !== 'wait' || source.request.kind !== 'solo-hand-selection') throw new Error(JSON.stringify(source))
    const groups = source.request.groups
    expect(groups.map(group => [group.kind, group.cardIds.length, group.keepCount])).toEqual([['occupation', 10, 7], ['minor', 10, 7]])
    const fieldsets = overlay.locator('fieldset')
    const confirm = overlay.getByRole('button', { name: 'Confirm starting hand' })
    await expect(confirm).toBeDisabled()
    for (const width of [320, 667, 375]) {
      await page.setViewportSize({ width, height: width === 667 ? 320 : 812 })
      await expect(confirm).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    const firstCard = fieldsets.nth(0).locator('.player-card').first()
    await firstCard.tap()
    await expect(page.locator('.card-details')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(fieldsets.nth(0).getByRole('checkbox').first()).not.toBeChecked()
    for (let i = 0; i < 7; i++) await fieldsets.nth(0).getByRole('checkbox').nth(i).check()
    await fieldsets.nth(0).getByRole('checkbox').nth(7).check()
    for (let i = 0; i < 7; i++) await fieldsets.nth(1).getByRole('checkbox').nth(i).check()
    await expect(confirm).toBeDisabled()
    await fieldsets.nth(0).getByRole('checkbox').nth(7).uncheck()
    await expect(confirm).toBeEnabled()
    await page.getByRole('button', { name: 'Display language: English' }).click()
    await page.getByRole('option', { name: '简体中文' }).click()
    await expect(page.getByRole('dialog', { name: '选择起始手牌' }).getByRole('checkbox', { checked: true })).toHaveCount(14)
    await page.getByRole('button', { name: /语言.*简体中文/ }).click()
    await page.getByRole('option', { name: 'English' }).click()
    await page.screenshot({ path: 'output/playwright/solo-choose-mobile.png' })
    const roomUrl = page.url()
    await page.reload()
    await expect(overlay).toBeVisible()
    expect(state.latest().state.soloHandSelection?.groups).toEqual(groups)
    await expect(overlay.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await second.addCookies(await context.cookies())
    await second.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const secondPage = await second.newPage()
    const restored = observe(secondPage)
    await secondPage.goto(roomUrl)
    const restoredOverlay = secondPage.getByRole('dialog', { name: 'Choose your starting hand' })
    await expect(restoredOverlay).toBeVisible()
    expect(restored.latest().state.soloHandSelection?.groups).toEqual(groups)
    await expect(restoredOverlay.getByRole('checkbox', { checked: true })).toHaveCount(0)
    for (let group = 0; group < 2; group++) for (let card = 0; card < 7; card++) {
      await restoredOverlay.locator('fieldset').nth(group).getByRole('checkbox').nth(card).check()
    }
    await restoredOverlay.getByRole('button', { name: 'Confirm starting hand' }).dblclick()
    await expect(restoredOverlay).toBeHidden()
    expect(restored.sent.filter(command => command.type === 'soloHandSubmit')).toHaveLength(1)
    await expect(secondPage.locator('.parent-selection-overlay')).toBeVisible()
    expect(restored.latest().state.players[0]!.occupationHand).toEqual(groups[0]!.cardIds.slice(0, 7))
    expect(restored.latest().state.players[0]!.minorHand).toEqual(groups[1]!.cardIds.slice(0, 7))
    const submitted = restored.sent.find(command => command.type === 'soloHandSubmit')
    if (!submitted?.commandContext) throw new Error('Missing confirmed hand command identity')
    await expect.poll(() => restored.driver.events.filter(event => event.type === 'commandReceipt' && event.status === 'completed'
      && event.receipt.commandId === submitted.commandContext?.commandId).length).toBe(1)
    const receipt = restored.driver.receipt
    expect(receipt.commandId).toBe(submitted.commandContext.commandId)
    expect(receipt.outcome).toMatchObject({ ok: true, stepNo: 1 })
    const accepted = structuredClone({ kept: restored.latest().state.soloHandSelection?.kept,
      occupations: restored.latest().state.players[0]!.occupationHand, minors: restored.latest().state.players[0]!.minorHand,
      parents: restored.latest().state.parentSelection, phase: restored.latest().state.phase,
    })
    expect(accepted.phase).toBe('parent-selection')
    const roomId = new URL(roomUrl).searchParams.get('room')!
    const before = await checkpoint(roomId)
    expect(before.stepNo).toBe(receipt.outcome.stepNo)
    expect(before.receipts.filter(row => row.scope_id === receipt.scopeId && row.command_id === receipt.commandId)).toHaveLength(1)
    const cookies = await second.cookies()
    await Promise.all([context.close(), second.close()])
    confirmedContext = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    await confirmedContext.addCookies(cookies)
    await confirmedContext.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const confirmedPage = await confirmedContext.newPage()
    const recovered = observe(confirmedPage)
    await confirmedPage.goto(roomUrl)
    await expect(confirmedPage.locator('.parent-selection-overlay')).toBeVisible()
    await expect(confirmedPage.getByRole('dialog', { name: 'Choose your starting hand' })).toHaveCount(0)
    expect({ kept: recovered.latest().state.soloHandSelection?.kept,
      occupations: recovered.latest().state.players[0]!.occupationHand, minors: recovered.latest().state.players[0]!.minorHand,
      parents: recovered.latest().state.parentSelection, phase: recovered.latest().state.phase,
    }).toEqual(accepted)
    expect(recovered.driver.envelope.version).toBe(receipt.outcome.roomVersion)
    expect(recovered.sent.filter(command => command.type === 'soloHandSubmit')).toHaveLength(0)
    const after = await checkpoint(roomId)
    expect({ stepNo: after.stepNo, frameHash: after.frameHash, receipts: after.receipts })
      .toEqual({ stepNo: before.stepNo, frameHash: before.frameHash, receipts: before.receipts })
    await recordSoloEvidence(testInfo, 'confirmed-hand-new-context', { accepted, receipt,
      before: { stepNo: before.stepNo, frameHash: before.frameHash, receipts: before.receipts },
      after: { stepNo: after.stepNo, frameHash: after.frameHash, receipts: after.receipts }, commandsAfterRecovery: recovered.sent,
    })
    await confirmedPage.locator('[data-section="mother"] .parent-choice-card').first().click()
    await confirmedPage.locator('[data-section="father"] .parent-choice-card').first().click()
    await confirmedPage.locator('.parent-selection-confirm').click()
    await expect(confirmedPage.locator('.game-layout')).toBeVisible()
  } finally { await Promise.all([context.close(), second.close(), confirmedContext?.close()]) }
})

test('a natural fourteen-round solo keeps both owner rematch entries independent from the Viewer', async ({ browser, request }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const visitor = await browser.newContext()
  try {
    await authenticate(context, request, `solo_finish_${Date.now().toString(36)}`)
    const page = await context.newPage()
    const state = observe(page)
    try {
    await openSolo(page)
    await expect(page.locator('.game-layout')).toBeVisible()
    const originalUrl = page.url()
    const originalId = new URL(originalUrl).searchParams.get('room')!
    const harvestRounds = [4, 7, 9, 11, 13, 14]
    const foodAfterRound = [3, 6, 9, 6, 9, 12, 9, 12, 9, 12, 9, 12, 9, 6]
    await declineElderOpening(state.driver)
    for (let round = 1; round <= 14; round++) {
      expect(state.latest().interaction.stateId).toBe('idle')
      for (const actionId of ['day-laborer', 'fishing']) {
        await page.locator(`[data-action-id="${actionId}"] button`).first().click()
        await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
        const interaction = state.latest().interaction
        if (interaction.stateId !== 'wait' || interaction.request.kind !== 'confirm-next-player' || interaction.request.nextPlayerIndex !== 0) {
          throw new Error(`Unexpected solo continuation in round ${round}: ${JSON.stringify(interaction)}`)
        }
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
      }
      if (round < 14) await expect.poll(() => state.latest().state.round).toBe(round + 1)
      else await expect.poll(() => state.latest().state.gameOver).toBe(true)
      expect(state.latest().state.players[0]!.resources.food).toBe(foodAfterRound[round - 1])
      expect(state.latest().state.players[0]!.resources.begging).toBe(0)
    }
    expect(state.latest().scores?.[0]?.total).toBe(-14)
    const observedHarvestRounds = [...new Set(state.snapshots.flatMap(snapshot => snapshot.payload.state.events
      .filter(event => event.type === 'harvest.started').map(event => event.round)))]
    expect(observedHarvestRounds).toEqual(harvestRounds)
    const rematch = page.getByRole('button', { name: 'Play again with these settings' })
    await expect(rematch).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Draft', exact: true })).toHaveCount(0)
    await page.screenshot({ path: 'output/playwright/solo-immediate-completed.png' })
    await rematch.dblclick()
    await expect(page).not.toHaveURL(originalUrl)
    await expect(page.locator('.game-layout')).toBeVisible()
    const immediateId = new URL(page.url()).searchParams.get('room')!
    expect(immediateId).not.toBe(originalId)
    expect(state.latest().state.round).toBe(1)
    expect(state.sent.filter(command => command.type === 'createRoom')).toHaveLength(2)

    await page.route('**/replay-viewers/**', route => route.abort())
    await page.goto(originalUrl)
    await expect(page.locator('.solo-completed-summary')).toContainText('-14')
    await expect(rematch).toBeEnabled()
    await expect(page.getByRole('alert')).toBeVisible()
    const anonymousPage = await visitor.newPage()
    await anonymousPage.goto(originalUrl)
    await expect(anonymousPage.locator('.solo-completed-summary')).toContainText('-14')
    await expect(anonymousPage.getByRole('button', { name: 'Play again with these settings' })).toHaveCount(0)
    await page.screenshot({ path: 'output/playwright/solo-refreshed-completed.png' })
    await rematch.click()
    await expect(page).not.toHaveURL(originalUrl)
    await expect(page.locator('.game-layout')).toBeVisible()
    const refreshedId = new URL(page.url()).searchParams.get('room')!
    expect(refreshedId).not.toBe(originalId)
    expect(refreshedId).not.toBe(immediateId)
    expect(state.latest().state.round).toBe(1)
    const retained = await context.request.get(`${BACKEND_URL}/api/v1/game-contexts/${originalId}`)
    expect((await retained.json()).result.players[0].score).toBe(-14)
    } catch (error) {
      try {
        const snapshot = structuredClone({ latest: state.snapshots.at(-1), events: state.driver.events,
          commands: state.sent.map(command => command.type === 'auth' ? { type: 'auth', token: '<REDACTED>' } : command),
          lastReceipt: state.driver.events.findLast(event => event.type === 'commandReceipt'),
        })
        const dom = await page.content().catch(() => null)
        const persisted = snapshot.latest ? await checkpoint(snapshot.latest.roomId).catch(() => ({ unavailable: true })) : null
        await recordSoloEvidence(testInfo, 'natural-solo-failure', { ...snapshot, dom, persisted })
      } catch {
        console.warn('Unable to record natural solo failure diagnostics')
      }
      throw error
    }
  } finally { await Promise.all([context.close(), visitor.close()]) }
})

test('three expansions use one grouped hand confirmation and native Moor preparation and retention', async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
  try {
    await authenticate(context, request, `solo_moor_${Date.now().toString(36)}`)
    const page = await context.newPage()
    const state = observe(page)
    await openSolo(page, true, true, true)
    const overlay = page.getByRole('dialog', { name: 'Choose your starting hand' })
    await expect(overlay).toBeVisible()
    expect(state.latest().state.soloHandSelection?.groups.map(group => [group.kind, group.cardIds.length, group.keepCount]))
      .toEqual([['occupation', 10, 7], ['minor', 4, 3], ['moor-minor', 6, 4]])
    const occupationIndexes = state.latest().state.soloHandSelection!.groups[0]!.cardIds
      .flatMap((id, index) => id === 'E096_Elder' ? [] : [index]).slice(0, 7)
    expect(occupationIndexes).toHaveLength(7)
    const quotas = [7, 3, 4]
    for (let group = 0; group < 3; group++) for (let card = 0; card < quotas[group]!; card++) {
      await overlay.locator('fieldset').nth(group).getByRole('checkbox').nth(group === 0 ? occupationIndexes[card]! : card).check()
    }
    await overlay.getByRole('button', { name: 'Confirm starting hand' }).click()
    await expect(page.locator('.parent-selection-overlay')).toBeVisible()
    await page.locator('[data-section="mother"] .parent-choice-card:not([data-card-id="PR01"])').first().click()
    await page.locator('[data-section="father"] .parent-choice-card').first().click()
    await page.locator('.parent-selection-confirm').click()
    await expect(page.locator('.game-layout')).toBeVisible()
    await declineElderOpening(state.driver)
    for (const actionId of ['day-laborer', 'forest']) {
      await page.locator(`[data-action-id="${actionId}"] button`).first().click()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
    }
    await expect(page.getByText('Prepare your special action card', { exact: true })).toBeVisible()
    expect(state.latest().state.round).toBe(2)
    const beforeSupply = state.latest().state.farmersOfTheMoor!
    const oldCurrent = beforeSupply.specialActionCards.find(card => card.location.kind === 'solo-current')!
    const freeActions: typeof oldCurrent.actions = ['hiring-fair', 'cut-peat', 'fell-trees', 'slash-and-burn', 'horse-market']
    const nextIsUseful = beforeSupply.soloSupply!.nextCardActions.some(actionId => freeActions.includes(actionId))
    await page.locator(`.interaction-bar [data-choice-value="${nextIsUseful ? 'replace' : 'keep'}"]`).click()
    await expect(page.getByText('Prepare your special action card', { exact: true })).toBeHidden()
    const supply = state.latest().state.farmersOfTheMoor!
    const current = supply.specialActionCards.find(card => card.location.kind === 'solo-current')!
    if (nextIsUseful) expect(current.id).not.toBe(oldCurrent.id)
    await expect(page.locator('.special-actions-panel [data-card-id]')).toHaveCount(1)
    expect(supply.specialActionCards.some(card => card.location.kind === 'solo-draw')).toBe(false)
    await expect(page.locator('.solo-special-next')).toBeVisible()
    expect(state.latest().interaction, JSON.stringify(state.latest().interaction)).toMatchObject({ stateId: 'idle' })
    await page.locator('[data-action-id="day-laborer"] button').first().click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const action = freeActions.find(actionId => current.actions.includes(actionId))
    if (!action) throw new Error(`No affordable current special action: ${JSON.stringify(current)}`)
    const labels: Record<string, string> = { 'hiring-fair': 'Hiring Fair', 'cut-peat': 'Cut Peat', 'fell-trees': 'Fell Trees', 'slash-and-burn': 'Slash and Burn', 'horse-market': 'Horse Market' }
    await page.locator('.special-actions-panel').getByRole('button', { name: labels[action], exact: true }).click()
    if (action === 'cut-peat' || action === 'fell-trees' || action === 'slash-and-burn') {
      const terrain = action === 'cut-peat' ? 'moor' : 'forest'
      await page.locator(`[data-farm-tile-player="p1"]:has(.farm-terrain-sprite-${terrain})`).first().click()
    }
    await expect.poll(() => state.latest().interaction.stateId).toBe('wait')
    const interaction = state.latest().interaction
    if (interaction.stateId === 'wait' && interaction.request.kind === 'animal-reorg') {
      await page.locator('.interaction-actions').getByRole('button', { name: 'Confirm', exact: true }).click()
    }
    await expect(page.getByText('Keep this special action card?', { exact: true })).toBeVisible()
    const food = state.latest().state.players[0]!.resources.food
    await expect(page.locator('.interaction-rule-hint')).toContainText(`Food available: ${food}`)
    for (const viewport of [{ width: 667, height: 320 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport)
      await expect(page.locator('.interaction-bar [data-choice-value="retain"]')).toBeInViewport({ ratio: 1 })
      await expect(page.locator('.interaction-bar [data-choice-value="discard"]')).toBeInViewport({ ratio: 1 })
    }
    await page.screenshot({ path: 'output/playwright/solo-moor-retention-mobile.png' })
    await page.locator('.interaction-bar [data-choice-value="retain"]').click()
    await expect.poll(() => state.latest().state.farmersOfTheMoor?.soloSupply?.retentionPaid).toBe(true)
    expect(state.latest().state.players[0]!.resources.food).toBe(food - 2)
    await expect(page.locator('.solo-special-supply')).toContainText('Kept for this round')
    expect(state.sent.filter(command => command.type === 'soloHandSubmit')).toHaveLength(1)
  } finally { await context.close() }
})
