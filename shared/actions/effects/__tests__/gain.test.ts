import { describe, expect, it } from 'vitest'
import { bonusWoodAction } from '../gain'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../../contract/types'

describe('bonus resource actions', () => {
  it('returns explicit resourcesGained for action-detail logging', () => {
    const player = {
      id: 'p1',
      resources: {
        wood: 0,
        clay: 0,
        reed: 0,
        stone: 0,
        food: 0,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
    } as unknown as PlayerState
    const state = { players: [player], workPhaseObtainedResources: {} } as unknown as GameState
    const result = bonusWoodAction.execute({
      state,
      player,
      space: { id: 'bonus-wood' } as ActionSpace,
    } as ActionExecutionContext)

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesGained).toEqual({ wood: 1 })
    expect(player.resources.wood).toBe(1)
  })
})
