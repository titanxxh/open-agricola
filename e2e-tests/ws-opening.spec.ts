// @covers server/connection/
// @covers client/components/interaction/
import { expect, test, type APIResponse, type BrowserContext } from '@playwright/test'
import { authCookieNames } from '../server/auth-cookies'
import { createOpeningSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeSessionSnapshot } from '../shared/session/serialization'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { browserRequestHeaders, BACKEND_URL, FRONTEND_URL } from './fixtures'
import { finishWsOpening, observeWsOpening, type WsOpeningSeat } from './helpers/ws-opening'

const cookie = (response: APIResponse, name: string) => {
  const header = response.headersArray().find(item => item.name.toLowerCase() === 'set-cookie' && item.value.startsWith(`${name}=`))
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

async function authenticate(context: BrowserContext) {
  const username = `opening_${Date.now().toString(36)}`
  const oauth = await context.request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    headers: browserRequestHeaders(), data: {
      providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: username,
    },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await context.request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    headers: { ...browserRequestHeaders(), Cookie: `${authCookieNames().onboarding}=${cookie(oauth, authCookieNames().onboarding)}` },
    data: { username, displayName: username, password: 'opening-test-pass', confirmPassword: 'opening-test-pass' },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  await context.addCookies([{ name: authCookieNames().session, value: cookie(complete, authCookieNames().session), url: FRONTEND_URL }])
}

test('an opening choice is submitted once while its committed snapshot is delayed', async ({ browser }) => {
  const context = await browser.newContext()
  const session = createOpeningSession({ seed: 9, options: { deckIds: ['E'] },
    expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait', kind: 'choice', playerIndex: 1 } },
  })
  let skipCommands = 0
  let heldSnapshot = false
  let released = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const releases: Array<() => void> = []
  try {
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await authenticate(context)
    const first = await context.newPage()
    const second = await context.newPage()
    const seats: [WsOpeningSeat, WsOpeningSeat] = [observeWsOpening(first), observeWsOpening(second)]
    for (const page of [first, second]) await page.routeWebSocket('**/ws', client => {
      const server = client.connectToServer()
      client.onMessage(message => {
        const command: { type: string; value?: string } = JSON.parse(message.toString())
        if (command.type === 'choice' && command.value === '__skip__') skipCommands++
        server.send(message)
      })
      server.onMessage(message => {
        const event: ServerEvent = JSON.parse(message.toString())
        if (skipCommands > 0 && !released && event.type === 'stateUpdate') {
          const release = () => client.send(message)
          releases.push(release)
          if (!heldSnapshot) {
            heldSnapshot = true
            // The injected response latency exposes the old choice after click() returns.
            timer = setTimeout(() => { released = true; releases.splice(0).forEach(send => send()) }, 2000)
          }
        } else client.send(message)
      })
    })
    await first.goto(`${FRONTEND_URL}/?transport=ws&room=dev2&player=p1&devMode=1`)
    await expect(first.locator('.game-layout')).toBeVisible()
    await second.goto(`${FRONTEND_URL}/?transport=ws&room=dev2&player=p2&devMode=1`)
    await expect(second.locator('.game-layout')).toBeVisible()
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    await first.locator('.dev-panel input[type="file"]').setInputFiles({
      name: 'opening.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
    })
    await expect(second.locator('.interaction-bar [data-choice-value="__skip__"]')).toBeVisible()
    expect(seats.map(seat => seat.index)).toEqual([0, 1])
    await finishWsOpening(seats)
    expect(heldSnapshot).toBe(true)
    expect(skipCommands).toBe(1)
    for (const seat of seats) expect(seat.latest?.payload.state.roundPhase).toBe('work')
    expect(seats[1]!.latest?.payload.state.players[1]!.occupationHand).toContain('E096_Elder')
    expect(seats[1]!.latest?.payload.state.players[1]!.occupationPlayed).not.toContain('E096_Elder')
  } finally {
    clearTimeout(timer)
    session.dispose()
    await context.close()
  }
})
