import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../contract/types'
import type { GameEvent } from '../../contract/events'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { createInitialState } from '../../session/state-bootstrap'
import { getActionDefinition } from '../../actions'
import { ActionNode, OrNode, SequenceNode, XorNode } from '../nodes'
import { asActionSpace, makeEventTestEngine } from './event-test-helpers'

const action = (id: string, execute: ActionDefinition['execute']): ActionDefinition => ({
  id,
  nameKey: `test.${id}`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute,
})

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

const freshState = () => {
  const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  return state
}

describe('completed continuation event scopes', () => {
  it.each(['flow', 'internal'] as const)('retains host and child facts across payment flush and cursor restoration (%s)', (kind) => {
    const cardId = 'Test_ContinuationScope'
    const state = freshState()
    state.events = [historicalMoveEvent]
    state.nextEventSeq = 100
    const player = state.players[0]!
    player.minorPlayed = [cardId]
    player.resources.food = 2
    player.resources.wood = 2
    const seen: Array<{ phase: string; resultType?: string; transaction: GameEvent[]; action?: GameEvent[]; queried: boolean }> = []
    const cards = new CardRegistry()
    cards.registerListener({
      id: `${cardId}:completion`,
      cardIds: [cardId],
      actions: ['continuation-host'],
      phases: ['immediatelyAfter', 'after'],
      mandatory: true,
      handler: (ctx) => {
        seen.push({
          phase: ctx.phase,
          resultType: ctx.result?.type,
          transaction: [...ctx.transactionEvents],
          action: ctx.actionEvents ? [...ctx.actionEvents] : undefined,
          queried: ctx.eventQuery.has('resource.moved', (event) => event.resources.wood === 1),
        })
        return undefined
      },
    })
    const prefix = action('unrelated-prefix', (context) => {
      context.eventSink.emit({ type: 'resource.moved', resources: { clay: 7 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: player.id }, reason: 'gain' })
      return { type: 'ok' }
    })
    const host = action('continuation-host', (context) => {
      context.eventSink.emit({ type: 'resource.moved', resources: { stone: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: player.id }, reason: 'gain' })
      const pay = { actionId: 'pay', params: { cost: { fees: [{ food: 1 }, { wood: 1 }] } }, resultKey: 'payment' }
      if (kind === 'internal') {
        return { type: 'ok', internalChildren: { beforeHostListeners: [{ actionId: 'gain', params: { stone: 2 } }, pay, { actionId: 'gain', params: { wood: 2 } }, pay] } }
      }
      return { type: 'flow', flow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { wood: 1 } },
        { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { stone: 2 } },
        { type: 'leaf', sourceCard: cardId, ...pay },
        { type: 'leaf', actionId: 'gain', sourceCard: cardId, params: { wood: 2 } },
        { type: 'leaf', sourceCard: cardId, ...pay },
      ] } }
    })
    const { engine } = makeEventTestEngine(
      [prefix, host, getActionDefinition('gain')!, getActionDefinition('pay')!],
      new SequenceNode('scoped-root', [new ActionNode('prefix-node', prefix.id), new ActionNode('continuation-host-node', host.id, cardId)]),
    )
    const context = { state, player, space: asActionSpace(host) }
    withActiveRegistry(cards, () => {
      let step = engine.proceed(context)
      for (let index = 0; index < 20 && step.type !== 'choice'; index++) step = engine.proceed(context)
      expect(step.type).toBe('choice')
      expect(player.resources.food).toBe(2)
      expect(seen).toEqual([])
      for (let payment = 0; payment < 2; payment++) {
        engine.flushEventTransaction(context)
        engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
        const request = engine.peekPendingEnvelope()!.request
        if (request.kind !== 'choice') throw new Error('expected payment choice')
        const food = request.options.find((option) => (option.labelParams?.resourcesPaid as Record<string, number> | undefined)?.food === 1)!
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
    expect(seen.map((entry) => entry.phase)).toEqual(['immediatelyAfter', 'after'])
    for (const entry of seen) {
      expect(entry.resultType).toBe(kind === 'flow' ? 'flow' : 'ok')
      expect(entry.transaction).not.toContainEqual(historicalMoveEvent)
      expect(entry.transaction).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 1 } }))
      expect(entry.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 1 } }))
      expect(entry.transaction.filter((event) => event.type === 'resource.paid')).toHaveLength(2)
      expect(entry.transaction).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { clay: 7 } }))
      expect(entry.action).not.toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { clay: 7 } }))
      expect(entry.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 2 } }))
      expect(entry.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { wood: 2 } }))
      expect(entry.action?.filter((event) => event.type === 'resource.paid')).toHaveLength(2)
      expect(new Set(entry.transaction.map((event) => event.id)).size).toBe(entry.transaction.length)
      if (kind === 'flow') {
        expect(entry.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { wood: 1 } }))
        expect(entry.queried).toBe(true)
      }
    }
    expect(state.events.filter((event) => event.type === 'resource.paid')).toHaveLength(2)
  })
})

describe('returned flow continuation prefixes', () => {
  it.each((['direct', 'or', 'xor'] as const).flatMap((entry) => [false, true].map((requestFirst) => [entry, requestFirst] as const)))(
    'keeps the host prefix before a flow body (%s/request=%s)',
    (entry, requestFirst) => {
      const cardId = 'Test_ReturnedFlow'
      const state = freshState()
      const player = state.players[0]!
      player.minorPlayed = [cardId]
      const seen: Array<{ phase: string; transaction: GameEvent[]; action?: GameEvent[] }> = []
      const cards = new CardRegistry()
      cards.registerListener({
        id: `${cardId}:listener`,
        cardIds: [cardId],
        actions: ['return-flow-host'],
        phases: ['immediatelyAfter', 'after'],
        mandatory: true,
        handler: (ctx) => {
          seen.push({ phase: ctx.phase, transaction: [...ctx.transactionEvents], action: ctx.actionEvents ? [...ctx.actionEvents] : undefined })
          return undefined
        },
      })
      const body = { type: 'flow' as const, flow: { type: 'leaf' as const, actionId: 'gain', sourceCard: cardId, params: { clay: 1 } } }
      const host = action('return-flow-host', (context) => {
        context.player.resources.wood += 1
        context.eventSink.emit({ type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: player.id }, reason: 'gain' })
        return requestFirst
          ? { type: 'request', request: { kind: 'choice', options: [{ value: 'finish', labelKey: 'ui.interactionContinue' }] }, promptKey: 'ui.interactionContinue' }
          : body
      })
      host.resolveChoice = () => body
      const hostNode = new ActionNode('selected-host', host.id, cardId)
      const branch = entry === 'direct' ? hostNode : entry === 'or' ? new OrNode('branch', [hostNode]) : new XorNode('branch', [hostNode])
      const { engine } = makeEventTestEngine(
        [host, getActionDefinition('gain')!],
        new SequenceNode('root', [new ActionNode('prefix', 'gain', undefined, { stone: 2 }), branch]),
      )
      const context = { state, player, space: asActionSpace(host) }
      withActiveRegistry(cards, () => {
        let step = engine.proceed(context)
        for (let index = 0; index < 30 && step.type !== 'done'; index++) {
          expect(step.type).not.toBe('blocked')
          if (step.type === 'choice') {
            const request = engine.peekPendingEnvelope()!.request
            if (request.kind !== 'choice') throw new Error('expected host choice')
            // Pending re-emission commits too: exercise the path used when a
            // Session cursor is restored, without an explicit flush call.
            engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
            engine.proceed(context)
            engine.resolveChoice(
              request.options.some((option) => option.value === 'finish')
                ? 'finish'
                : request.options.some((option) => option.value === '__done__') ? '__done__' : request.options[0]!.value,
              context,
            )
          }
          step = engine.proceed(context)
        }
        expect(step.type).toBe('done')
      })
      expect(player.resources).toMatchObject({ wood: 1, clay: 1, stone: 2 })
      expect(seen.map((item) => item.phase)).toEqual(['immediatelyAfter', 'after'])
      for (const item of seen) {
        expect(item.transaction).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { wood: 1 } }))
        expect(item.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { wood: 1 } }))
        // Composite selection commits the earlier transaction before this host starts.
        if (entry === 'direct') expect(item.transaction).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 2 } }))
        else expect(item.transaction).not.toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 2 } }))
        expect(item.action).not.toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { stone: 2 } }))
        expect(item.action).toContainEqual(expect.objectContaining({ type: 'resource.moved', resources: { clay: 1 } }))
        expect(new Set(item.transaction.map((event) => event.id)).size).toBe(item.transaction.length)
      }
    },
  )
})
