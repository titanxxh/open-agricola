import { installOfficialCardRegistry } from './card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import { runCardEffectHook } from '../card-effects'
import '../B/B133_VillagePeasant'

const CARD_ID = 'B133_VillagePeasant'
const villagePeasant = (improvements: string[], minorPlayed: string[], occupationPlayed: string[]) => ({
  id: 'p1',
  resources: { vegetable: 0, sheep: 0, boar: 0, cattle: 0, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, begging: 0 },
  improvements,
  minorPlayed,
  occupationPlayed,
  cardStates: {},
}) as any

// Direct behavior of B133_VillagePeasant's before-scoring hook (#2039, Card contract: Standard leaves).
describe('B133_VillagePeasant onBeforeEndGame', () => {
  it('returns a gain of the smallest category count and leaves the supply to the leaf', () => {
    const player = villagePeasant(['Major_Joinery', 'Major_Pottery'], [CARD_ID, 'A002_PieceOfLand'], ['A001_Shelter', 'A010_WoodenShed', 'A011_MudPatch'])
    const state = { players: [player] } as any
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeEndGame')
    expect(flow).toEqual({ type: 'leaf', actionId: 'gain', params: { vegetable: 2 }, sourceCard: CARD_ID })
    expect(player.resources.vegetable).toBe(0)
  })

  it('offers nothing when a category is empty', () => {
    const player = villagePeasant([], [CARD_ID], ['A001_Shelter'])
    const state = { players: [player] } as any
    expect(runCardEffectHook(state, player, CARD_ID, 'onBeforeEndGame')).toBeNull()
    expect(player.resources.vegetable).toBe(0)
  })
})
