import { afterEach, expect, it, vi } from 'vitest'
import { __resetCardsManifestCache, loadCardsManifest } from '../../services/card-meta'
import { playerCanBuildPalisades } from '../player-palisades'

afterEach(() => { __resetCardsManifestCache(); vi.unstubAllGlobals() })

it('uses the builder card capability and its own-farm policy from the public manifest', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    B030_WoodPalisades: { meta: { id: 'B030_WoodPalisades', name: 'Wood Palisades', deck: 'B', number: 30,
      desc: [], cost: {}, enablesPalisades: true, palisadeTargetFarmPolicy: 'own' }, module: 'shared/cards/B/B030_WoodPalisades', reaches: [] },
  }))))
  await loadCardsManifest()
  const builder = { id: 'p1', minorPlayed: ['B030_WoodPalisades'], occupationPlayed: [], improvements: [] }
  const teammate = { id: 'p3', minorPlayed: [], occupationPlayed: [], improvements: [] }
  expect(playerCanBuildPalisades(builder, builder)).toBe(true)
  expect(playerCanBuildPalisades(builder, teammate)).toBe(false)
  expect(playerCanBuildPalisades(teammate, builder)).toBe(false)
})
