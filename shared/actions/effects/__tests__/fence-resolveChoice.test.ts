import { describe, expect, it } from 'vitest'
import { fenceAction } from '../fencing'
import { storePendingFenceBonus } from '../../../cards/helpers/pending-fence-bonus'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'

const dummySpace: ActionSpace = { id: 'fencing', type: 'fencing' } as unknown as ActionSpace

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    actionContext?: Record<string, unknown>
    costs?: Partial<Resource>
  } = {},
): ActionExecutionContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 4,
      clay: 0,
      stone: 0,
      reed: 0,
      grain: 0,
      vegetable: 0,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [],
    roomTiles: [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    stableTiles: [],
    pastures: [],
    fenceSegments: [],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    activeModifiers: [],
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const state = {
    players: [player],
    currentPlayerIndex: 0,
  } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
    costs: opts.costs,
  } as ActionExecutionContext
}

describe('fenceAction.resolveChoice', () => {
  it('cancel returns ok', () => {
    const result = fenceAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('first call with payload + payable wood finalizes immediately', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('ok')
    expect(ctx.player.resources.wood).toBe(0)
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.pastures).toHaveLength(1)
  })

  it('first call with multi-combo payment returns choice + actionContextWrite', () => {
    // 1 wood + clay/stone trade modifiers force the payment-combo prompt for
    // a 4-fence enclosure that costs 4 wood total.
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 1,
          clay: 4,
          stone: 4,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        activeModifiers: [
          {
            type: 'trade',
            cardId: 'Test_Fence_Clay',
            appliesTo: ['fencing'],
            from: { clay: 2 },
            to: { wood: 2 },
            max: 2,
          },
          {
            type: 'trade',
            cardId: 'Test_Fence_Stone',
            appliesTo: ['fencing'],
            from: { stone: 2 },
            to: { wood: 2 },
            max: 2,
          },
        ] as PlayerState['activeModifiers'],
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.options.length).toBeGreaterThan(1)
    const write = result.extraData?.actionContextWrite as
      | { farmPayload?: { edges?: string[]; palisadeEdges?: string[]; extraWood?: number } }
      | undefined
    expect(write?.farmPayload?.edges).toEqual(edgesForTile(0, 0))
    expect(write?.farmPayload?.palisadeEdges).toEqual([])
    expect(write?.farmPayload?.extraWood).toBe(0)
    // wood not yet consumed — pending payment selection.
    expect(ctx.player.resources.wood).toBe(1)
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('second call after payment combo reads farmPayload from actionContext', () => {
    const ctx = makeCtx({
      actionContext: {
        farmPayload: {
          edges: edgesForTile(0, 0),
          palisadeEdges: [],
          extraWood: 0,
        },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'pay:fence:0')
    expect(result.type).toBe('ok')
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.pastures).toHaveLength(1)
  })

  it('second call without farmPayload returns fail', () => {
    const result = fenceAction.resolveChoice!(makeCtx(), 'pay:fence:0')
    expect(result.type).toBe('fail')
  })

  it('pendingFreeFences reduces wood cost', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
    })
    storePendingFenceBonus(ctx.player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 4,
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('ok')
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.resources.wood).toBe(0)
  })

  it('first call with invalid edges returns fail', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: ['invalid-edge'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('bare confirm without payload returns fail', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm')
    expect(result.type).toBe('fail')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })
})
