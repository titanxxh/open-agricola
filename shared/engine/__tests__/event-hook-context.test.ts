import { afterEach, describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../contract/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import type { CardListenerRegistration } from '../../cards/card-listeners'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { buildPhaseTrailingNodes } from '../engine-utils'
import { ActionNode, OrNode, SequenceNode } from '../nodes'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestState,
} from './event-test-helpers'

const action = (
  id: string,
  execute: ActionDefinition['execute'],
): ActionDefinition => ({
  id,
  nameKey: `test.${id}`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute,
})

const emitExchange = (context: Parameters<ActionDefinition['execute']>[0]) => {
  context.eventSink.emit({
    type: 'resource.exchanged',
    paid: { food: 1 },
    gained: { wood: 2 },
    paidFrom: { kind: 'player', playerId: context.player.id },
    paidTo: { kind: 'supply' },
    gainedFrom: { kind: 'supply' },
    gainedTo: { kind: 'player', playerId: context.player.id },
    exchangeSource: 'test-exchange',
  })
}

const historicalMoveEvent: GameEvent = {
  schemaVersion: 1,
  id: '99',
  seq: 99,
  round: 1,
  phase: 'work',
  type: 'resource.moved',
  visibility: 'public',
  resources: { wood: 1 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
}

describe('engine hook event context', () => {
  afterEach(() => {
    clearActionHooks()
  })

  it('exposes current transaction events to action after hooks without eventSink', () => {
    const exchange = action('action-hook-event-query', (context) => {
      emitExchange(context)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    state.events = [historicalMoveEvent]
    state.nextEventSeq = 100
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([exchange])
    const space = asActionSpace(exchange)
    let observed = false

    registerActionHook({
      id: 'test-action-after-event-query',
      actions: [exchange.id],
      phases: ['after'],
      handler: (context) => {
        observed = context.eventQuery.has(
          'resource.exchanged',
          (event) => (event.gained.wood ?? 0) === 2,
        )
        expect(context.transactionEvents).toHaveLength(1)
        expect(context.transactionEvents).not.toContain(historicalMoveEvent)
        expect(context.eventQuery.has('resource.moved')).toBe(false)
        expect('eventSink' in context).toBe(false)
        expect(context.state.events).toEqual([historicalMoveEvent])
      },
    })

    expect(engine.proceed({ state, player, space }).type).toBe('ok')

    expect(observed).toBe(true)
    expect(state.events).toHaveLength(2)
    expect(state.events[0]).toBe(historicalMoveEvent)
  })

  it('exposes current transaction events to card after listeners without eventSink', () => {
    const exchange = action('card-listener-event-query', (context) => {
      emitExchange(context)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    player.improvements.push('Test_Event_Query_Card')
    state.events = [historicalMoveEvent]
    state.nextEventSeq = 100
    const { engine } = makeEventTestEngine([exchange])
    const space = asActionSpace(exchange)
    const registry = new CardRegistry()
    let observed = false
    const listener: CardListenerRegistration = {
      id: 'test-card-after-event-query',
      cardIds: ['Test_Event_Query_Card'],
      actions: [exchange.id],
      phases: ['after'],
      handler: (context) => {
        observed = context.eventQuery.has(
          'resource.exchanged',
          (event) => event.exchangeSource === 'test-exchange',
        )
        expect(context.transactionEvents).toHaveLength(1)
        expect(context.transactionEvents).not.toContain(historicalMoveEvent)
        expect(context.eventQuery.has('resource.moved')).toBe(false)
        expect('eventSink' in context).toBe(false)
        expect(context.state.events).toEqual([historicalMoveEvent])
      },
    }
    registry.registerListener(listener)

    withActiveRegistry(registry, () => {
      expect(engine.proceed({ state, player, space }).type).toBe('ok')
      expect(engine.proceed({ state, player, space }).type).toBe('ok')
    })

    expect(observed).toBe(true)
    expect(state.events).toEqual([historicalMoveEvent])
  })

  it('exposes current transaction events to computeReplace choice-label previews', () => {
    const exchange = action('choice-preview-exchange', (context) => {
      emitExchange(context)
      return { type: 'ok' }
    })
    const fallback = action('choice-preview-fallback', () => ({ type: 'ok' }))
    const replaceTarget = action('choice-preview-target', () => ({ type: 'ok' }))
    const state = makeEventTestState()
    const player = state.players[0]!
    player.improvements.push('Test_Choice_Preview_Card')
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'test-choice-preview-event-query',
      cardIds: ['Test_Choice_Preview_Card'],
      actions: [replaceTarget.id],
      phases: ['computeReplace'],
      handler: (context) => {
        if (!context.eventQuery.has('resource.exchanged')) return
        return {
          decline: true,
          alternativeFlow: { type: 'leaf', actionId: fallback.id },
        }
      },
    })
    const { engine } = makeEventTestEngine(
      [exchange, fallback, replaceTarget],
      new SequenceNode('choice-preview-root', [
        new ActionNode('choice-preview-exchange-node', exchange.id),
        new OrNode('choice-preview-or', [
          new ActionNode('choice-preview-target-node', replaceTarget.id),
        ]),
      ]),
    )

    withActiveRegistry(registry, () => {
      expect(engine.proceed({ state, player, space: asActionSpace(exchange) }).type).toBe('ok')
      const step = engine.proceed({ state, player, space: asActionSpace(exchange) })

      expect(step.type).toBe('choice')
      if (step.type !== 'choice') return
      expect(step.choice.options[0]?.labelKey).toBe('ui.interactionActionOrReplace')
    })
  })

  it('exposes current transaction events to trigger-select continuation previews', () => {
    const exchange = action('trigger-preview-exchange', (context) => {
      emitExchange(context)
      return { type: 'ok' }
    })
    const fallback = action('trigger-preview-fallback', () => ({ type: 'ok' }))
    const blocked = action('trigger-preview-blocked', () => ({ type: 'ok' }))
    blocked.canBeExecutedByPlayer = (_state, player) => player.resources.wood >= 1
    const state = makeEventTestState()
    const player = state.players[0]!
    player.improvements.push('Test_Replace_Preview_Card')
    const registry = new CardRegistry()
    let previewListenerObserved = false
    const listener = {
      id: 'test-trigger-preview-listener',
      cardIds: ['Test_Trigger_Preview_Card'],
      actions: [blocked.id],
      phases: ['before' as const],
      dispatchMode: 'select' as const,
      handler: (context) => {
        previewListenerObserved = context.eventQuery.has('resource.exchanged')
        expect(context.transactionEvents).toHaveLength(1)
        expect('eventSink' in context).toBe(false)
        return {
          flow: { type: 'leaf' as const, actionId: 'gain', params: { wood: 1 } },
        }
      },
    }
    registry.registerListener(listener)
    registry.registerListener({
      id: 'test-trigger-replace-event-query',
      cardIds: ['Test_Replace_Preview_Card'],
      actions: [blocked.id],
      phases: ['computeReplace'],
      handler: (context) => {
        if (!context.eventQuery.has('resource.exchanged')) return
        return {
          decline: true,
          alternativeFlow: { type: 'leaf', actionId: fallback.id },
        }
      },
    })
    const setup = makeEventTestEngine([exchange, fallback, blocked])
    const [triggerSelect] = buildPhaseTrailingNodes(
      setup.engine._internals(),
      [{ registration: listener, cardId: 'Test_Trigger_Preview_Card', ownerPlayerId: player.id }],
      'before',
      blocked.id,
      state,
      {},
      player.id,
    )
    const { engine } = makeEventTestEngine(
      [exchange, fallback, blocked],
      new SequenceNode('trigger-preview-root', [
        new ActionNode('trigger-preview-exchange-node', exchange.id),
        triggerSelect!,
        new ActionNode('trigger-preview-blocked-node', blocked.id),
      ]),
    )

    withActiveRegistry(registry, () => {
      expect(engine.proceed({ state, player, space: asActionSpace(exchange) }).type).toBe('ok')
      const step = engine.proceed({ state, player, space: asActionSpace(exchange) })

      expect(step.type).toBe('choice')
      if (step.type !== 'choice') return
      const passOption = step.choice.options.find((option) => option.value === '__pass__')
      expect(passOption?.disabled).not.toBe(true)
      expect(previewListenerObserved).toBe(true)
    })
  })
})
