import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from '@playwright/test'
import { createHash } from 'node:crypto'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

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
  await authenticate(page.context(), request, `bug_report_a_${suffix}`)
  await authenticate(guestContext, request, `bug_report_b_${suffix}`)
  await page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=2`)
  const roomId = await page.locator('.ws-invite-roomid strong').textContent()
  expect(roomId).toBeTruthy()
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`${FRONTEND_URL}/?transport=ws&room=${roomId}`)
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
    `${FRONTEND_URL}/?context=${roomId}&step=5&frame=${frameHash}`
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

  await page.goto(`/?context=${fixture.roomId}`)
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
    stepNo: 0,
    frameHash: fixture.firstStepHash,
  })
  expect(duplicateConfirmed).toBe(true)
  expect(submitCount).toBe(1)
})
