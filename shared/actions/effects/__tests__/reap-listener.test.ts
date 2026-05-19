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

  it('calls runCardListeners with actionId=reap and crop/amount in extraData', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const state = { players: [] } as unknown as GameState
    const player = { id: 'p1' } as unknown as PlayerState

    dispatchReapListener(state, player, 'vegetable', 2)

    expect(spy).toHaveBeenCalledTimes(1)
    const ctx = spy.mock.calls[0]![0]
    expect(ctx.actionId).toBe('reap')
    expect(ctx.phase).toBe('immediatelyAfter')
    expect(ctx.extraData).toEqual({ crop: 'vegetable', amount: 2 })
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

  it('commits immediate special-effect events when no external event sink is provided', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockReturnValue([{
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: 'Test_ReapCard',
        params: { kind: 'set-extra-data', key: 'count', value: 1 },
      },
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

    dispatchReapListener(state, player, 'grain', 1)

    expect(state.events).toEqual([
      expect.objectContaining({
        type: 'card.stateChanged',
        seq: 1,
        sourceActionId: 'reap',
        sourceCardId: 'Test_ReapCard',
        actorPlayerId: 'p1',
      }),
    ])
    expect(state.nextEventSeq).toBe(2)
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
    expect(calls).toContainEqual({ crop: 'grain', amount: 1 })
    expect(calls).toContainEqual({ crop: 'vegetable', amount: 2 })
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
    expect(spy.mock.calls[0]![0].extraData).toEqual({ crop: 'grain', amount: 1 })
  })
})
