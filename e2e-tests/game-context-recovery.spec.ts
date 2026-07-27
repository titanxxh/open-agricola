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
): Promise<void> => {
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: {
      providerUserId: `context-${username}`,
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
  await secondPage.goto(`${FRONTEND_URL}/?transport=ws&room=${roomId}`)
  await expect(firstPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect(secondPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })

  await firstPage.close()
  await secondPage.close()

  firstPage = await firstContext.newPage()
  secondPage = await secondContext.newPage()
  const firstStates = collectStates(firstPage)
  const secondStates = collectStates(secondPage)
  await Promise.all([
    firstPage.goto(`${FRONTEND_URL}/?context=${roomId}&player=p2&perspective=open`),
    secondPage.goto(`${FRONTEND_URL}/?context=${roomId}&player=p1&perspective=open`),
  ])
  await expect(firstPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect(secondPage.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => firstStates.length).toBeGreaterThan(0)
  await expect.poll(() => secondStates.length).toBeGreaterThan(0)

  const first = latestState(firstStates)
  const second = latestState(secondStates)
  expect(first.players[0]!.minorHand).not.toContain('?')
  expect(first.players[0]!.occupationHand).not.toContain('?')
  expect(first.players[1]!.minorHand).toEqual(first.players[1]!.minorHand.map(() => '?'))
  expect(first.players[1]!.occupationHand).toEqual(first.players[1]!.occupationHand.map(() => '?'))
  expect(second.players[0]!.minorHand).toEqual(second.players[0]!.minorHand.map(() => '?'))
  expect(second.players[0]!.occupationHand).toEqual(second.players[0]!.occupationHand.map(() => '?'))
  expect(second.players[1]!.minorHand).not.toContain('?')
  expect(second.players[1]!.occupationHand).not.toContain('?')

  await firstContext.close()
  await secondContext.close()
})
