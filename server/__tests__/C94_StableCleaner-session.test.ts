import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C94_StableCleaner'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C94_StableCleaner'
const LISTENER_ID = 'C94-stable-cleaner-anytime'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

/**
 * C94 Stable Cleaner — At any time, you can take the Build Stables action
 * without placing a person. If you do, each stable costs you 1 wood + 1 food.
 *
 * BGA: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 * Implementation: anytime listener emits a SEQ:
 *   set-flag → stables (with actionContext.costOverride { wood:-1, food:1 })
 *   → unset-flag.
 * The override flips base { wood:2 } to { wood:1, food:1 } via
 * applyCostOverride. Doable gate now requires 1 wood + 1 food.
 */
describe('C94_StableCleaner — cost override 1 wood + 1 food', () => {
  const setupContext = (
    resources: { wood?: number; food?: number },
    stableTilesLength = 0,
  ) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: resources.wood ?? 0,
      food: resources.food ?? 0,
    }
    player.stableTiles = Array.from({ length: stableTilesLength }, (_, i) => ({
      row: 1,
      col: i + 1,
    }))
    session.loadState(state)
    return {
      state,
      player,
      actionId: 'stables',
      phase: 'anytime' as const,
    } as unknown as CardListenerContext
  }

  it('emits stables flow with costOverride { wood:-1, food:1 } when player has 1 wood + 1 food', () => {
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const ctx = setupContext({ wood: 1, food: 1 })
    const result = executeCardListener(listener!, ctx)
    expect(result?.flow).toBeDefined()
    const seq = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')

    const stablesLeaf = seq.children.find(
      (c) => c.type === 'leaf' && c.actionId === 'stables',
    ) as Extract<ActionFlow, { type: 'leaf' }> | undefined
    expect(stablesLeaf).toBeDefined()
    expect(stablesLeaf!.actionContext).toBeDefined()
    expect(stablesLeaf!.actionContext!.costOverride).toEqual({ wood: -1, food: 1 })
    expect(stablesLeaf!.actionContext!.trueAction).toBe(false)
    expect(stablesLeaf!.sourceCard).toBe(CARD_ID)
  })

  it('does NOT emit when player lacks wood (no 1 wood)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 0, food: 5 })
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('does NOT emit when player lacks food (no 1 food)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 5, food: 0 })
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('does NOT emit when player already has 4 stables', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 5, food: 5 }, 4)
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('emits when player has 3 stables and resources (room for 1 more)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 1, food: 1 }, 3)
    const result = executeCardListener(listener, ctx)
    expect(result?.flow).toBeDefined()
  })
})
