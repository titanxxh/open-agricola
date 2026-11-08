// @covers client/app/GameContainerApi.tsx
// @covers client/app/multihand-seat.ts
// @covers client/components/board/FarmBoard.tsx
// @covers server/game/room-viewer.ts
// @covers client/app/MultihandSeatControls.tsx
// @covers client/app/multihand.css
// @covers client/app/MyActiveGames.tsx
// @covers client/app/use-turn-tab-title.ts
// @covers server/lobby-my-rooms.ts
import { expect, test, type BrowserContext } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'
import { SoloBrowserDriver } from './helpers/standard-solo-acceptance'

test.use({ actionTimeout: 15_000 })

test('two accounts automatically follow four owned seats and recover the active alternate seat', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const contexts: BrowserContext[] = []
  const drivers: SoloBrowserDriver[] = []
  try {
    for (const [index, name] of ['Host', 'Guest'].entries()) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
      contexts.push(context)
      await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
      await authenticateTeamAccount(context, `mh${index}_${Date.now().toString(36)}`, name)
      drivers.push(new SoloBrowserDriver(await context.newPage()))
    }
    const [host, guest] = drivers
    await host.page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
    await host.page.getByRole('button', { name: 'Multihand game', exact: true }).click()
    await expect(host.page.getByRole('combobox', { name: 'Team scoring' })).toHaveValue('category-min')
    await expect(host.page.getByRole('combobox', { name: 'Seats per team' })).toHaveValue('2')
    await expect(host.page.getByRole('combobox', { name: 'Seat arrangement' })).toHaveValue('separated')
    await expect(host.page.getByRole('combobox', { name: 'Teammate visibility' })).toHaveCount(0)
    await host.page.getByRole('button', { name: 'Create Game', exact: true }).click()
    await expect(host.page.locator('.team-waiting-room')).toBeVisible()
    const roomId = await host.page.locator('.ws-invite-roomid strong').textContent()
    if (!roomId) throw new Error('Missing multihand room identity')
    await guest.page.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
    await expect(guest.page.locator('.team-waiting-room')).toBeVisible()
    await expect(host.page.getByRole('button', { name: 'Start game', exact: true })).toBeEnabled()
    await host.page.getByRole('button', { name: 'Start game', exact: true }).click()
    for (const [account, driver] of drivers.entries()) {
      await expect(driver.page.locator('.game-layout')).toBeVisible()
      const joined = driver.events.findLast(event => event.type === 'roomJoined')
      expect(joined).toMatchObject({ controlledPlayerIndexes: [account, account + 2],
        visiblePlayerIds: [`p${account + 1}`, `p${account + 3}`] })
      for (const [index, player] of driver.state.players.entries()) {
        expect(player.occupationHand).toHaveLength(7)
        if (index % 2 === account) expect(player.occupationHand).not.toContain('?')
        else expect(player.occupationHand).toEqual(Array(7).fill('?'))
      }
      await expect(driver.page.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveCount(0)
    }

    // Opening hand offers still use their authoritative responder and normal UI.
    for (let step = 0; step < 16 && host.interaction.stateId !== 'idle'; step++) {
      const actor = host.interaction.stateId === 'wait' ? host.interaction.playerIndex : host.state.currentPlayerIndex
      const driver = drivers[actor % 2]!
      await expect.poll(() => driver.envelope.version).toBe(host.envelope.version)
      const request = driver.interaction
      if (request.stateId !== 'wait') throw new Error(`Unexpected opening interaction: ${JSON.stringify(request)}`)
      if (request.request.kind === 'choice') {
        const option = request.request.options.find(choice => choice.value === '__skip__' || choice.value === 'no') ?? request.request.options[0]
        if (!option) throw new Error('Opening offer has no option')
        await driver.choice(option.value)
      } else if (request.request.kind === 'confirm-player-switch' || request.request.kind === 'confirm-next-player') {
        await driver.ui('opening handoff response', () => driver.page.locator('.interaction-bar')
          .getByRole('button', { name: /^(Continue|Confirm switch)$/ }).click())
      } else throw new Error(`Unexpected opening request: ${JSON.stringify(request.request)}`)
      await expect.poll(() => host.envelope.version).toBe(driver.envelope.version)
    }
    expect(host.interaction).toMatchObject({ stateId: 'idle' })
    expect(host.state.currentPlayerIndex).toBe(0)
    await expect(host.page.locator('[role="tab"][data-player="p1"]')).toHaveAttribute('aria-selected', 'true')
    await host.action('forest')
    await host.ui('confirm outgoing first seat', () => host.page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click())
    await expect.poll(() => guest.state.currentPlayerIndex).toBe(1)
    await expect(guest.page.locator('[role="tab"][data-player="p2"]')).toHaveAttribute('aria-selected', 'true')
    await guest.action('clay-pit')
    await guest.ui('confirm outgoing opponent seat', () => guest.page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click())
    await expect.poll(() => host.state.currentPlayerIndex).toBe(2)
    await expect(host.page.locator('[role="tab"][data-player="p3"]')).toHaveAttribute('aria-selected', 'true')
    await expect(host.page.locator('[data-hand-anchor="p3"]')).toBeVisible()
    await expect(host.page.locator('.farm-header [data-operation-player-id="p3"]').first()).toHaveText('Acting as seat 3: Host')
    await expect(host.page.locator('.hand-cards [data-operation-player-id="p3"]')).toHaveText('Acting as seat 3: Host')
    await expect(host.page.locator('[role="tab"][data-owned="true"]')).toHaveCount(2)
    await expect(host.page.locator('[data-action-id="reed-bank"] button').first()).toBeEnabled()
    await expect(host.page.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveCount(0)
    await host.page.screenshot({ path: testInfo.outputPath('owned-alternate-auto-selected.png'), fullPage: true })

    await host.page.locator('[role="tab"][data-player="p1"]').click()
    await expect(host.page.locator('[data-hand-anchor="p1"]')).toBeVisible()
    await expect(host.page.locator('.hand-cards [data-operation-player-id="p3"]')).toHaveText('Acting as seat 3: Host')
    await expect(host.page.locator('[data-action-id="reed-bank"] button').first()).toBeDisabled()
    await host.page.locator('[role="tab"][data-player="p2"]').click()
    await expect(host.page.locator('[data-hand-anchor]')).toHaveCount(0)
    await expect(host.page.locator('.hand-hidden')).toContainText('Hand cards are hidden')
    const lobby = await contexts[0]!.newPage()
    await lobby.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
    const myGame = lobby.locator('.my-game').filter({ has: lobby.locator('[data-my-turn="true"]') })
    await expect(myGame).toHaveCount(1)
    await expect(myGame.locator('.my-game__player[data-owned="true"]')).toHaveCount(2)
    await expect(myGame.locator('.my-game__player[data-current="true"]')).toHaveText('Host(Me)')
    await expect(lobby).toHaveTitle('◢ Open Agricola')
    await lobby.close()
    await host.page.reload()
    await expect(host.page.locator('[role="tab"][data-player="p3"]')).toHaveAttribute('aria-selected', 'true')
    await expect(host.page.locator('[data-hand-anchor="p3"]')).toBeVisible()
    expect(host.events.findLast(event => event.type === 'roomJoined')).toMatchObject({ controlledPlayerIndexes: [0, 2] })
    await host.action('reed-bank')
    expect(host.state.actionSpaces.find(space => space.id === 'reed-bank')?.takenBy).toEqual([{ playerId: 'p3', workerId: '1' }])
  } finally {
    for (const [index, driver] of drivers.entries()) {
      if (driver.events.some(event => event.type === 'stateUpdate')) await driver.attach(testInfo, `multihand-account-${index}`)
    }
    for (const context of contexts) await context.close()
  }
})

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`manual simultaneous seats preserve picks across independent hand browsing at ${viewport.width}px`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const contexts: BrowserContext[] = []
    const drivers: SoloBrowserDriver[] = []
    try {
      for (const [index, name] of ['Host', 'Guest'].entries()) {
        const context = await browser.newContext({ viewport, ...(viewport.width < 900 ? { isMobile: true, hasTouch: true } : {}) })
        contexts.push(context)
        await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
        await authenticateTeamAccount(context, `mo${index}_${Date.now().toString(36)}`, name)
        drivers.push(new SoloBrowserDriver(await context.newPage()))
      }
      const [host, guest] = drivers
      await host.page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await host.page.getByRole('button', { name: 'Multihand game', exact: true }).click()
      await host.page.getByRole('button', { name: 'Simultaneous draft', exact: true }).click()
      await host.page.getByRole('button', { name: 'Create Game', exact: true }).click()
      await expect(host.page.locator('.team-waiting-room')).toBeVisible()
      const roomId = await host.page.locator('.ws-invite-roomid strong').textContent()
      if (!roomId) throw new Error('Missing simultaneous multihand room')
      await guest.page.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await expect(guest.page.locator('.team-waiting-room')).toBeVisible()
      await host.page.getByRole('button', { name: 'Start game', exact: true }).click()
      const selector = host.page.getByRole('combobox', { name: 'Choose a seat to handle' })
      await expect(selector).toHaveValue('p1')
      await expect(selector.locator('option')).toHaveCount(2)
      await selector.selectOption('p3')
      await expect(host.page.locator('.multihand-seat-controls [data-operation-player-id="p3"]')).toHaveText('Acting as seat 3: Host')
      await expect(host.page.locator('[data-player-id="p3"]')).toHaveAttribute('data-is-you', 'true')
      await host.page.locator('.draft-pool-row-occ .draft-card').first().click()
      const commandsBefore = host.commands.filter(command => command.type === 'draftSubmit').length
      const requestBefore = host.envelope.inputWindow
      await host.page.getByRole('button', { name: 'View your hand', exact: true }).click()
      const hand = host.page.getByRole('dialog', { name: 'View your hand', exact: true })
      await expect(hand).toBeVisible()
      await hand.getByRole('combobox', { name: 'View your hand' }).selectOption('p1')
      await expect(hand.locator('[data-hand-player-id="p1"]')).toBeVisible()
      await expect(hand.locator('[data-operation-player-id="p3"]')).toHaveText('Acting as seat 3: Host')
      expect(host.commands.filter(command => command.type === 'draftSubmit')).toHaveLength(commandsBefore)
      expect(host.envelope.inputWindow).toEqual(requestBefore)
      await hand.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(selector).toHaveValue('p3')
      await host.page.locator('.draft-pool-row-minor .draft-card').first().click()
      await expect(host.page.getByRole('button', { name: 'Confirm picks', exact: true })).toBeEnabled()
      await host.ui('manual owned third seat', () => host.page.getByRole('button', { name: 'Confirm picks', exact: true }).click())
      expect(host.commands.findLast(command => command.type === 'draftSubmit')).toMatchObject({ playerId: 'p3' })
      await expect(selector).toHaveValue('p1')
      expect(host.state.phase).toBe('draft')
      await host.page.screenshot({ path: testInfo.outputPath(`manual-seat-${viewport.width}.png`), fullPage: true })
      await host.page.locator('.draft-pool-row-occ .draft-card').first().click()
      await host.page.locator('.draft-pool-row-minor .draft-card').first().click()
      await host.ui('remaining owned first seat', () => host.page.getByRole('button', { name: 'Confirm picks', exact: true }).click())
      await expect(selector).toHaveCount(0)
      await expect(host.page.locator('.draft-overlay-status')).toHaveAttribute('data-already-submitted', '1')
      expect(host.state.phase).toBe('draft')
      await expect(host.page.getByRole('dialog', { name: 'Hotseat handoff' })).toHaveCount(0)
      expect(await host.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await host.page.getByRole('button', { name: 'View your hand', exact: true }).click()
      await hand.getByRole('combobox', { name: 'View your hand' }).selectOption('p3')
      await expect(hand.locator('[data-hand-player-id="p3"] [data-card-anchor]')).toHaveCount(2)
      await hand.screenshot({ path: testInfo.outputPath(`own-hand-${viewport.width}.png`) })
    } finally {
      for (const [index, driver] of drivers.entries()) if (driver.events.some(event => event.type === 'stateUpdate')) {
        await driver.attach(testInfo, `manual-seat-account-${index}`)
      }
      for (const context of contexts) await context.close()
    }
  })
}
