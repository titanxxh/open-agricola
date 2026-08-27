import { describe, expect, it } from 'vitest'
import type { EngineStepResult } from '../../../engine/types'
import { Engine } from '../../../engine/engine'
import { ActionNode } from '../../../engine/nodes'
import { CardRegistry } from '../../../cards/registry'
import { withActiveRegistry } from '../../../cards/active-registry'
import { D036_BreedRegistry_impl } from '../../../cards/D/D036_BreedRegistry'
import { readCardExtraData } from '../../../cards/helpers/card-state'
import { asActionSpace, makeEventTestEngine, makeEventTestState } from '../../../engine/__tests__/event-test-helpers'
import { createInitialPlayerStats } from '../../../session/stats'
import { specialEffectAction } from '../special-effect'
import { bonusFoodAction, bonusWoodAction, gainAction } from '../gain'
import { takeFromCardAction } from '../internal/take-from-card'

const drain = (engine: Engine, state: ReturnType<typeof makeEventTestState>): EngineStepResult => {
  const player = state.players[0]!
  const space = asActionSpace(takeFromCardAction)
  let step = engine.proceed({ state, player, space })
  while (step.type === 'ok') step = engine.proceed({ state, player, space })
  return step
}

describe('take-from-card', () => {
  it('takes stored goods through gain while preserving take-from-card reactions', () => {
    const state = makeEventTestState()
    const player = state.players[0]!
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    player.minorPlayed = ['Test_Gain_Observer', 'Test_Take_Observer']
    player.cardStates = { Test_Source: { counters: { grain: 1 } } }

    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'test-after-gain',
      cardIds: ['Test_Gain_Observer'],
      actions: ['gain'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['bonus-wood'] }),
    })
    cardRegistry.registerListener({
      id: 'test-after-take-from-card',
      cardIds: ['Test_Take_Observer'],
      actions: ['take-from-card'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['bonus-food'] }),
    })

    const root = new ActionNode(
      'take-from-card-root',
      'take-from-card',
      'Test_Source',
      { grain: 1 },
    )
    const { engine } = makeEventTestEngine(
      [takeFromCardAction, gainAction, bonusWoodAction, bonusFoodAction],
      root,
    )

    const finalStep = withActiveRegistry(cardRegistry, () => drain(engine, state))

    expect(finalStep.type).toBe('done')
    expect(player.cardStates.Test_Source?.counters?.grain).toBe(0)
    expect(player.resources).toMatchObject({ grain: 1, wood: 1, food: 1 })
    expect(state.events?.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'Test_Source'
    )).toHaveLength(1)
  })

  it('counts sheep taken from a card once for Breed Registry', () => {
    const state = makeEventTestState()
    const player = state.players[0]!
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    player.minorPlayed = ['D036_BreedRegistry']
    player.cardStates = {
      D036_BreedRegistry: {},
      Test_Sheep_Source: { counters: { sheep: 1 } },
    }

    const cardRegistry = new CardRegistry()
    cardRegistry.loadImpl('D036_BreedRegistry', D036_BreedRegistry_impl)
    const root = new ActionNode(
      'take-sheep-from-card-root',
      'take-from-card',
      'Test_Sheep_Source',
      { sheep: 1 },
    )
    const { engine } = makeEventTestEngine(
      [takeFromCardAction, gainAction, specialEffectAction],
      root,
    )

    const finalStep = withActiveRegistry(cardRegistry, () => drain(engine, state))

    expect(finalStep.type).toBe('done')
    expect(player.resources.sheep).toBe(1)
    expect(readCardExtraData<number>(player, 'D036_BreedRegistry', 'cardSheep')).toBe(1)
  })
})
