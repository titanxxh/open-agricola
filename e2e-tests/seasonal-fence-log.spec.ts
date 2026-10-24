import { expect, test } from '@playwright/test'
import { BACKEND_URL } from './fixtures'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import { emptyResources } from '../shared/session/state-bootstrap'

for (const locale of ['zh', 'en'] as const) {
  for (const free of [false, true]) {
    test(`spring fence cost explanation in ${locale}, payment ${free ? 0 : 5}`, async ({ page, request }) => {
      await page.addInitScript(value => localStorage.setItem('open-agricola-locale-v2', value), locale)
      expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
        data: { seed: 353, playerCount: 2, customCardIds: [], enableThroughTheSeasons: true },
      })).ok()).toBe(true)
      const fixture = createWorkSession({ seed: 353, options: { enableThroughTheSeasons: true }, configure: state => {
        state.round = 7
        state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
        state.players.forEach(player => {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
          player.resources = { ...emptyResources, wood: 10 }
        })
        if (free) state.players[0]!.occupationPlayed = ['A088_HedgeKeeper']
      } })
      try {
        const state = fixture.withCtx(() => serializeState(fixture.state, {}))
        expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
      } finally { fixture.dispose() }
      const entered = await request.post(`${BACKEND_URL}/api/game/action`, { data: { playerIndex: 0, spaceId: 'fencing' } })
      expect(entered.ok()).toBe(true)
      const edges = free ? ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
        : ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-1', 'V-0-2']
      const committed = await request.post(`${BACKEND_URL}/api/game/commit-selection`, {
        data: { playerIndex: 0, payload: { edges, extraWood: 0 } },
      })
      expect(committed.ok()).toBe(true)
      const response = await committed.json() as GameSyncPayload
      expect(response.state.players[0]!.resources.wood).toBe(free ? 10 : 5)
      expect(response.state.players[0]!.fenceSegments).toHaveLength(free ? 4 : 7)
      expect(response.state.events.filter(event => event.type === 'resource.paid')).toEqual([
        expect.objectContaining({ resources: free ? {} : { wood: 5 },
          seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }] }),
      ])
      await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
      const payment = page.locator('.action-log li').filter({ hasText: locale === 'zh' ? '春季减免' : 'Spring: costs' })
      await expect(payment).toHaveCount(1)
      await expect(payment).toContainText(locale === 'zh' ? /支付.*[05]/ : /Pays.*[05]/)
      await expect(payment.locator('[data-resource="wood"][data-amount="2"]')).toHaveCount(1)
      if (free) await expect(payment).toContainText('0')
      else await expect(payment.locator('[data-resource="wood"][data-amount="5"]')).toHaveCount(1)
      await expect(payment).toContainText(locale === 'zh' ? `建造 ${free ? 4 : 7} 段围栏` : `Build ${free ? 4 : 7} fence(s)`)
      await page.locator('.action-log').screenshot({ path: `output/playwright/seasonal-fence-${locale}-${free ? 'free' : 'paid'}.png` })
    })
  }
}
