import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C52_HuntsmansHat'
import type { ActionExecutionResult, ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C52_HuntsmansHat'
const LISTENER_ID = 'C52-huntsmans-hat-after-boar-gain'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('C52_HuntsmansHat server session', () => {
  it('adds food and logs cardEffectGain when collecting boar from pig-market', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]
    player.resources.food = 0
    player.resources.boar = 0
    if (!player.minorPlayed.includes(CARD_ID)) {
      player.minorPlayed.push(CARD_ID)
    }

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 2

    session.loadState(state)
    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.boar).toBe(2)

    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ] as unknown as Record<string, unknown>)
    }

    expect(resp.state.players[0].resources.boar).toBeGreaterThanOrEqual(1)

    expect(resp.state.players[0].resources.food).toBe(2)
    const hasLog = resp.state.log.some(
      (e) =>
        e.key === 'log.cardEffectGain' &&
        e.params?.cardId === CARD_ID,
    )
    expect(hasLog).toBe(true)
  })
})

/**
 * BGA C52 listens to **any** Gain event with `fromActionSpace`, summing
 * obtained PIG and emitting `gainNode([FOOD => N])`. Our previous
 * implementation only handled `pig-market` collect; we now match BGA by
 * listening to `phase: 'after', actions: ['gain','collect','receive']` and
 * inspecting `resourcesGained.boar`. AnimalMarket flow modification
 * (sheep+food / boar+food / pay-food→cattle xor) is NOT implemented since
 * we have no AnimalMarket action space — registered as §2.5.
 */
describe('C52_HuntsmansHat listener — generic boar-gain trigger (any space)', () => {
  const setupListenerContext = (
    actionId: string,
    spaceId: string,
    boarGained: number,
  ) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return {
      state,
      player,
      space: { id: spaceId } as never,
      actionId,
      phase: 'after' as const,
      result: {
        type: 'ok',
        resourcesGained: { boar: boarGained },
      } as ActionExecutionResult,
    } as unknown as CardListenerContext
  }

  it('triggers on pig-market collect (boar gained)', () => {
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const ctx = setupListenerContext('collect', 'pig-market', 2)
    const result = executeCardListener(listener!, ctx)
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 2 })
    expect(result!.sourceCard).toBe(CARD_ID)
  })

  it('triggers on a non-pig-market space when a boar is gained (BGA generic behavior)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupListenerContext('gain', 'forest', 1) // arbitrary space
    const result = executeCardListener(listener, ctx)
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('triggers on receive action when a boar is gained', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupListenerContext('receive', 'some-space', 3)
    const result = executeCardListener(listener, ctx)
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 3 })
  })

  it('does not trigger when no boar is gained', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupListenerContext('collect', 'forest', 0)
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('does not trigger on irrelevant action ids', () => {
    const listener = findListener(LISTENER_ID)!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    const ctx = {
      state,
      player,
      space: { id: 'unrelated' } as never,
      actionId: 'plow',
      phase: 'after' as const,
      result: { type: 'ok', resourcesGained: { boar: 5 } } as ActionExecutionResult,
    } as unknown as CardListenerContext
    // Listener is filtered by `actions: ['gain','collect','receive']`, so
    // the dispatcher would never invoke it on plow. We simulate by checking
    // the configured actions list directly.
    expect(listener.actions).toBeDefined()
    expect(listener.actions).not.toContain('plow')
    // Even if forced through the handler, the action-id guard inside the
    // handler should prevent firing.
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })
})

