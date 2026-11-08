// @covers shared/contract/experimental-features.ts
// @covers server/experimental-features.ts
// @covers server/connection/room-router.ts
// @covers client/app/LobbyPage.tsx
// @covers client/contexts/AuthContext.tsx
import { expect, test } from '@playwright/test'
import { startExperimentalFeaturesApp } from './helpers/experimental-features-app'

let app: Awaited<ReturnType<typeof startExperimentalFeaturesApp>>
test.beforeAll(async () => { test.setTimeout(180000); app = await startExperimentalFeaturesApp() })
test.afterAll(async () => { await app?.close() })

test('declared Beta availability hides team entries from ordinary accounts and shows them to administrators', async ({ browser }) => {
  const ordinary = await browser.newContext(), administrator = await browser.newContext()
  try {
    await app.authenticate(ordinary, `beta_${Date.now().toString(36)}`, 'Ordinary')
    await app.authenticate(administrator, 'e2e_admin', 'Administrator')
    const member = await ordinary.newPage(), owner = await administrator.newPage()
    await member.goto(app.appUrl)
    await expect(member.getByRole('button', { name: 'Create Multiplayer Game', exact: true })).toBeVisible()
    await expect(member.getByRole('button', { name: 'Team game', exact: true })).toHaveCount(0)
    await expect(member.getByRole('button', { name: 'Multihand game', exact: true })).toHaveCount(0)
    const rejected = await ordinary.request.post(`${app.apiUrl}/api/game/new`, { data: {
      playerCount: 4, teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
    } })
    expect(rejected.status()).toBe(403)
    expect(await rejected.json()).toMatchObject({ code: 'experimental_feature_unavailable', feature: 'team-modes' })
    await owner.goto(app.appUrl)
    await expect(owner.getByRole('button', { name: 'Team game', exact: true })).toBeVisible()
    await expect(owner.getByRole('button', { name: 'Multihand game', exact: true })).toBeVisible()
  } finally { await ordinary.close(); await administrator.close() }
})
