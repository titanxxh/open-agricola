import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import { gainAction } from '../../shared/actions/effects/gain'

import '../../shared/cards/B/B138_ForestGuardian'

const CARD_ID = 'B138_ForestGuardian'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('B138_ForestGuardian session — opponent pays food on 5+ wood collect', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push(CARD_ID)
    owner.resources.food = 5
    opponent.resources.food = 3
    return { session, state, owner, opponent }
  }

  it('listener fires when opponent collects forest with 5+ wood, returns gain leaf with payerId', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    expect(listener).toBeDefined()

    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest', resources: { wood: 5 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('seq')
    if (result!.flow?.type === 'seq') {
      const leaf = result!.flow.children[0]
      expect(leaf?.type).toBe('leaf')
      if (leaf?.type === 'leaf') {
        expect(leaf.actionId).toBe('gain')
        expect(leaf.params).toEqual({
          food: 1,
          recipientPlayerId: owner.id,
          payerId: opponent.id,
        })
      }
    }
  })

  it('listener does NOT fire below 5 wood threshold', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest', resources: { wood: 4 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('listener does NOT fire on non-wood spaces', () => {
    const listener = findListener('B138-forest-guardian-before-opponent-collect')
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'fishing', resources: { wood: 5, food: 1 } })

    const result = executeCardListener(listener!, {
      state,
      player: opponent,
      space,
      actionId: 'collect',
      phase: 'before',
      result: { type: 'ok' },
      ownerPlayer: owner,
      triggerPlayer: opponent,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('gain leaf with payerId actually deducts opponent food and credits owner', () => {
    const { state, owner, opponent } = setup()
    const space = mkActionSpace({ id: 'forest' })

    const ownerFoodBefore = owner.resources.food
    const opponentFoodBefore = opponent.resources.food

    // Simulate the leaf executing under owner context (PlayerSwitch upstream).
    gainAction.execute({
      state,
      player: owner,
      space,
      params: {
        food: 1,
        recipientPlayerId: owner.id,
        payerId: opponent.id,
      },
      sourceCard: CARD_ID,
    })

    expect(owner.resources.food).toBe(ownerFoodBefore + 1)
    expect(opponent.resources.food).toBe(opponentFoodBefore - 1)
  })

  it('gain payerId clamps at 0 when opponent has insufficient food', () => {
    const { state, owner, opponent } = setup()
    opponent.resources.food = 0
    const space = mkActionSpace({ id: 'forest' })

    gainAction.execute({
      state,
      player: owner,
      space,
      params: {
        food: 1,
        recipientPlayerId: owner.id,
        payerId: opponent.id,
      },
      sourceCard: CARD_ID,
    })

    expect(opponent.resources.food).toBe(0)
    expect(owner.resources.food).toBe(6) // owner still credited
  })
})
