/**
 * Task 3: red tests — fence execute path should honour actionContext.costOverride.
 *
 * Case 1 (PASS after T2): canStartFencing respects costOverride directly.
 * Case 2/3 (RED until T4): computeFreeFenceTotal must read ctx.actionContext.costOverride.
 */
import { describe, expect, it } from 'vitest'
import { canStartFencing, fenceAction } from '../fencing'
import { GameSession } from '../../../../server/game/authoritative-session'
import type { ActionMutationContext, GameState, PlayerState } from '../../../contract/types'

const fakeState = { actionSpaces: [], players: [] } as unknown as GameState

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [], rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

// 4 edges enclosing tile(row=0,col=0) — same layout used by E16/B30 session tests
const FOUR_FENCE_EDGES = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']

/**
 * Build a real GameState + PlayerState from GameSession so farmyard/playerBoard works,
 * then construct an ActionMutationContext with the given actionContext.
 */
const buildRealCtx = (
  woodAmount: number,
  actionContext: Record<string, unknown>,
): ActionMutationContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.resources.wood = woodAmount
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  session.loadState(state)

  const freshState = session.getState().state
  const freshPlayer = freshState.players[0]!
  const space = freshState.actionSpaces.find((s) => s.id === 'fencing')
    ?? freshState.actionSpaces[0]!

  return {
    state: freshState,
    player: freshPlayer,
    space,
    actionContext,
    eventSink: { emit: () => {}, emitMany: () => {} },
  } as unknown as ActionMutationContext
}

// ─── Case 1: unit test on canStartFencing (PASS — T2 work already correct) ───

describe('fence: canStartFencing with costOverride (unit, PASS after T2)', () => {
  it('case 1: wood=0 + costOverride.wood=-4 → true (covers minimumFenceSegments=4)', () => {
    const player = createPlayer()
    expect(canStartFencing(fakeState, player, { wood: -4 })).toBe(true)
  })
})

// ─── Case 2/3: resolveChoice execute path (RED until T4) ─────────────────────
//
// These call fenceAction.resolveChoice(...) directly so ctx.actionContext.costOverride
// is visible to finalizeFence. Once T4 threads it through computeFreeFenceTotal the
// tests will turn green.

describe('fence: actionContext.costOverride in resolveChoice execute path (RED until T4)', () => {
  it('case 2: costOverride.wood=-4, wood=0, build 4 fences → ok=true, wood=0 (fully free)', () => {
    const ctx = buildRealCtx(0, { costOverride: { wood: -4 } })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: FOUR_FENCE_EDGES,
      palisadeEdges: [],
      extraWood: 0,
    })

    // T4 fix: computeFreeFenceTotal reads ctx.actionContext.costOverride → free=4 → pay 0
    // Before T4: free=0 → tries to pay 4 wood → insufficient (wood=0) → type='fail'
    expect(result.type).toBe('ok')
    expect(ctx.player.resources.wood).toBe(0)
    expect(ctx.player.fenceSegments).toHaveLength(4)
  })

  it('case 3: costOverride.wood=-2 (cap=2), wood=2, build 4 fences → ok=true, wood=0 (pay 2)', () => {
    const ctx = buildRealCtx(2, { costOverride: { wood: -2 } })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: FOUR_FENCE_EDGES,
      palisadeEdges: [],
      extraWood: 0,
    })

    // T4 fix: free=2, pay max(0,4-2)=2 → wood=2-2=0
    // Before T4: free=0 → pay 4 wood → 2-4=-2 → canBuildFence reject → type='fail'
    expect(result.type).toBe('ok')
    expect(ctx.player.resources.wood).toBe(0)
    expect(ctx.player.fenceSegments).toHaveLength(4)
  })
})
