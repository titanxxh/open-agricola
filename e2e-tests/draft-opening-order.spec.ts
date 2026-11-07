// @covers client/app/draft/
// @covers client/components/header/
import { expect, test, type BrowserContext } from '@playwright/test'
import { draftSeatProgress } from '../shared/projections/draft-progress'
import { authenticateSolo, SoloBrowserDriver } from './helpers/standard-solo-acceptance'
import { FRONTEND_URL } from './fixtures'

const currentDraft = (driver: SoloBrowserDriver) => {
  const draft = driver.state.draft
  if (!draft) throw new Error('Expected an active draft')
  return draft
}

const pick = async (driver: SoloBrowserDriver, playerId: string) => {
  const progress = draftSeatProgress(currentDraft(driver), playerId)
  if (progress.kind !== 'selecting') throw new Error(`No current packet for ${playerId}`)
  await driver.page.locator('.draft-pool-row-occ .draft-card').first().click()
  await driver.page.locator('.draft-pool-row-minor .draft-card').first().click()
  await driver.ui(`confirm-draft:${playerId}:${progress.opportunityKey}`, () => driver.page.getByRole('button', { name: 'Confirm picks', exact: true }).click())
  const command = driver.commands.findLast(command => command.type === 'draftSubmit')
  expect(command).toMatchObject({ type: 'draftSubmit', playerId, pick: { opportunityKey: progress.opportunityKey } })
}

test('four-player draft keeps moving around an offline seat and resumes its queued packets privately', async ({ browser, request }, testInfo) => {
  test.setTimeout(90_000)
  const contexts: BrowserContext[] = []
  const participants: Array<{ name: string; context: BrowserContext; driver: SoloBrowserDriver }> = []
  const suffix = Date.now().toString(36)
  try {
    for (let index = 0; index < 4; index++) {
      const context = await browser.newContext()
      contexts.push(context)
      const name = `draft_${suffix}_${index}`
      await authenticateSolo(context, request, name)
      participants.push({ name, context, driver: new SoloBrowserDriver(await context.newPage()) })
    }
    const host = participants[0].driver
    await host.page.goto(`${FRONTEND_URL}/?transport=ws&maxPlayers=4&draftMode=simultaneous&draftPoolSize=7&enableSnakeOpening=true&enableThroughTheSeasons=true`)
    const id = host.page.locator('.ws-invite-roomid strong')
    await expect(id).toBeVisible()
    const roomId = await id.innerText()
    for (const participant of participants.slice(1)) {
      await participant.driver.page.goto(`${FRONTEND_URL}/?room=${roomId}`)
      await expect(participant.driver.page.locator('.ws-waiting-seats')).toBeVisible()
    }
    await participants[3].driver.page.getByRole('button', { name: 'Confirm color and start', exact: true }).click()
    for (const { name, driver } of participants) {
      const order = driver.page.getByRole('region', { name: 'Opening turn order' })
      await expect(order).toBeVisible()
      await expect(order.locator('li')).toHaveCount(4)
      await expect(order.locator('[data-is-you="true"]')).toContainText(name)
      await expect(order.getByText('Start Player', { exact: true })).toHaveCount(1)
      await expect(order.locator('.draft-opening-selection[data-status="selecting"]')).toHaveCount(4)
      await expect(driver.page.locator('.draft-opening-hint')).toContainText('Snake opening')
      expect(driver.state.players.map(player => player.name)).toEqual(host.state.players.map(player => player.name))
      const me = driver.state.players.find(player => player.name === name)
      if (!me) throw new Error(`Missing player ${name}`)
      for (const player of driver.state.players) {
        const pool = currentDraft(driver).stages[0].seats[player.id].inbox[1]
        expect(pool.occ.every(card => player.id === me.id ? card !== '?' : card === '?')).toBe(true)
        expect(pool.minor.every(card => player.id === me.id ? card !== '?' : card === '?')).toBe(true)
      }
    }

    // Seats are randomized at admission; use authoritative order for the passing chain.
    const opening = host.state.players.map(player => [player.id, player.name, player.color])
    const seats = host.state.players.map(player => {
      const participant = participants.find(participant => participant.name === player.name)
      if (!participant) throw new Error(`No browser for ${player.name}`)
      return { ...participant, player }
    })
    const [a, b, c, d] = seats
    await a.driver.page.close()
    const idleRow = b.driver.page.locator(`[data-player-id="${a.player.id}"]`)
    await expect(idleRow.locator('.draft-opening-presence')).toHaveAttribute('data-connected', 'false')
    await expect(idleRow).toContainText('Offline')

    for (const seat of [b, c, d, c, d, d]) await pick(seat.driver, seat.player.id)
    await expect.poll(() => seats.map(seat => draftSeatProgress(currentDraft(b.driver), seat.player.id).kept.occ.length)).toEqual([0, 1, 2, 3])
    const stalled = currentDraft(b.driver)
    expect(seats.map(seat => draftSeatProgress(stalled, seat.player.id).kind)).toEqual(['selecting', 'waiting', 'waiting', 'waiting'])
    expect(Object.keys(stalled.stages[0].seats[a.player.id].inbox)).toEqual(['1', '2', '3', '4'])
    for (const live of [b, c, d]) {
      await expect(live.driver.page.locator('.draft-opening-selection[data-status="waiting"]')).toHaveCount(3)
      await expect(live.driver.page.locator('.draft-overlay .draft-opening-hint[role="status"]')).toContainText(a.player.name)
      await expect(live.driver.page.locator('.draft-confirm-btn')).toHaveCount(0)
      for (const [index, seat] of seats.entries()) {
        const row = live.driver.page.locator(`[data-player-id="${seat.player.id}"]`)
        await expect(row.locator('.draft-opening-progress')).toHaveText(`Occupations ${index}/7 · Minors ${index}/7`)
      }
    }

    const lobby = await b.context.newPage()
    await lobby.goto(`${FRONTEND_URL}/?page=lobby`)
    const activeGame = lobby.locator('.my-game')
    await expect(activeGame).toHaveCount(1)
    await expect(activeGame.locator('.my-game__progress')).toHaveText('Card draft')
    await expect(activeGame.locator('[data-expansion=enableThroughTheSeasons]')).toBeVisible()
    await expect(activeGame.locator('.my-game__player[data-current=true] .my-game__name')).toHaveText([a.player.name], { timeout: 10_000 })
    await expect(activeGame.locator('.my-game__turn')).toContainText(a.player.name)

    const resumed = new SoloBrowserDriver(await a.context.newPage())
    await resumed.page.goto(`${FRONTEND_URL}/?room=${roomId}`)
    await expect(resumed.page.getByRole('dialog', { name: 'Card draft' })).toBeVisible()
    await expect(resumed.page.locator('[data-is-you="true"]')).toContainText(a.player.name)
    const resumedInbox = currentDraft(resumed).stages[0].seats[a.player.id].inbox
    expect(Object.keys(resumedInbox)).toEqual(['1', '2', '3', '4'])
    expect(resumedInbox[1].occ).toHaveLength(7)
    expect(resumedInbox[1].occ.every(card => card !== '?')).toBe(true)
    for (const generation of [2, 3, 4]) {
      expect(resumedInbox[generation].occ).toEqual(Array(8 - generation).fill('?'))
      expect(resumedInbox[generation].minor).toEqual(Array(8 - generation).fill('?'))
    }
    await expect(idleRow.locator('.draft-opening-presence')).toHaveAttribute('data-connected', 'true')

    const peerWrites = [b, c, d].map(seat => seat.driver.commands.filter(command => command.type === 'draftSubmit').length)
    await pick(resumed, a.player.id)
    await expect(resumed.page.locator('.draft-overlay-title')).toHaveText('Draft — Round 2 / 7')
    await pick(resumed, a.player.id)
    await expect(resumed.page.locator('.draft-overlay-title')).toHaveText('Draft — Round 3 / 7')
    expect([b, c, d].map(seat => seat.driver.commands.filter(command => command.type === 'draftSubmit').length)).toEqual(peerWrites)
    await expect.poll(() => draftSeatProgress(currentDraft(b.driver), b.player.id).kind).toBe('selecting')
    expect(Object.keys(currentDraft(b.driver).stages[0].seats[b.player.id].inbox)).toEqual(['2', '3'])

    await resumed.page.reload()
    await expect(resumed.page.locator('.draft-overlay-title')).toHaveText('Draft — Round 3 / 7')
    expect(resumed.state.players.map(player => [player.id, player.name, player.color])).toEqual(opening)
    const restored = draftSeatProgress(currentDraft(resumed), a.player.id)
    expect(restored.kind).toBe('selecting')
    expect(restored.kept.occ).toHaveLength(2)
    expect(restored.kept.minor).toHaveLength(2)
    expect(currentDraft(resumed).stages[0].seats[a.player.id].inbox[4].occ).toEqual(Array(4).fill('?'))
    for (const width of [1280, 320]) {
      await resumed.page.setViewportSize({ width, height: 900 })
      await expect(resumed.page.getByRole('region', { name: 'Opening turn order' })).toBeVisible()
      expect(await resumed.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await resumed.page.screenshot({ path: testInfo.outputPath(`draft-resumed-${width}.png`), fullPage: true })
      await lobby.setViewportSize({ width, height: 900 })
      expect(await lobby.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await activeGame.screenshot({ path: testInfo.outputPath(`lobby-draft-${width}.png`) })
    }
    await resumed.attach(testInfo, 'async-draft-resumed')
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
