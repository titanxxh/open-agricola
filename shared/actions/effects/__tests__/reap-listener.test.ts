import { describe, expect, it, vi, afterEach } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { reap, dispatchReapListener } from '../reap'
import * as cardListeners from '../../../cards/card-listeners'

// Import card catalog to ensure listeners are registered
import '../../../cards/catalog'

describe('dispatchReapListener', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls runCardListeners with actionId=reap and crop/amount/trigger in extraData', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const state = { players: [] } as unknown as GameState
    const player = { id: 'p1' } as unknown as PlayerState

    dispatchReapListener(state, player, 'vegetable', 2)

    expect(spy).toHaveBeenCalledTimes(1)
    const ctx = spy.mock.calls[0]![0]
    expect(ctx.actionId).toBe('reap')
    expect(ctx.phase).toBe('immediatelyAfter')
    expect(ctx.extraData).toEqual({ crop: 'vegetable', amount: 2, trigger: { phase: 'harvest' } })
    expect(ctx.state).toBe(state)
    expect(ctx.player).toBe(player)
    spy.mockRestore()
  })

  it('does not call runCardListeners when amount <= 0', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const state = { players: [] } as unknown as GameState
    const player = { id: 'p1' } as unknown as PlayerState

    dispatchReapListener(state, player, 'grain', 0)

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('returns mandatory special-effect listener flows instead of committing them immediately', () => {
    const followUp = {
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: 'Test_ReapCard',
      params: { kind: 'set-extra-data', key: 'count', value: 1 },
    }
    vi.spyOn(cardListeners, 'runCardListeners').mockReturnValue([{
      flow: followUp,
    }])
    const player = {
      id: 'p1',
      cardStates: {},
    } as unknown as PlayerState
    const state = {
      round: 3,
      roundPhase: 'field',
      players: [player],
      actionSpaces: [],
    } as unknown as GameState

    const flow = dispatchReapListener(state, player, 'grain', 1)

    expect(flow).toEqual({ type: 'parallel', children: [followUp] })
    expect(state.events).toBeUndefined()
    expect(state.nextEventSeq).toBeUndefined()
  })

  it('returns listener follow-up flows wrapped in a normal parallel node', () => {
    const followUp = {
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: 'Test_ReapCard',
      params: { kind: 'gain-resource', resources: { food: 1 } },
    }
    vi.spyOn(cardListeners, 'runCardListeners').mockReturnValue([{ flow: followUp }])
    const state = { players: [] } as unknown as GameState
    const player = { id: 'p1' } as unknown as PlayerState

    const flow = dispatchReapListener(state, player, 'grain', 1)

    expect(flow).toEqual({
      type: 'parallel',
      children: [followUp],
    })
  })
})

describe('reap dispatches listener', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches reap listener for grain and vegetable separately', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const state = { players: [] } as unknown as GameState
    const player = {
      id: 'p1',
      resources: { grain: 0, vegetable: 0 },
      fields: [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 1, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    } as unknown as PlayerState

    reap(state, player)

    // Should have dispatched twice: once for grain(1), once for vegetable(2)
    expect(spy).toHaveBeenCalledTimes(2)
    const calls = spy.mock.calls.map((c) => c[0].extraData)
    expect(calls).toContainEqual({ crop: 'grain', amount: 1, trigger: { phase: 'harvest' } })
    expect(calls).toContainEqual({ crop: 'vegetable', amount: 2, trigger: { phase: 'harvest' } })
  })

  it('returns one parallel reaction flow for listener follow-ups produced during Reap', () => {
    const grainFollowUp = {
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: 'Grain_ReapCard',
      params: { kind: 'gain-resource', resources: { food: 1 } },
    }
    const vegetableFollowUp = {
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: 'Vegetable_ReapCard',
      params: { kind: 'gain-resource', resources: { food: 2 } },
    }
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation((ctx) => {
      if (ctx.extraData?.crop === 'grain') return [{ flow: grainFollowUp }]
      if (ctx.extraData?.crop === 'vegetable') return [{ flow: vegetableFollowUp }]
      return []
    })
    const state = { players: [] } as unknown as GameState
    const player = {
      id: 'p1',
      resources: { grain: 0, vegetable: 0 },
      fields: [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    } as unknown as PlayerState

    const result = reap(state, player)

    expect(result.reactionFlow).toEqual({
      type: 'parallel',
      children: [grainFollowUp, vegetableFollowUp],
    })
  })

  it('does not dispatch for crops with 0 reap', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const state = { players: [] } as unknown as GameState
    const player = {
      id: 'p1',
      resources: { grain: 0, vegetable: 0 },
      fields: [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
      ],
    } as unknown as PlayerState

    reap(state, player)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0].extraData).toEqual({ crop: 'grain', amount: 1, trigger: { phase: 'harvest' } })
  })
})
