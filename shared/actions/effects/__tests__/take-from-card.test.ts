import { describe, expect, it } from 'vitest'
import type { EngineStepResult } from '../../../engine/types'
import { Engine } from '../../../engine/engine'
import { ActionNode } from '../../../engine/nodes'
import { CardRegistry } from '../../../cards/registry'
import { withActiveRegistry } from '../../../cards/active-registry'
import { D036_BreedRegistry_impl } from '../../../cards/D/D036_BreedRegistry'
import { readCardExtraData } from '../../../cards/helpers/card-state'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestPlayer,
  makeEventTestState,
} from '../../../engine/__tests__/event-test-helpers'
import { createInitialPlayerStats } from '../../../session/stats'
import { specialEffectAction } from '../special-effect'
import { bonusFoodAction, bonusGrainAction, bonusWoodAction, gainAction } from '../gain'
import { receiveAction } from '../receive'
import { takeFromCardAction } from '../internal/take-from-card'

const drain = (engine: Engine, state: ReturnType<typeof makeEventTestState>): EngineStepResult => {
  const player = state.players[0]!
  const space = asActionSpace(takeFromCardAction)
  let step = engine.proceed({ state, player, space })
  while (step.type === 'ok') step = engine.proceed({ state, player, space })
  return step
}

describe('take-from-card', () => {
  it('credits stored goods through receive, so Receive and source reactions run and Gain reactions do not', () => {
    const state = makeEventTestState()
    const player = state.players[0]!
    const opponent = makeEventTestPlayer()
    opponent.id = 'p2'
    state.players.push(opponent)
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    player.minorPlayed = ['Test_Gain_Observer', 'Test_Receive_Observer', 'Test_Take_Observer']
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
      id: 'test-after-receive',
      cardIds: ['Test_Receive_Observer'],
      actions: ['receive'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['bonus-food'] }),
    })
    cardRegistry.registerListener({
      id: 'test-after-source-receive',
      cardIds: ['Test_Take_Observer'],
      actions: ['receive'],
      phases: ['after'],
      handler: context => context.sourceCard === 'Test_Source'
        ? { followUpActions: ['bonus-grain'] } : undefined,
    })

    const root = new ActionNode(
      'take-from-card-root',
      'take-from-card',
      'Test_Source',
      { grain: 1, recipientMode: 'others' },
    )
    const { engine } = makeEventTestEngine(
      [takeFromCardAction, receiveAction, gainAction, bonusWoodAction, bonusFoodAction, bonusGrainAction],
      root,
    )

    const finalStep = withActiveRegistry(cardRegistry, () => {
      let step = drain(engine, state)
      const remaining = new Set(['Test_Receive_Observer', 'Test_Take_Observer'])
      while (step.type === 'choice') {
        const option = step.choice.options.find(choice => choice.sourceCard && remaining.has(choice.sourceCard))
        expect(option).toBeDefined()
        if (!option?.sourceCard) throw new Error('Expected a source or receive reaction')
        remaining.delete(option.sourceCard)
        expect(engine.resolveChoice(option.value, { state, player, space: asActionSpace(takeFromCardAction) }).type).toBe('ok')
        step = drain(engine, state)
      }
      return step
    })

    expect(finalStep.type).toBe('done')
    expect(player.cardStates.Test_Source?.counters?.grain).toBe(0)
    expect(player.resources).toMatchObject({ grain: 2, wood: 0, food: 1 })
    expect(opponent.resources.grain).toBe(0)
    expect(state.events?.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'Test_Source'
    )).toEqual([expect.objectContaining({
      resources: { grain: 1 },
      from: { kind: 'card', playerId: player.id, cardId: 'Test_Source' },
      to: { kind: 'player', playerId: player.id },
      reason: 'cardEffect',
    })])
  })

  it('never offers Gain replacements for goods taken from a card', () => {
    const state = makeEventTestState()
    const player = state.players[0]!
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    player.cardStates = { Test_Source: { counters: { grain: 1 } } }
    player.minorPlayed = ['Test_Replace_Observer']

    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'test-replace-gain',
      cardIds: ['Test_Replace_Observer'],
      actions: ['gain'],
      phases: ['computeReplace'],
      handler: (context) => {
        if (context.actionContext?.checkedReplaceAction) return
        return {
          decline: true,
          alternativeFlow: { type: 'leaf', actionId: 'bonus-wood' },
        }
      },
    })

    const root = new ActionNode(
      'take-from-card-root',
      'take-from-card',
      'Test_Source',
      { grain: 1 },
    )
    const { engine } = makeEventTestEngine(
      [takeFromCardAction, receiveAction, gainAction, bonusWoodAction],
      root,
    )

    const finalStep = withActiveRegistry(cardRegistry, () => drain(engine, state))

    expect(finalStep.type).toBe('done')
    expect(player.resources).toMatchObject({ grain: 1, wood: 0 })
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
      [takeFromCardAction, receiveAction, specialEffectAction],
      root,
    )

    const finalStep = withActiveRegistry(cardRegistry, () => drain(engine, state))

    expect(finalStep.type).toBe('done')
    expect(player.resources.sheep).toBe(1)
    expect(readCardExtraData<number>(player, 'D036_BreedRegistry', 'cardSheep')).toBe(1)
  })
})
