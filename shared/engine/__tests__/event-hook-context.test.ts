import { afterEach, describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../contract/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import type { CardListenerRegistration } from '../../cards/card-listeners'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { buildPhaseTrailingNodes } from '../engine-utils'
import { ActionNode, OrNode, XorNode, SequenceNode } from '../nodes'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestState,
} from './event-test-helpers'
import type { GameEvent } from '../../contract/events'
import { createInitialState } from '../../session/state-bootstrap'
import { getActionDefinition } from '../../actions'

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
  emitWoodExchange(context, 2)
}

const emitWoodExchange = (
  context: Parameters<ActionDefinition['execute']>[0],
  wood: number,
) => {
  context.eventSink.emit({
    type: 'resource.exchanged',
    paid: { food: 1 },
    gained: { wood },
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

  it('exposes only current frame events as actionEvents to action after hooks', () => {
    const first = action('action-events-first', (context) => {
      emitWoodExchange(context, 2)
      return { type: 'ok' }
    })
    const second = action('action-events-second', (context) => {
      emitWoodExchange(context, 3)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine(
      [first, second],
      new SequenceNode('action-events-root', [
        new ActionNode('action-events-first-node', first.id),
        new ActionNode('action-events-second-node', second.id),
      ]),
    )
    let observed = false

    registerActionHook({
      id: 'test-action-events-after',
      actions: [second.id],
      phases: ['after'],
      handler: (context) => {
        observed = true
        expect(context.transactionEvents).toHaveLength(2)
        expect(context.actionEvents).toHaveLength(1)
        expect(context.actionEvents?.[0]).toEqual(expect.objectContaining({
          type: 'resource.exchanged',
          gained: expect.objectContaining({ wood: 3 }),
        }))
        expect(context.eventQuery.has(
          'resource.exchanged',
          (event) => (event.gained.wood ?? 0) === 2,
        )).toBe(true)
      },
    })

    expect(engine.proceed({ state, player, space: asActionSpace(first) }).type).toBe('ok')
    expect(engine.proceed({ state, player, space: asActionSpace(second) }).type).toBe('ok')

    expect(observed).toBe(true)
  })

  it('exposes wrapper flow events as actionEvents to delayed card after listeners', () => {
    const before = action('wrapper-flow-before', (context) => {
      emitWoodExchange(context, 2)
      return { type: 'ok' }
    })
    const child = action('wrapper-flow-child', (context) => {
      emitWoodExchange(context, 3)
      return { type: 'ok' }
    })
    const wrapper = action('wrapper-flow-parent', () => ({
      type: 'flow' as const,
      flow: { type: 'leaf' as const, actionId: child.id },
    }))
    const state = makeEventTestState()
    const player = state.players[0]!
    player.improvements.push('Test_Wrapper_Flow_Card')
    const registry = new CardRegistry()
    let observed = false
    registry.registerListener({
      id: 'test-wrapper-flow-event-slice',
      cardIds: ['Test_Wrapper_Flow_Card'],
      actions: [wrapper.id],
      phases: ['after'],
      handler: (context) => {
        observed = true
        expect(context.transactionEvents).toHaveLength(2)
        expect(context.actionEvents).toHaveLength(1)
        expect(context.actionEvents?.[0]).toEqual(expect.objectContaining({
          type: 'resource.exchanged',
          gained: expect.objectContaining({ wood: 3 }),
        }))
      },
    })
    const { engine } = makeEventTestEngine(
      [before, wrapper, child],
      new SequenceNode('wrapper-flow-root', [
        new ActionNode('wrapper-flow-before-node', before.id),
        new ActionNode('wrapper-flow-parent-node', wrapper.id),
      ]),
    )

    withActiveRegistry(registry, () => {
      for (let index = 0; index < 4 && !observed; index += 1) {
        expect(engine.proceed({ state, player, space: asActionSpace(before) }).type).toBe('ok')
      }
    })

    expect(observed).toBe(true)
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
      handler: (context) => {
        previewListenerObserved = context.eventQuery.has('resource.exchanged')
        expect(context.transactionEvents).toHaveLength(1)
        expect('eventSink' in context).toBe(false)
        return {
          flow: { type: 'leaf' as const, actionId: 'gain', params: { wood: 1 } },
        }
      },
    }
    const secondPreviewListener = {
      id: 'test-trigger-preview-listener-2',
      cardIds: ['Test_Trigger_Preview_Card_2'],
      actions: [blocked.id],
      phases: ['before' as const],
      handler: () => ({ extraData: { applicable: true } }),
    }
    registry.registerListener(listener)
    registry.registerListener(secondPreviewListener)
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
      [
        { registration: listener, cardId: 'Test_Trigger_Preview_Card', ownerPlayerId: player.id },
        { registration: secondPreviewListener, cardId: 'Test_Trigger_Preview_Card_2', ownerPlayerId: player.id },
      ],
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


describe('completed continuation event scopes', () => {
  it.each(['flow', 'internal'] as const)('retains host and child facts across payment flush and cursor restoration (%s)', kind => {
    const cardId = 'CUSTOM_ContinuationScope'
    const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.events = [historicalMoveEvent]
    state.nextEventSeq = 100
    const player = state.players[0]!
    player.minorPlayed = [cardId]
    player.resources.food = 2
    player.resources.wood = 2
    const seen: Array<{ phase: string; resultType?: string; transaction: GameEvent[]; action?: GameEvent[]; queried: boolean }> = []
    const cards = new CardRegistry()
    cards.registerListener({
      id: `${cardId}:completion`, cardIds: [cardId], actions: ['continuation-host'],
      phases: ['during', 'immediatelyAfter', 'after'], mandatory: true,
      handler: ctx => {
        seen.push({phase: ctx.phase, resultType: ctx.result?.type, transaction: [...ctx.transactionEvents], action: ctx.actionEvents ? [...ctx.actionEvents] : undefined, queried: ctx.eventQuery.has('resource.moved', event => event.resources.wood === 1)})
        return undefined
      },
    })
    const prefix = action('unrelated-prefix', context => {
      context.eventSink.emit({type: 'resource.moved', resources: {clay: 7}, from: {kind: 'supply'}, to: {kind: 'player', playerId: player.id}, reason: 'gain'})
      return {type: 'ok'}
    })
    const host = action('continuation-host', context => {
      context.eventSink.emit({type: 'resource.moved', resources: {stone: 1}, from: {kind: 'supply'}, to: {kind: 'player', playerId: player.id}, reason: 'gain'})
      const pay = {actionId: 'pay', params: {cost: {fees: [{food: 1}, {wood: 1}]}}, resultKey: 'payment'}
      if (kind === 'internal') return {type: 'ok', internalChildren: {beforeHostListeners: [{actionId: 'gain', params: {stone: 2}}, pay, {actionId: 'gain', params: {wood: 2}}, pay]}}
      return {type: 'flow', flow: {type: 'seq', children: [
        {type: 'leaf', actionId: 'gain', sourceCard: cardId, params: {wood: 1}},
        {type: 'leaf', actionId: 'gain', sourceCard: cardId, params: {stone: 2}},
        {type: 'leaf', sourceCard: cardId, ...pay},
        {type: 'leaf', actionId: 'gain', sourceCard: cardId, params: {wood: 2}},
        {type: 'leaf', sourceCard: cardId, ...pay},
      ]}}
    })
    const {engine} = makeEventTestEngine([prefix, host, getActionDefinition('gain')!, getActionDefinition('pay')!], new SequenceNode('scoped-root', [new ActionNode('prefix-node', prefix.id), new ActionNode('continuation-host-node', host.id, cardId)]))
    const context = {state, player, space: asActionSpace(host)}
    withActiveRegistry(cards, () => {
      let step = engine.proceed(context)
      for (let index = 0; index < 20 && step.type !== 'choice'; index++) step = engine.proceed(context)
      expect(step.type).toBe('choice')
      expect(player.resources.food).toBe(2)
      expect(seen.map(entry => entry.phase)).toEqual(kind === 'flow' ? ['during'] : [])
      for (let payment = 0; payment < 2; payment++) {
        engine.flushEventTransaction(context)
        engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
        const request = engine.peekPendingEnvelope()!.request
        expect(request.kind).toBe('choice')
        if (request.kind !== 'choice') throw new Error('expected payment choice')
        const food = request.options.find(option => (option.labelParams?.resourcesPaid as Record<string, number> | undefined)?.food === 1)!
        engine.resolveChoice(food.value, context)
        if (payment === 0) {
          step = engine.proceed(context)
          for (let index = 0; index < 20 && step.type !== 'choice'; index++) step = engine.proceed(context)
          expect(step.type).toBe('choice')
          expect(player.resources.food).toBe(1)
        }
      }
      step = engine.proceed(context)
      for (let index = 0; index < 30 && step.type !== 'done'; index++) {
        expect(step.type).not.toBe('blocked')
        expect(step.type).not.toBe('choice')
        step = engine.proceed(context)
      }
      expect(step.type).toBe('done')
    })
    expect(player.resources.food).toBe(0)
    expect(seen.map(entry => entry.phase)).toEqual(['during', 'immediatelyAfter', 'after'])
    for (const entry of seen.filter(entry => kind === 'internal' || entry.phase !== 'during')) {
      expect(entry.resultType).toBe(kind === 'flow' ? 'flow' : 'ok')
      expect(entry.transaction).not.toContainEqual(historicalMoveEvent)
      expect(entry.transaction).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 1}}))
      expect(entry.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 1}}))
      expect(entry.transaction.filter(event => event.type === 'resource.paid')).toHaveLength(2)
      expect(entry.transaction).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {clay: 7}}))
      expect(entry.action).not.toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {clay: 7}}))
      expect(entry.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 2}}))
      expect(entry.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {wood: 2}}))
      expect(entry.action?.filter(event => event.type === 'resource.paid')).toHaveLength(2)
      expect(new Set(entry.transaction.map(event => event.id)).size).toBe(entry.transaction.length)
      if (kind === 'flow') {
        expect(entry.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {wood: 1}}))
        expect(entry.queried).toBe(true)
      }
    }
    expect(state.events.filter(event => event.type === 'resource.paid')).toHaveLength(2)
  })
})


describe('returned flow continuation prefixes', () => {
  it.each((['direct', 'or', 'xor'] as const).flatMap(entry => [false, true].map(requestFirst => [entry, requestFirst] as const)))('keeps the host prefix before a flow body (%s/request=%s)', (entry, requestFirst) => {
    const cardId = 'CUSTOM_ReturnedFlow'
    const state = createInitialState(42, {playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42})
    for (const player of state.players) {player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']}
    const player = state.players[0]!
    player.minorPlayed = [cardId]
    const seen: Array<{phase: string; transaction: GameEvent[]; action?: GameEvent[]}> = []
    const cards = new CardRegistry()
    cards.registerListener({id: `${cardId}:listener`, cardIds: [cardId], actions: ['return-flow-host'], phases: ['during', 'immediatelyAfter', 'after'], mandatory: true, handler: ctx => {
      seen.push({phase: ctx.phase, transaction: [...ctx.transactionEvents], action: ctx.actionEvents ? [...ctx.actionEvents] : undefined})
      return undefined
    }})
    const body = {type: 'flow' as const, flow: {type: 'leaf' as const, actionId: 'gain', sourceCard: cardId, params: {clay: 1}}}
    const host = action('return-flow-host', context => {
      context.player.resources.wood += 1
      context.eventSink.emit({type: 'resource.moved', resources: {wood: 1}, from: {kind: 'supply'}, to: {kind: 'player', playerId: player.id}, reason: 'gain'})
      return requestFirst ? {type: 'request', request: {kind: 'choice', options: [{value: 'finish', labelKey: 'ui.interactionContinue'}]}, promptKey: 'ui.interactionContinue'} : body
    })
    host.resolveChoice = () => body
    const hostNode = new ActionNode('selected-host', host.id, cardId)
    const branch = entry === 'direct' ? hostNode : entry === 'or' ? new OrNode('branch', [hostNode]) : new XorNode('branch', [hostNode])
    const {engine} = makeEventTestEngine([host, getActionDefinition('gain')!], new SequenceNode('root', [new ActionNode('prefix', 'gain', undefined, {stone: 2}), branch]))
    const context = {state, player, space: asActionSpace(host)}
    withActiveRegistry(cards, () => {
      let step = engine.proceed(context)
      for (let index = 0; index < 30 && step.type !== 'done'; index++) {
        expect(step.type).not.toBe('blocked')
        if (step.type === 'choice') {
          const request = engine.peekPendingEnvelope()!.request
          expect(request.kind).toBe('choice')
          if (request.kind !== 'choice') throw new Error('expected host choice')
          // Pending re-emission commits too: exercise the same path used when
          // a Session cursor is restored, without an explicit flush call.
          engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
          engine.proceed(context)
          engine.resolveChoice(request.options.some(option => option.value === 'finish') ? 'finish' : request.options.some(option => option.value === '__done__') ? '__done__' : request.options[0]!.value, context)
        }
        step = engine.proceed(context)
      }
      expect(step.type).toBe('done')
    })
    expect(player.resources).toMatchObject({wood: 1, clay: 1, stone: 2})
    expect(seen.map(item => item.phase)).toEqual(['during', 'immediatelyAfter', 'after'])
    for (const item of seen) {
      expect(item.transaction).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {wood: 1}}))
      expect(item.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {wood: 1}}))
      // Composite selection commits the earlier transaction before this host starts.
      if (entry === 'direct') expect(item.transaction).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 2}}))
      else expect(item.transaction).not.toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 2}}))
      expect(item.action).not.toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {stone: 2}}))
      if (item.phase !== 'during') expect(item.action).toContainEqual(expect.objectContaining({type: 'resource.moved', resources: {clay: 1}}))
      expect(new Set(item.transaction.map(event => event.id)).size).toBe(item.transaction.length)
    }
  })
})
