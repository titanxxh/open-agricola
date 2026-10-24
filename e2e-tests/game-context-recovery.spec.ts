import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

type RecoveryState = {
  type: 'stateUpdate'
  payload: {
    state: {
      players: Array<{
        color: string
        minorHand: string[]
        occupationHand: string[]
      }>
    }
  }
}

const cookieValue = (response: APIResponse, name: string): string => {
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
  displayName = username,
): Promise<void> => {
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: {
      providerUserId: `context-${username}`,
      providerLogin: username,
      email: `${username}@example.com`,
      displayName,
    },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
    data: {
      username,
      displayName,
      password: 'context-pass-550',
      confirmPassword: 'context-pass-550',
    },
  })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await context.addCookies([{
    name: 'oa_session',
    value: cookieValue(complete, 'oa_session'),
    url: FRONTEND_URL,
  }])
}

const collectStates = (page: Page): RecoveryState[] => {
  const states: RecoveryState[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return
      try {
        const message = JSON.parse(payload) as RecoveryState
        if (message.type === 'stateUpdate') states.push(message)
      } catch {
        return
      }
    })
  })
  return states
}

const latestState = (states: RecoveryState[]) =>
  states.at(-1)!.payload.state

test('two original players recover their own seats without hidden-info leakage', async ({
  browser,
  request,
}) => {
  const suffix = Date.now().toString(36)
  const firstContext = await browser.newContext()
  const secondContext = await browser.newContext()
  await authenticate(firstContext, request, `context_a_${suffix}`)
  await authenticate(secondContext, request, `context_b_${suffix}`)

  let firstPage = await firstContext.newPage()
  let secondPage = await secondContext.newPage()
  await firstPage.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=2`)
  const roomId = await firstPage.locator('.ws-invite-roomid strong').textContent()
  expect(roomId).toBeTruthy()
  expect(new URL(firstPage.url()).search).toBe(`?room=${roomId}`)
  await expect(firstPage.locator('.ws-invite-url')).toHaveText(`${FRONTEND_URL}/?room=${roomId}`)
  await firstPage.locator('.ws-color-option[data-player-color=blue]').click()
  await expect(firstPage.locator('.ws-invite-player').nth(0)).toHaveAttribute('data-player-color', 'blue')
  await secondPage.goto(`${FRONTEND_URL}/?room=${roomId}`)
  await expect(firstPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect(secondPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })

  await firstPage.close()
  await secondPage.close()

  firstPage = await firstContext.newPage()
  secondPage = await secondContext.newPage()
  const firstStates = collectStates(firstPage)
  const secondStates = collectStates(secondPage)
  await Promise.all([
    firstPage.goto(`${FRONTEND_URL}/?room=${roomId}`),
    secondPage.goto(`${FRONTEND_URL}/?room=${roomId}`),
  ])
  await expect(firstPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect(secondPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => firstStates.length).toBeGreaterThan(0)
  await expect.poll(() => secondStates.length).toBeGreaterThan(0)

  expect(new URL(firstPage.url()).search).toBe(`?room=${roomId}`)
  expect(new URL(secondPage.url()).search).toBe(`?room=${roomId}`)
  await secondPage.reload()
  await expect(secondPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  expect(new URL(secondPage.url()).search).toBe(`?room=${roomId}`)

  const first = latestState(firstStates)
  const second = latestState(secondStates)
  expect(first.players.map(player => player.color)).toEqual(['blue', 'red'])
  expect(second.players.map(player => player.color)).toEqual(['blue', 'red'])
  expect(first.players[0]!.minorHand).not.toContain('?')
  expect(first.players[0]!.occupationHand).not.toContain('?')
  expect(first.players[1]!.minorHand).toEqual(first.players[1]!.minorHand.map(() => '?'))
  expect(first.players[1]!.occupationHand).toEqual(first.players[1]!.occupationHand.map(() => '?'))
  expect(second.players[0]!.minorHand).toEqual(second.players[0]!.minorHand.map(() => '?'))
  expect(second.players[0]!.occupationHand).toEqual(second.players[0]!.occupationHand.map(() => '?'))
  expect(second.players[1]!.minorHand).not.toContain('?')
  expect(second.players[1]!.occupationHand).not.toContain('?')

  const outsiderContext = await browser.newContext()
  const outsiderName = `context_outsider_${suffix}`
  await authenticate(outsiderContext, request, outsiderName)
  await outsiderContext.clearCookies()
  const outsiderPage = await outsiderContext.newPage()
  await outsiderPage.goto(`${FRONTEND_URL}/?context=${roomId}`)
  await outsiderPage.fill('#username', outsiderName)
  await outsiderPage.fill('#password', 'context-pass-550')
  await outsiderPage.click('button[type="submit"]')
  await expect(
    outsiderPage.getByRole('heading', {
      name: /无法恢复这局|Unable to resume this game/,
    }),
  ).toBeVisible({ timeout: 15_000 })

  await outsiderContext.close()
  await firstContext.close()
  await secondContext.close()
})


test('waiting room shows every seat, authoritative colors, names, and reconnections', async ({ browser, request }) => {
  const suffix = Date.now().toString(36)
  const hostContext = await browser.newContext({ viewport: { width: 320, height: 844 } })
  const guestContext = await browser.newContext()
  const hostName = '候场房主'
  const guestName = '名字很长的玩家 Waiting room guest'
  try {
    await authenticate(hostContext, request, `waiting_host_${suffix}`, hostName)
    await authenticate(guestContext, request, `waiting_guest_${suffix}`, guestName)
    const host = await hostContext.newPage()
    await host.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=6`)
    const roomId = await host.locator('.ws-invite-roomid strong').textContent()
    expect(roomId).toBeTruthy()
    expect(new URL(host.url()).search).toBe(`?room=${roomId}`)
    const seats = host.locator('.ws-invite-player')
    await expect(seats).toHaveCount(6)
    expect(await seats.evaluateAll(elements => elements.map(element => element.getAttribute('data-player-color'))))
      .toEqual(['red', 'blue', 'black', 'yellow', 'green', 'purple'])
    await expect(seats.nth(0)).toContainText(hostName)
    await expect(host.locator('.ws-waiting-count')).toContainText('1 / 6')
    await expect(host.locator('.ws-invite-player.is-empty')).toHaveCount(5)
    await expect(seats.locator('[role="img"]')).toHaveCount(6)

    await host.locator('.ws-color-option[data-player-color=purple]').click()
    await expect(seats.nth(0)).toHaveAttribute('data-player-color', 'purple')
    await host.reload()
    await expect(host.locator('.ws-invite-player').nth(0)).toHaveAttribute('data-player-color', 'purple')

    let guest = await guestContext.newPage()
    await guest.goto(`${FRONTEND_URL}/?room=${roomId}`)
    await expect(host.locator('.ws-waiting-count')).toContainText('2 / 6')
    await expect(seats.nth(1)).toContainText(guestName)
    await expect(guest.locator('.ws-invite-player').nth(0)).toContainText(hostName)
    await expect(host.locator('.ws-invite-player.is-empty')).toHaveCount(4)
    await expect(guest.locator('.ws-color-option[data-player-color=purple]')).toBeDisabled()
    await guest.locator('.ws-color-option[data-player-color=green]').click()
    await expect(seats.nth(1)).toHaveAttribute('data-player-color', 'green')
    await expect(host.locator('.ws-color-option[data-player-color=green]')).toBeDisabled()
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await host.screenshot({ path: 'output/waiting-room-mobile.png', fullPage: true })

    await guest.close()
    await expect(seats.nth(1).locator('.ws-seat-offline')).toBeVisible()
    await expect(seats.nth(1)).toContainText(guestName)
    guest = await guestContext.newPage()
    await guest.goto(`${FRONTEND_URL}/?room=${roomId}`)
    await expect(guest.locator('.ws-invite-player').nth(1)).toContainText(guestName)
    await expect(guest.locator('.ws-invite-player').nth(1)).toHaveAttribute('data-player-color', 'green')
    await expect(seats.nth(1).locator('.ws-seat-offline')).toHaveCount(0)
    await expect(host.locator('.ws-waiting-count')).toContainText('2 / 6')
    expect(new URL(guest.url()).search).toBe(`?room=${roomId}`)
    await guest.screenshot({ path: 'output/waiting-room-desktop.png', fullPage: true })
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})


for (const [color, expectedShade] of [['green', 'rgb(22, 138, 74)'], ['purple', 'rgb(124, 58, 237)']] as const) {
  test(`chosen ${color} color is used by actual workers on both players' boards`, async ({ browser, request }) => {
    const suffix = Date.now().toString(36)
    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    try {
      await authenticate(hostContext, request, `piece_host_${color}_${suffix}`)
      await authenticate(guestContext, request, `piece_guest_${color}_${suffix}`)
      const host = await hostContext.newPage(), guest = await guestContext.newPage()
      await host.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=2`)
      const roomId = await host.locator('.ws-invite-roomid strong').textContent()
      await host.locator(`.ws-color-option[data-player-color=${color}]`).click()
      await expect(host.locator('.ws-invite-player').nth(0)).toHaveAttribute('data-player-color', color)
      await guest.goto(`${FRONTEND_URL}/?room=${roomId}`)
      await expect(host.locator('.game-layout')).toBeVisible()
      await expect(guest.locator('.game-layout')).toBeVisible()
      const forest = host.locator('[data-action-id="forest"] button').first()
      const skips = [host, guest].map(page => page.locator('.interaction-bar').getByRole('button', { name: /^(Skip|跳过|Do not use Elder|不使用长者)$/ }))
      await expect.poll(async () => await forest.isEnabled() || (await Promise.all(skips.map(skip => skip.isVisible()))).some(Boolean)).toBe(true)
      for (const skip of skips) if (await skip.isVisible()) await skip.click()
      await expect(forest).toBeEnabled()
      await forest.click()
      for (const page of [host, guest]) {
        const worker = page.locator(`[data-action-id="forest"] .action-farmer-${color}`).first()
        await expect(worker).toBeVisible()
        expect(await worker.evaluate(element => getComputedStyle(element).backgroundImage)).toContain(expectedShade)
      }
      await host.screenshot({ path: `output/chosen-${color}-worker.png`, fullPage: true })
    } finally {
      await hostContext.close()
      await guestContext.close()
    }
  })
}
