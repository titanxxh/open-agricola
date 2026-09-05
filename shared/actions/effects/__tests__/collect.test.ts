import { describe, it, expect } from 'vitest'
import { collectAction } from '../collect'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import type { ActionMutationContext, ActionSpace, PlayerState, GameState } from '../../../contract/types'

type TestContext = ActionMutationContext & { capturedEvents: DraftGameEvent[] }

const makeEventSink = (capturedEvents: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    capturedEvents.push(event)
  },
  emitMany: (events) => {
    capturedEvents.push(...events)
  },
})

const makeCtx = (actionContext?: Record<string, unknown>): TestContext => {
  const capturedEvents: DraftGameEvent[] = []
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
  return { state, player, space, actionContext, eventSink: makeEventSink(capturedEvents), capturedEvents } as unknown as TestContext
}

describe('collect.execute', () => {
  it('collects selected resource types from every action space as one action result', () => {
    const ctx = makeCtx({ allActionSpaceResourceTypes: ['wood', 'clay', 'reed', 'stone'] })
    ctx.space.resources = { ...ctx.space.resources, wood: 2, food: 4 }
    ctx.state.actionSpaces.push({
      ...ctx.space,
      id: 'clay-pit',
      resources: { ...ctx.space.resources, wood: 0, clay: 3, food: 0 },
    })

    const result = collectAction.execute(ctx)

    expect(result).toMatchObject({ type: 'ok', resourcesGained: { wood: 2, clay: 3 } })
    expect(ctx.player.resources).toMatchObject({ wood: 2, clay: 3, food: 0 })
    expect(ctx.state.actionSpaces[0]!.resources).toMatchObject({ wood: 0, food: 4 })
    expect(ctx.state.actionSpaces[1]!.resources.clay).toBe(0)
    expect(ctx.capturedEvents).toEqual([
      expect.objectContaining({
        type: 'resource.moved',
        resources: { wood: 2 },
        from: { kind: 'actionSpace', spaceId: 'wood-cutter' },
      }),
      expect.objectContaining({
        type: 'resource.moved',
        resources: { clay: 3 },
        from: { kind: 'actionSpace', spaceId: 'clay-pit' },
      }),
    ])
    expect(ctx.player.stats.resourcesFromBoard).toMatchObject({ wood: 2, clay: 3 })
  })

  it('rejects an invalid all-space resource request without draining the current space', () => {
    const ctx = makeCtx({ allActionSpaceResourceTypes: ['wood', 'unknown'] })

    expect(collectAction.execute(ctx)).toEqual({
      type: 'fail',
      errorKey: 'log.collectInvalidPartial',
    })
    expect(ctx.space.resources.wood).toBe(5)
    expect(ctx.player.resources.wood).toBe(0)
  })

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

  it('partial-take: emits resource.moved from action space to player', () => {
    const ctx = makeCtx({ spaceId: 'wood-cutter', resource: 'wood', amount: 2 })
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('ok')
    expect(ctx.capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { wood: 2 },
        from: { kind: 'actionSpace', spaceId: 'wood-cutter' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'collect',
      },
    ])
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

  it.each([
    ['missing amount', { spaceId: 'wood-cutter', resource: 'wood' }],
    ['zero amount', { spaceId: 'wood-cutter', resource: 'wood', amount: 0 }],
    ['missing resource', { spaceId: 'wood-cutter', amount: 1 }],
  ])('partial-take: fails on incomplete payload (%s)', (_name, actionContext) => {
    const ctx = makeCtx(actionContext)
    const result = collectAction.execute(ctx)
    expect(result.type).toBe('fail')
    if (result.type === 'fail') {
      expect(result.errorKey).toBe('log.collectInvalidPartial')
    }
    expect(ctx.space.resources.wood).toBe(5)
    expect(ctx.player.resources.wood).toBe(0)
  })
})
