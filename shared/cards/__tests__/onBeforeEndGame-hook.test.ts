import { describe, expect, it } from 'vitest'
import { runBeforeEndGameHooks } from '../card-effects'
import '../B/B133_VillagePeasant'

describe('runBeforeEndGameHooks', () => {
  it('runs onBeforeEndGame for cards on the player', () => {
    const player = {
      id: 'p1',
      resources: { vegetable: 0, sheep:0, boar:0, cattle:0, wood:0, clay:0, reed:0, stone:0, food:0, grain:0, begging:0 },
      improvements: ['Major_Joinery', 'Major_Pottery'],
      minorPlayed: ['B133_VillagePeasant', 'A2_PieceOfLand'],
      occupationPlayed: ['A1_Shelter', 'A10_WoodenShed', 'A11_MudPatch'],
      cardStates: {},
    } as any
    const state = { players: [player] } as any
    runBeforeEndGameHooks(state, player)
    expect(player.resources.vegetable).toBe(2)
  })

  it('is a no-op for players without onBeforeEndGame cards', () => {
    const player = {
      id: 'p1',
      resources: { vegetable: 5, sheep:0, boar:0, cattle:0, wood:0, clay:0, reed:0, stone:0, food:0, grain:0, begging:0 },
      improvements: [],
      minorPlayed: [],
      occupationPlayed: [],
      cardStates: {},
    } as any
    const state = { players: [player] } as any
    runBeforeEndGameHooks(state, player)
    expect(player.resources.vegetable).toBe(5)
  })
})
