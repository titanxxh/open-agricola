import { expect, test } from '@playwright/test'

const backend = process.env.BACKEND_URL ?? 'http://localhost:5175'

test('completed replay submits one hosted bug report with the current anchor', async ({
  page,
  request,
}) => {
  const fixtureResponse = await request.post(`${backend}/api/test/replays/completed`)
  expect(fixtureResponse.status()).toBe(201)
  const fixture = await fixtureResponse.json() as {
    roomId: string
    firstStepHash: string
  }
  let createBody: Record<string, unknown> | null = null
  let submitCount = 0

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
        },
      })
      return
    }
    if (
      url.pathname === '/api/v1/bug-reports/submission-e2e'
      && request.method() === 'PATCH'
    ) {
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
            authorIdentity: 'hosted',
            status: 'draft',
            issueNumber: null,
            issueUrl: null,
            lastErrorCode: null,
          },
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
            issueUrl: 'https://github.com/titanxxh/open-agricola-issues/issues/99',
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
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('radio', { name: /Hosted Issue Identity/ }).click()
  await page.getByRole('checkbox', { name: /public Issue/ }).click()
  await page.getByRole('button', { name: 'Submit Issue' }).click()

  await expect(page.getByRole('link', { name: 'Open Issue #99' })).toBeVisible()
  expect(createBody).toEqual({
    phenomenon: 'The final score is wrong',
    stepNo: 0,
    frameHash: fixture.firstStepHash,
  })
  expect(submitCount).toBe(1)
})
