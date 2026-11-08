// @covers client/app/GameEndControls.tsx
// @covers client/app/TeamSetupFields.tsx
// @covers client/app/TeamWaitingRoom.tsx
// @covers client/components/common/BetaBadge.tsx
// @covers client/components/common/beta-badge.css
// @covers client/components/board/ArchivedTeamResults.tsx
// @covers client/components/board/ScoringPad.tsx
import { expect, test } from '@playwright/test'
import { startHostedReleaseAppWithExperimentalFeatures } from './helpers/experimental-features-app'
import { openGameEndControls } from './fixtures'

let app: Awaited<ReturnType<typeof startHostedReleaseAppWithExperimentalFeatures>>
test.beforeAll(async () => { test.setTimeout(180000); app = await startHostedReleaseAppWithExperimentalFeatures() })
test.afterAll(async () => { await app?.close() })

test('an invited ordinary participant sees Beta and a locked team rematch at desktop and phone widths', async ({ browser }, testInfo) => {
  test.setTimeout(90000)
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  try {
    const guestUsername = `beta_guest_${Date.now().toString(36)}`
    await app.authenticate(hostContext, 'e2e_admin', 'Beta host')
    await app.authenticate(guestContext, guestUsername, 'Invited guest')
    const host = await hostContext.newPage(), guest = await guestContext.newPage()
    await host.goto(app.appUrl)
    const entry = host.getByRole('button', { name: 'Multihand game', exact: true })
    await expect(entry.locator('.beta-badge')).toHaveText('Beta')
    await entry.click()
    await expect(host.locator('.beta-creation-hint')).toContainText('Team and multihand modes are being tested')
    await host.getByRole('radio', { name: 'Invited players only', exact: true }).check()
    await host.getByRole('combobox', { name: 'Invited players', exact: true }).fill(guestUsername)
    await host.getByRole('option').filter({ hasText: guestUsername }).click()
    await host.getByRole('button', { name: 'Create Game', exact: true }).click()
    await expect(host.locator('.team-waiting-room .beta-badge')).toHaveText('Beta')
    const roomId = await host.locator('.ws-invite-roomid strong').textContent()
    if (!roomId) throw new Error('Missing team room identity')
    const invitation = new URL(app.appUrl)
    invitation.search = new URLSearchParams({ room: roomId }).toString()
    await guest.goto(invitation.href)
    await expect(guest.locator('.team-waiting-room .beta-badge')).toHaveText('Beta')
    await expect(guest.locator('.beta-creation-hint')).toHaveCount(0)
    await host.getByRole('button', { name: 'Start game', exact: true }).click()
    const guestControls = await openGameEndControls(guest)
    await expect(guestControls.getByRole('button', { name: 'End and start a new game', exact: true })).toBeDisabled()
    await expect(guestControls).toContainText('Rematching a team game requires beta access. Ask a player who has it to start one.')
    const hostControls = await openGameEndControls(host)
    await expect(hostControls.getByRole('button', { name: 'End and start a new game', exact: true })).toBeEnabled()
    for (const width of [1280, 390]) {
      for (const [name, page] of [['host', host], ['guest', guest]] as const) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`${name}-beta-${width}.png`), fullPage: true })
      }
    }
  } finally { await hostContext.close(); await guestContext.close() }
})
