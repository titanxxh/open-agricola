import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from '@playwright/test'
import { createHash } from 'node:crypto'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import en from '../output/i18n/locales/en.json' with { type: 'json' }

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
      providerUserId: `bug-report-${username}`,
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
      password: 'bug-report-pass-550',
      confirmPassword: 'bug-report-pass-550',
    },
  })
  expect(complete.ok(), `${complete.status()} ${await complete.text()}`).toBe(true)
  await context.addCookies([{
    name: 'oa_session',
    value: cookieValue(complete, 'oa_session'),
    url: FRONTEND_URL,
  }])
}

test('active pinned evidence opens beside the live game', async ({
  browser,
  page,
  request,
}) => {
  const suffix = Date.now().toString(36)
  const guestContext = await browser.newContext()
  await guestContext.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await authenticate(page.context(), request, `bug_report_a_${suffix}`)
  await authenticate(guestContext, request, `bug_report_b_${suffix}`)
  await page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=2`)
  const roomId = await page.locator('.ws-invite-roomid strong').textContent()
  expect(roomId).toBeTruthy()
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`${FRONTEND_URL}/?transport=ws&room=${roomId}`)
  await guestPage.getByRole('button', { name: 'Confirm color and start', exact: true }).click()
  await expect(page.locator('.game-layout')).toBeVisible({ timeout: 15_000 })

  const frameHash = 'a'.repeat(64)
  const viewerManifest = JSON.stringify({
    entrypoint: 'index.html',
    files: { 'index.html': '0'.repeat(64) },
  })
  const viewerBuildId = createHash('sha256').update(viewerManifest).digest('hex')
  await page.addInitScript(() => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.route(
    `**/api/v1/game-contexts/${roomId}/evidence/5?frame=${frameHash}`,
    async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          kind: 'reportedEvidence',
          apiVersion: 1,
          roomId,
          schemaVersion: 1,
          viewerBuildId,
          stepNo: 5,
          frameHash,
          perspective: 'p1',
          frame: { round: 1, players: [{ id: 'p1' }] },
          customCards: [],
        },
      })
    },
  )
  await page.route(
    `**/replay-viewers/${viewerBuildId}/manifest.json`,
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        headers: { ETag: `"${viewerBuildId}"` },
        body: viewerManifest,
      })
    },
  )
  await page.route(
    `**/replay-viewers/${viewerBuildId}/index.html?**`,
    async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `<script>
          addEventListener('message', (event) => {
            if (event.data?.type === 'open-agricola-reported-evidence') {
              document.body.textContent =
                'Pinned step ' + event.data.evidence.stepNo
            }
          })
          setTimeout(() => parent.postMessage(
            { type: 'open-agricola-reported-evidence-ready' },
            '*'
          ))
        </script>`,
      })
    },
  )

  await page.goto(
    `${FRONTEND_URL}/?room=${roomId}&step=5&frame=${frameHash}`
      + '&perspective=open&player=p1&devMode=1',
  )

  await expect(page.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
  const drawer = page.getByRole('complementary', {
    name: 'Reported game evidence',
  })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('iframe').contentFrame().getByText('Pinned step 5'))
    .toBeVisible()

  await drawer.getByRole('button', { name: 'Close' }).click()

  await expect(drawer).toBeHidden()
  await expect(page.locator('.game-layout')).toBeVisible()
  expect(new URL(page.url()).searchParams.has('step')).toBe(false)
  await guestContext.close()
})

test('completed replay submits one hosted bug report with the current anchor', async ({
  page,
  request,
}) => {
  const fixtureResponse = await request.post(`${BACKEND_URL}/api/test/replays/completed`)
  expect(fixtureResponse.status()).toBe(201)
  const fixture = await fixtureResponse.json() as {
    roomId: string
    firstStepHash: string
  }
  let createBody: Record<string, unknown> | null = null
  let submitCount = 0
  let duplicateConfirmed = false

  await page.addInitScript(() => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
  })
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/v1/issue-submission-connection') {
      await route.fulfill({
        json: { ok: true, enabled: true, connected: false },
      })
      return
    }
    if (url.pathname === `/api/v1/game-contexts/${fixture.roomId}/bug-reports`) {
      createBody = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        json: {
          ok: true,
          report: {
            submissionId: 'submission-e2e',
            roomId: fixture.roomId,
            reporterUserId: 'site-user-e2e',
            playerIndex: 0,
            lifecycle: 'completed',
            roomVersion: 3,
            stepNo: createBody.stepNo,
            frameHash: createBody.frameHash,
            phenomenon: createBody.phenomenon,
            authorIdentity: null,
            status: 'draft',
            issueNumber: null,
            issueUrl: null,
            lastErrorCode: null,
          },
          existingIssues: [{
            number: 98,
            url: 'https://github.com/titanxxh/open-agricola/issues/98',
          }],
        },
      })
      return
    }
    if (
      url.pathname === '/api/v1/bug-reports/submission-e2e'
      && request.method() === 'PATCH'
    ) {
      const patch = request.postDataJSON() as Record<string, unknown>
      duplicateConfirmed ||= patch.confirmExisting === true
      await route.fulfill({
        json: {
          ok: true,
          report: {
            submissionId: 'submission-e2e',
            roomId: fixture.roomId,
            reporterUserId: 'site-user-e2e',
            playerIndex: 0,
            lifecycle: 'completed',
            roomVersion: 3,
            stepNo: createBody?.stepNo,
            frameHash: createBody?.frameHash,
            phenomenon: createBody?.phenomenon,
            authorIdentity: patch.authorIdentity === 'hosted' ? 'hosted' : null,
            status: 'draft',
            issueNumber: null,
            issueUrl: null,
            lastErrorCode: null,
          },
          existingIssues: [{
            number: 98,
            url: 'https://github.com/titanxxh/open-agricola/issues/98',
          }],
        },
      })
      return
    }
    if (url.pathname === '/api/v1/bug-reports/submission-e2e/submit') {
      submitCount += 1
      await route.fulfill({
        json: {
          ok: true,
          report: {
            submissionId: 'submission-e2e',
            roomId: fixture.roomId,
            reporterUserId: 'site-user-e2e',
            playerIndex: 0,
            lifecycle: 'completed',
            roomVersion: 3,
            stepNo: createBody?.stepNo,
            frameHash: createBody?.frameHash,
            phenomenon: null,
            authorIdentity: 'hosted',
            status: 'submitted',
            issueNumber: 99,
            issueUrl: 'https://github.com/titanxxh/open-agricola/issues/99',
            lastErrorCode: null,
          },
        },
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/?room=${fixture.roomId}`)
  await page.getByRole('button', { name: 'Report a bug' }).click()
  await page.getByLabel('Describe what happened in one sentence')
    .fill('The final score is wrong')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('link', { name: 'Open Issue #98' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue with a new Issue' }).click()
  await page.getByRole('radio', { name: /Hosted Issue Identity/ }).click()
  await page.getByRole('checkbox', { name: /public Issue/ }).click()
  await page.getByRole('button', { name: 'Submit Issue' }).click()

  await expect(page.getByRole('link', { name: 'Open Issue #99' })).toBeVisible()
  expect(createBody).toEqual({
    phenomenon: 'The final score is wrong',
    clientDiagnostics: { deviceType: 'desktop', browser: { name: 'Chrome', version: expect.any(String) }, disconnects: [] },
    stepNo: 0,
    frameHash: fixture.firstStepHash,
  })
  expect(duplicateConfirmed).toBe(true)
  expect(submitCount).toBe(1)
})

for (const locale of ['en'] as const) {
  const copy = en.platform.bugReport
  for (const width of [320, 1280]) {
    test(`GitHub connection is a visible keyboard-operable button (${locale}, ${width}px)`, async ({
      page,
      request,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 })
      await page.addInitScript(value => {
        window.localStorage.setItem('open-agricola-locale-v2', value)
      }, locale)
      const fixtureResponse = await request.post(`${BACKEND_URL}/api/test/replays/completed`)
      expect(fixtureResponse.status()).toBe(201)
      const fixture = await fixtureResponse.json() as {
        roomId: string
        firstStepHash: string
      }
      const submissionId = `connect-button-${locale}-${width}`
      const report = {
        submissionId,
        roomId: fixture.roomId,
        reporterUserId: 'site-user-e2e',
        playerIndex: 0,
        lifecycle: 'completed',
        roomVersion: 3,
        stepNo: 0,
        frameHash: fixture.firstStepHash,
        phenomenon: 'The final score is wrong',
        authorIdentity: null,
        status: 'draft',
        issueNumber: null,
        issueUrl: null,
        lastErrorCode: null,
      }
      await page.route('**/api/v1/issue-submission-connection?**', route =>
        route.fulfill({ json: { ok: true, enabled: true, connected: false } }))
      await page.route(`**/api/v1/bug-reports/${submissionId}`, route =>
        route.fulfill({ json: { ok: true, report, existingIssues: [] } }))
      const authorizations: unknown[] = []
      let finishAuthorization!: () => void
      const authorizationGate = new Promise<void>(resolve => { finishAuthorization = resolve })
      await page.route('**/api/v1/issue-submission-connection/github/start', async route => {
        expect(route.request().method()).toBe('POST')
        authorizations.push(route.request().postDataJSON())
        await authorizationGate
        const authorizationUrl = new URL(page.url())
        authorizationUrl.hash = 'github-authorize'
        await route.fulfill({ json: { ok: true, authorizationUrl: authorizationUrl.toString() } })
      })

      await page.goto(`/?room=${fixture.roomId}&bugReport=${submissionId}`)
      await page.getByRole('button', { name: copy.continue, exact: true }).click()
      await page.getByRole('button', { name: copy.continue, exact: true }).click()
      const connect = page.getByRole('button', { name: copy.connectGithub, exact: true })
      await expect(connect).toBeVisible()
      await expect(connect).toBeEnabled()
      const appearance = await connect.evaluate(element => {
        const style = getComputedStyle(element)
        return {
          background: style.backgroundColor,
          padding: parseFloat(style.paddingTop),
          radius: parseFloat(style.borderTopLeftRadius),
        }
      })
      expect(appearance.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(appearance.padding).toBeGreaterThan(0)
      expect(appearance.radius).toBeGreaterThan(0)
      const box = await connect.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      await expect(page.getByRole('radio', { name: new RegExp(copy.githubUser) })).toBeDisabled()
      await page.getByRole('radio', { name: new RegExp(copy.hosted) }).focus()
      await page.keyboard.press('Shift+Tab')
      await expect(connect).toBeFocused()
      await expect(connect).toHaveCSS('outline-style', 'solid')
      await expect(connect).toHaveCSS('outline-width', '2px')
      await page.screenshot({ path: testInfo.outputPath('github-connect.png'), fullPage: true })

      try {
        await page.keyboard.press('Enter')
        await expect.poll(() => authorizations.length).toBe(1)
        await expect(connect).toBeDisabled()
        await page.keyboard.press('Enter')
        expect(authorizations).toEqual([{ submissionId }])
      } finally {
        finishAuthorization()
      }
      await expect(page).toHaveURL(/#github-authorize$/)
    })
  }
}

test('a mobile report retains actual WebSocket close diagnostics after reconnect and reload', async ({ browser, request }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
  })
  try {
    await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await authenticate(context, request, `bug_diagnostics_${Date.now().toString(36)}`)
    const page = await context.newPage()
    let closeSocket: (() => void) | undefined
    let connections = 0
    await page.routeWebSocket('**/nodes/*/ws', route => {
      const server = route.connectToServer()
      connections++
      closeSocket = () => {
        server.close({ code: 1012, reason: 'diagnostic test restart' })
        route.close({ code: 1012, reason: 'diagnostic test restart' })
      }
    })
    await page.route('**/api/v1/issue-submission-connection?**', route =>
      route.fulfill({ json: { ok: true, enabled: true, connected: false } }))
    let createBody: unknown
    await page.route('**/api/v1/game-contexts/*/bug-reports', async route => {
      createBody = route.request().postDataJSON()
      const roomId = new URL(page.url()).searchParams.get('room')
      await route.fulfill({ status: 201, json: { ok: true, report: {
        submissionId: 'diagnostics-mobile-report', roomId, reporterUserId: 'diagnostic-reporter-id',
        playerIndex: 0, lifecycle: 'active', roomVersion: 0, stepNo: 0, frameHash: 'a'.repeat(64),
        phenomenon: 'The board keeps disappearing', authorIdentity: null, status: 'draft',
        issueNumber: null, issueUrl: null, lastErrorCode: null,
      } } })
    })
    await page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=1&soloHandMode=random`)
    await expect(page.locator('.game-layout')).toBeVisible({ timeout: 15_000 })
    if (!closeSocket) throw new Error('No room WebSocket')
    closeSocket()
    await expect.poll(() => connections).toBeGreaterThan(1)
    await expect(page.locator('.game-layout')).toBeVisible()
    await page.reload()
    await expect(page.locator('.game-layout')).toBeVisible()
    await page.getByRole('button', { name: 'Report a bug' }).click()
    await page.getByLabel('Describe what happened in one sentence').fill('The board keeps disappearing')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('diagnostic-reporter-id', { exact: true })).toBeVisible()
    expect(createBody).toMatchObject({
      phenomenon: 'The board keeps disappearing',
      clientDiagnostics: {
        deviceType: 'mobile', browser: { name: 'Safari', version: '17.4' },
        disconnects: expect.arrayContaining([{
          occurredAt: expect.any(Number), code: 1012, reason: 'diagnostic test restart', wasClean: true,
        }]),
      },
    })
    expect(createBody).not.toHaveProperty('reporterUserId')
    expect(createBody).not.toHaveProperty('playerIndex')
  } finally { await context.close() }
})
