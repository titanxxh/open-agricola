import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { BACKEND_URL, saveScreenshot, saveState, FRONTEND_URL } from './fixtures'

test.use({ viewport: { width: 1920, height: 1080 } })

const cookieValue = (response: APIResponse, name: string) => {
  const header = response.headersArray().find(({ name: headerName, value }) =>
    headerName.toLowerCase() === 'set-cookie' && value.startsWith(`${name}=`),
  )
  if (!header) throw new Error(`missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

const authenticate = async (
  context: BrowserContext,
  request: APIRequestContext,
  username: string,
) => {
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: {
      providerUserId: `ws-${username}`,
      providerLogin: username,
      email: `${username}@example.com`,
      displayName: username,
    },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: {
      username,
      displayName: username,
      password: 'ws-pass-550',
      confirmPassword: 'ws-pass-550',
    },
  })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await context.addCookies([{
    name: 'oa_session',
    value: cookieValue(complete, 'oa_session'),
    url: FRONTEND_URL,
  }])
}

test.describe('WS dual-player sync', () => {
  test('one account keeps separate seats through every development context link', async ({ browser, request }) => {
    const context = await browser.newContext()
    await authenticate(context, request, `dev_seats_${Date.now().toString(36)}`)
    try {
      for (const count of [2, 3, 4, 5, 6]) {
        const p1 = await context.newPage()
        const other = await context.newPage()
        const firstEvents: Array<{ type: string }> = []
        const joins: Array<{ roomId: string; playerIndex: number }> = []
        p1.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
          if (typeof payload === 'string') firstEvents.push(JSON.parse(payload))
        }))
        other.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string') return
          const message = JSON.parse(payload)
          if (message.type === 'roomJoined') joins.push(message)
        }))
        try {
          await p1.goto(`${FRONTEND_URL}/?transport=ws&room=dev${count}&player=p1&devMode=1`)
          await expect(p1.locator('.game-layout')).toBeVisible()
          await other.goto(`${FRONTEND_URL}/?transport=ws&room=dev${count}&player=p${count}&devMode=1`)
          await expect(other.locator('.game-layout')).toBeVisible()
          expect(joins.at(-1)?.playerIndex).toBe(count - 1)
          const roomId = joins.at(-1)!.roomId
          const beforeResume = joins.length
          await other.goto(`${FRONTEND_URL}/?context=${roomId}&player=p${count}`)
          await expect(other.locator('.game-layout')).toBeVisible()
          await expect.poll(() => joins.length).toBeGreaterThan(beforeResume)
          expect(joins.at(-1)?.playerIndex).toBe(count - 1)
          const beforeReload = joins.length
          await other.reload()
          await expect(other.locator('.game-layout')).toBeVisible()
          await expect.poll(() => joins.length).toBeGreaterThan(beforeReload)
          expect(joins.at(-1)?.playerIndex).toBe(count - 1)
          expect(firstEvents.some(event => event.type === 'seat_replaced')).toBe(false)
          await expect(p1.locator('.game-layout')).toBeVisible()
        } finally { await p1.close(); await other.close() }
      }
    } finally { await context.close() }
  })

  const countTaken = (page: Page) =>
    page.locator('.action-card-holder.taken').count()
  const takenHolderByText = (page: Page, text: string) =>
    page.locator('.action-card-holder.taken', { hasText: text })

  test('full game flow: create room, sync actions, confirm next player, undo', async ({ browser, request }) => {
    test.setTimeout(120_000)

    const ctx1 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    let ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const suffix = Date.now().toString(36)
    await authenticate(ctx1, request, `ws_a_${suffix}`)
    await authenticate(ctx2, request, `ws_b_${suffix}`)
    const ctx2Storage = await ctx2.storageState()
    const p1 = await ctx1.newPage()
    let p2 = await ctx2.newPage()

    // Step 1: P1 creates room
    console.log('\n=== Step 1: P1 creates room ===')
    await p1.goto(`${FRONTEND_URL}/?player=p1&transport=ws`)
    await p1.waitForSelector('text=/等待玩家加入|waiting for other player/i', { timeout: 15000 })
    await saveScreenshot(p1, '01-p1-waiting')

    const roomId = await p1.locator('.ws-invite-roomid strong').textContent()
    console.log(`Room ID: ${roomId}`)
    expect(roomId).toBeTruthy()
    saveState('ws-room', { roomId })

    // Step 2: P2 joins room
    console.log('\n=== Step 2: P2 joins room ===')
    await p2.goto(`${FRONTEND_URL}/?player=p2&transport=ws&room=${roomId}`)

    await p2.waitForSelector('.game-layout', { timeout: 15000 })
    await p1.waitForSelector('.game-layout', { timeout: 15000 })
    console.log('Both boards loaded')
    // Ordinary rooms keep random deals; decline a possible round-one hand offer
    // before exercising action/undo synchronization.
    const firstAction = p1.locator('.action-card-holder button:not([disabled])').first()
    const setupSkips = [p1, p2].map(page =>
      page.locator('.interaction-bar').getByRole('button', { name: /^(Skip|跳过)$/ }),
    )
    await expect.poll(async () =>
      await firstAction.isVisible() || (await Promise.all(setupSkips.map(skip => skip.isVisible()))).some(Boolean),
    ).toBe(true)
    for (const skip of setupSkips) if (await skip.isVisible()) await skip.click()
    await expect(firstAction).toBeVisible()
    await saveScreenshot(p1, '02-p1-board')
    await saveScreenshot(p2, '02-p2-board')

    // Step 3: P1 takes action (Forest) -> P2 sees taken
    console.log('\n=== Step 3: P1 action -> P2 sync ===')
    const initialTaken = await countTaken(p2)

    const forestBtn = p1.locator('.action-card-holder button:not([disabled])').first()
    await expect(forestBtn).toBeVisible()
    const actionName = (await forestBtn.textContent())?.trim() ?? 'unknown'
    console.log(`P1 clicking: ${actionName}`)
    await forestBtn.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    const takenAfterAction = await countTaken(p2)
    console.log(`Taken count after action: ${initialTaken} -> ${takenAfterAction}`)
    await expect(takenHolderByText(p1, actionName)).toHaveCount(1)
    await expect(takenHolderByText(p2, actionName)).toHaveCount(1)
    await saveScreenshot(p1, '03-p1-after-action')
    await saveScreenshot(p2, '03-p2-after-action')

    // Step 4: Undo must roll both players back to the same taken count
    console.log('\n=== Step 4: Undo sync ===')
    const undoBtn = p1.getByRole('button', { name: /撤销上一步|Undo Step/ })
    await expect(undoBtn).toBeEnabled()
    await undoBtn.click()
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBe(initialTaken)
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBe(initialTaken)
    await expect(takenHolderByText(p1, actionName)).toHaveCount(0)
    await expect(takenHolderByText(p2, actionName)).toHaveCount(0)
    await saveScreenshot(p1, '04-p1-after-undo')
    await saveScreenshot(p2, '04-p2-after-undo')

    // Step 5: Make one new action, then reconnect P2 and assert snapshot convergence
    console.log('\n=== Step 5: Reconnect sync ===')
    const replayBtn = p1.locator('.action-card-holder button:not([disabled])').first()
    await expect(replayBtn).toBeVisible()
    const replayActionName = (await replayBtn.textContent())?.trim() ?? 'unknown'
    await replayBtn.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(() => countTaken(p1), { timeout: 10000 }).toBeGreaterThan(initialTaken)
    const expectedTakenAfterReconnect = await countTaken(p1)

    await ctx2.close()
    ctx2 = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      storageState: ctx2Storage,
    })
    p2 = await ctx2.newPage()
    await p2.goto(`${FRONTEND_URL}/?player=p2&transport=ws&room=${roomId}`)
    await p2.waitForSelector('.game-layout', { timeout: 15000 })
    await expect.poll(() => countTaken(p2), { timeout: 10000 }).toBe(expectedTakenAfterReconnect)
    await expect(takenHolderByText(p2, replayActionName)).toHaveCount(1)
    await saveScreenshot(p2, '05-p2-after-reconnect')

    console.log('\n=== WS dual-player test complete ===')
    await ctx1.close()
    await ctx2.close()
  })

  // This lifecycle case retires the fixed Room used by the join cases above.
  test('development reset opens a new game from p1 during another seat turn', async ({ browser, request }) => {
    const context = await browser.newContext()
    await authenticate(context, request, `dev_reset_${Date.now().toString(36)}`)
    const page = await context.newPage()
    const outgoing: Array<{ type: string }> = []
    const errors: Array<{ type: string; error?: string; code?: string }> = []
    let currentPlayerIndex = -1
    let stateUpdates = 0
    page.on('websocket', socket => {
      socket.on('framesent', ({ payload }) => {
        if (typeof payload === 'string') outgoing.push({ type: JSON.parse(payload).type })
      })
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return
        const event = JSON.parse(payload)
        if (event.type === 'error') errors.push(event)
        if (event.type === 'stateUpdate') {
          currentPlayerIndex = event.payload.state.currentPlayerIndex
          stateUpdates += 1
        }
      })
    })
    try {
      await page.goto(`${FRONTEND_URL}/?player=p1&transport=ws&room=dev2&devMode=1`)
      await expect(page.locator('.game-layout')).toBeVisible()
      const initialRoomId = new URL(page.url()).searchParams.get('room')
      await page.locator('.seed-input input').fill('42')
      await page.getByRole('button', { name: /Reset|重开/ }).click()
      await expect.poll(() => new URL(page.url()).searchParams.get('room')).not.toBe(initialRoomId)
      await expect(page.locator('[data-action-id="forest"] button').first()).toBeEnabled()
      const previousRoomId = new URL(page.url()).searchParams.get('room')
      expect(previousRoomId).toBeTruthy()
      await page.locator('[data-action-id="forest"] button').first().click()
      const confirmSwitch = page.getByRole('button', { name: /Confirm switch|确认切换/i })
      await expect(confirmSwitch).toBeVisible()
      const beforeSwitch = stateUpdates
      await confirmSwitch.click()
      await expect.poll(() => stateUpdates, { timeout: 5000 }).toBeGreaterThan(beforeSwitch)
      await expect.poll(() => currentPlayerIndex, { timeout: 5000 }).toBe(1)
      const reset = page.getByRole('button', { name: /Reset|重开/ })
      await expect(page.locator('[data-action-id="farmland"] button').first()).toBeDisabled()
      await expect(reset, 'A development room reset must remain available during another seat turn').toBeEnabled({ timeout: 5000 })
      await expect(page.locator('.seed-input input')).toBeEditable()
      await page.locator('.seed-input input').fill('42')
      await reset.click()
      try {
        await expect.poll(() => new URL(page.url()).searchParams.get('room'), { timeout: 8000 }).not.toBe(previousRoomId)
      } finally {
        console.log('Development reset result:', { sentReset: outgoing.some(event => event.type === 'newGame'), errors })
      }
      await expect(page.locator('.game-layout')).toBeVisible()
      await expect(page.locator('[data-action-id="forest"] button').first()).toBeEnabled()
    } finally { await context.close() }
  })
})
