import { describe, it, expect } from 'vitest'
import { takeFromSpaceAction } from '../take-from-space'
import type { GameState, PlayerState, ActionSpace } from '../../../../contract/types'

const makeContext = (
  spaceId: string,
  spaceResources: Partial<Record<string, number>>,
  actionContext: Record<string, unknown>,
  playerResources: Partial<Record<string, number>> = {},
) => {
  const space = { id: spaceId, resources: { ...spaceResources } } as unknown as ActionSpace
  const state = { actionSpaces: [space] } as unknown as GameState
  const player = {
    id: 'p1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, ...playerResources },
  } as unknown as PlayerState
  return { state, player, space, actionContext } as never
}

describe('takeFromSpaceAction.execute', () => {
  it('decrements space resource and increments player resource', () => {
    const ctx = makeContext('test-space', { wood: 3 }, {
      spaceId: 'test-space',
      resource: 'wood',
      amount: 2,
    })
    const result = takeFromSpaceAction.execute(ctx)
    expect(result.type).toBe('ok')
    const space = (ctx as { state: GameState }).state.actionSpaces[0]
    const player = (ctx as { player: PlayerState }).player
    expect(space.resources.wood).toBe(1)
    expect(player.resources.wood).toBe(2)
  })

  it('returns fail when space does not have enough', () => {
    const ctx = makeContext('test-space', { wood: 1 }, {
      spaceId: 'test-space',
      resource: 'wood',
      amount: 2,
    })
    const result = takeFromSpaceAction.execute(ctx)
    expect(result.type).toBe('fail')
  })

  it('returns fail when space does not exist', () => {
    const ctx = makeContext('other-space', { wood: 5 }, {
      spaceId: 'missing',
      resource: 'wood',
      amount: 1,
    })
    const result = takeFromSpaceAction.execute(ctx)
    expect(result.type).toBe('fail')
  })
})
