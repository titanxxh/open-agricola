import { describe, it, expect } from 'vitest'
import { collectAction } from '../collect'
import type { ActionExecutionContext, ActionSpace, PlayerState, GameState } from '../../../contract/types'

const makeCtx = (actionContext?: Record<string, unknown>): ActionExecutionContext => {
  const space: ActionSpace = {
    id: 'wood-cutter',
    nameKey: '', descriptionKey: '',
    roundAvailable: 1, gainPerRound: { wood: 3 },
    resources: { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 },
  } as ActionSpace
  const player: PlayerState = {
    id: 'p1',
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 },
  } as unknown as PlayerState
  const state: GameState = { players: [player], workPhaseResources: {}, actionSpaces: [space] } as unknown as GameState
  return { state, player, space, actionContext } as unknown as ActionExecutionContext
}

describe('collect.execute', () => {
  it('default: drains all resources from space', () => {
    const ctx = makeCtx()
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.resourcesGained).toEqual({ wood: 5 })
      expect(ctx.space.resources.wood).toBe(0)
      expect(ctx.player.resources.wood).toBe(5)
    }
  })

  it('partial-take: takes exactly requested resource and amount', () => {
    const ctx = makeCtx({ spaceId: 'wood-cutter', resource: 'wood', amount: 1 })
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.resourcesGained).toEqual({ wood: 1 })
      expect(ctx.space.resources.wood).toBe(4)
      expect(ctx.player.resources.wood).toBe(1)
    }
  })

  it('partial-take: fails when space has insufficient resource', () => {
    const ctx = makeCtx({ spaceId: 'wood-cutter', resource: 'stone', amount: 1 })
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('fail')
  })

  it('partial-take: returns resourcesGained for the requested resource (so E33 listener can read reed)', () => {
    const ctx = makeCtx({ spaceId: 'wood-cutter', resource: 'reed', amount: 1 })
    ctx.space.resources.reed = 2
    ctx.space.resources.wood = 0
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('ok')
    if (result.type === 'ok') {
      expect(result.resourcesGained).toEqual({ reed: 1 })
    }
  })

  it('partial-take: fails when hinted spaceId cannot be resolved (no silent fallback)', () => {
    const ctx = makeCtx({ spaceId: 'nonexistent-space', resource: 'wood', amount: 1 })
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('fail')
    // ctx.space.resources.wood must NOT have been drained by the wrong space
    expect(ctx.space.resources.wood).toBe(5)
  })
})
