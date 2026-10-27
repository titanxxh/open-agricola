import { expect, test, type Page } from '@playwright/test'
import { createOpeningSession, createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'

const phases = ['draft', 'parent-selection'] as const

function setupState(phase: typeof phases[number]) {
  const session = createOpeningSession({
    seed: 42,
    options: phase === 'draft'
      ? { draftMode: 'simultaneous', draftPoolSize: 7 }
      : { enableParentCards: true },
    expected: { phase, roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  try { return session.withCtx(() => serializeState(session.state, {})) }
  finally { session.dispose() }
}

async function selectCards(page: Page, phase: typeof phases[number], touch = false) {
  const selectors = phase === 'draft'
    ? ['.draft-pool-row-occ .draft-card', '.draft-pool-row-minor .draft-card']
    : ['[data-section="mother"] .parent-choice-card', '[data-section="father"] .parent-choice-card']
  for (const selector of selectors) {
    const card = page.locator(selector).first()
    if (touch) await card.tap()
    else await card.click()
  }
}

for (const phase of phases) {
  const overlaySelector = phase === 'draft' ? '.draft-overlay' : '.parent-selection-overlay'
  const statusSelector = phase === 'draft' ? '.draft-overlay-status' : '.parent-selection-status'

  for (const width of [1280, 375, 320]) {
    test(`${phase} navigation works before and after submission at ${width}px`, async ({ browser, request }, testInfo) => {
      const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
      const [page, peer] = pages
      const driver = roomDriver(pages)
      let joined = false
      try {
        await page.setViewportSize({ width, height: 844 })
        await joinRoomClients(pages, request, 'zh')
        joined = true
        await driver.command(0, { type: 'loadGame', state: setupState(phase) })
        for (const client of pages) await expect(client.locator(overlaySelector)).toBeVisible()

        const header = page.locator('.header-compact')
        const home = header.getByRole('link', { name: /Open Agricola:/ })
        const language = header.getByRole('button', { name: /语言|language/i })
        await expect(home).toBeVisible()
        await expect(language).toBeVisible()
        await expect(header.locator('.header-round, .header-phase-pills, .status-badge')).toHaveCount(0)
        const headerBox = await header.boundingBox()
        const overlayBox = await page.locator(overlaySelector).boundingBox()
        expect(headerBox!.x).toBeGreaterThanOrEqual(0)
        expect(headerBox!.x + headerBox!.width).toBeLessThanOrEqual(width)
        expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(overlayBox!.y)

        await selectCards(page, phase)
        const selected = page.locator(phase === 'draft' ? '.draft-card.selected' : '.parent-choice-card.is-selected')
        await expect(selected).toHaveCount(2)
        const before = await roomSnapshot(page)
        await language.click()
        await page.getByRole('option', { name: 'English', exact: true }).click()
        await expect(language).toHaveAccessibleName(/language.*English/i)
        await expect(selected).toHaveCount(2)
        expect(await roomSnapshot(page)).toEqual(before)
        await expect(peer.locator('.header-compact').getByRole('button', { name: /语言/ })).toBeVisible()

        const confirm = page.locator(phase === 'draft' ? '.draft-confirm-btn' : '.parent-selection-confirm')
        await driver.ui(0, () => confirm.click())
        await expect(page.locator(statusSelector)).toHaveAttribute('data-already-submitted', '1')
        const submitted = await roomSnapshot(page)
        await language.click()
        await page.getByRole('option', { name: '简体中文', exact: true }).click()
        await expect(page.locator(statusSelector)).toHaveAttribute('data-already-submitted', '1')
        expect(await roomSnapshot(page)).toEqual(submitted)
        await expect(peer.locator(statusSelector)).toHaveAttribute('data-already-submitted', '0')
        await page.screenshot({ path: testInfo.outputPath(`${phase}-${width}.png`) })

        const roomUrl = page.url()
        await home.getByRole('img', { name: 'Open Agricola logo' }).click()
        await expect(page).not.toHaveURL(/room=/)
        await expect(page.locator('.lobby-header')).toBeVisible()
        await page.goto(roomUrl)
        await expect(page.locator(statusSelector)).toHaveAttribute('data-already-submitted', '1')
        await expect(page.locator('.header-compact')).toHaveCount(1)
      } finally {
        try {
          if (joined) {
            const work = createWorkSession()
            try { await driver.command(0, { type: 'loadGame', state: work.withCtx(() => serializeState(work.state, {})) }) }
            finally { work.dispose() }
          }
        } finally { await Promise.all(pages.map(client => client.close())) }
      }
    })
  }

  test(`${phase} embedded mode retains language controls`, async ({ page, request }) => {
    const created = await request.post(`${BACKEND_URL}/api/game/new`, {
      data: phase === 'draft'
        ? { seed: 42, maxPlayers: 2, draftMode: 'simultaneous', draftPoolSize: 7 }
        : { seed: 42, maxPlayers: 2, enableParentCards: true },
    })
    expect(created.ok(), await created.text()).toBe(true)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    await expect(page.locator(overlaySelector)).toBeVisible()
    const header = page.locator('.header-compact')
    await expect(header.getByRole('link')).toHaveCount(0)
    await header.getByRole('button', { name: /语言|language/i }).click()
    await page.getByRole('option', { name: 'English', exact: true }).click()
    await expect(header.getByRole('button', { name: /language/i })).toBeVisible()
  })

  test(`${phase} hotseat retains navigation and private seat handoff`, async ({ browser, request }) => {
    test.setTimeout(40_000)
    const pages: [Page, Page] = [
      await browser.newPage({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 844 } }),
      await browser.newPage(),
    ]
    const [page] = pages
    try {
      await joinRoomClients(pages, request, 'zh')
      const setup = phase === 'draft' ? 'draftMode=simultaneous&draftPoolSize=7' : 'enableParentCards=true'
      await page.goto(`${FRONTEND_URL}/?transport=ws&hotseat=1&maxPlayers=2&${setup}`, { waitUntil: 'domcontentloaded' })
      const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
      await expect(handoff).toBeVisible()
      await expect(page.locator(overlaySelector)).toHaveCount(0)
      await handoff.getByRole('button').tap()
      await expect(page.locator(overlaySelector)).toBeVisible()
      await test.step('select both cards by touch', () => selectCards(page, phase, true))
      await page.locator('.header-compact').getByRole('button', { name: /语言/ }).tap()
      await page.getByRole('option', { name: 'English', exact: true }).tap()
      await expect(page.locator('.header-compact').getByRole('button', { name: /language.*English/i })).toBeVisible()
      const selected = page.locator(phase === 'draft' ? '.draft-card.selected' : '.parent-choice-card.is-selected')
      await expect(selected).toHaveCount(2)
      await page.locator(phase === 'draft' ? '.draft-confirm-btn' : '.parent-selection-confirm').tap()
      await expect(handoff).toBeVisible()
      await expect(page.locator(overlaySelector)).toHaveCount(0)
      await handoff.getByRole('button').tap()
      await expect(page.locator(overlaySelector)).toBeVisible()
      await expect(selected).toHaveCount(0)
      await page.getByRole('button', { name: 'Menu', exact: true }).tap()
      await expect(page.locator('.header-menu-identity')).toContainText('Player 2')
      await page.locator('.header-compact').getByRole('link', { name: /Open Agricola:/ }).tap()
      await expect(page.locator('.lobby-header')).toBeVisible()
    } finally { await Promise.all(pages.map(client => client.close())) }
  })
}
