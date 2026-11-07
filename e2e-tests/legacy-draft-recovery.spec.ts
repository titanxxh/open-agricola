// @covers shared/draft/
// @covers shared/session/state-recovery.ts
import { expect, test, type Page } from '@playwright/test'
import { createOpeningSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { draftSeatProgress } from '../shared/projections/draft-progress'
import { joinRoomClients, roomDriver, roomSnapshot } from './room-command-driver'
import standard from '../shared/draft/__tests__/fixtures/standard-rotated.json' with { type: 'json' }
import moor from '../shared/draft/__tests__/fixtures/moor-minor.json' with { type: 'json' }

for (const [name, fixture] of [['ordinary', standard], ['Moor', moor]] satisfies Array<[string, typeof standard | typeof moor]>) {
  test(`retained ${name} draft resumes through real browsers without re-dealing`, async ({ browser, request }) => {
    const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
    const errors: string[] = []
    for (const page of pages) page.on('pageerror', error => errors.push(error.message))
    const source = createOpeningSession({ seed: fixture.seed,
      options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: fixture.options.draftPoolSize,
        enableFarmersOfTheMoor: fixture.options.enableFarmersOfTheMoor },
      expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    try {
      await joinRoomClients(pages, request)
      const driver = roomDriver(pages)
      await driver.command(0, { type: 'loadGame', state: {
        ...source.withCtx(() => serializeState(source.state, {})), draft: fixture.draft,
      } })
      for (const page of pages) await expect(page.locator('.draft-overlay')).toBeVisible()
      const initial = (await roomSnapshot(pages[0])).state.draft
      if (!initial) throw new Error('Expected retained draft in browser')
      expect(draftSeatProgress(initial, 'p1').kept).toEqual(fixture.draft.kept.p1)
      const choose = async () => {
        const draft = (await roomSnapshot(pages[0])).state.draft
        if (!draft) throw new Error('Expected unfinished draft')
        const actor = draft.seatOrder.find(id => draftSeatProgress(draft, id).kind === 'selecting')
        if (!actor) throw new Error('Recovered browser has no available packet')
        const index = draft.seatOrder.indexOf(actor)
        const progress = draftSeatProgress(draft, actor)
        if (progress.kind !== 'selecting') throw new Error('Expected current packet')
        const page = pages[index]
        if (!page) throw new Error('Expected browser for the selecting seat')
        if (progress.stage === 'standard' || progress.stage === 'occupation') await page.locator('.draft-pool-row-occ .draft-card').first().click()
        if (progress.stage !== 'occupation') await page.locator('.draft-pool-row-minor .draft-card').first().click()
        await driver.ui(index, () => page.getByRole('button', { name: 'Confirm picks', exact: true }).click())
      }
      await choose()
      const selected = (await roomSnapshot(pages[0])).state.draft
      expect(selected).not.toEqual(initial)
      await driver.reload()
      expect((await roomSnapshot(pages[0])).state.draft).toEqual(selected)
      await choose()
      expect((await roomSnapshot(pages[0])).state.draft).not.toEqual(selected)
      expect(errors).toEqual([])
    } finally { source.dispose(); await Promise.all(pages.map(page => page.close())) }
  })
}
