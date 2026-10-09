import { describe, expect, it } from 'vitest'
import type { ActionDefinition, ActionExecutionResult } from '../../contract/types'
import type { CardListenerRegistration } from '../../cards/card-listeners'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { createInitialState } from '../../session/state-bootstrap'
import { getActionDefinition } from '../../actions'
import { ActionNode, OrNode, SequenceNode, XorNode } from '../nodes'
import { asActionSpace, makeEventTestEngine } from './event-test-helpers'
import { isPendingChoiceValueAllowed } from '../pending-validation'

const CARD = 'Test_Continuation_Card'

const action = (
  id: string,
  execute: ActionDefinition['execute'],
  resolveChoice?: ActionDefinition['resolveChoice'],
): ActionDefinition => ({
  id,
  nameKey: `test.${id}`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute,
  ...(resolveChoice ? { resolveChoice } : {}),
})

// A structured request that the Session also keeps pending and resolves
// through the engine. (An action's `animal-reorg` request is instead turned
// into a reorganize subflow by the Session; see the Session test.)
const quantityRequest = (): ActionExecutionResult => ({
  type: 'request',
  request: { kind: 'resource-quantity-select', cardId: CARD, availableByResource: { wood: 1 } },
  promptKey: 'ui.interactionContinue',
})

const setup = () => {
  const state = createInitialState(42, { playerCount: 2 })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  player.minorPlayed = [CARD]
  return { state, player }
}

const recordingListener = (
  id: string,
  actions: string[],
  phases: CardListenerRegistration['phases'],
  seen: Array<{ phase: string; choice?: string }>,
): CardListenerRegistration => ({
  id,
  cardIds: [CARD],
  actions,
  phases,
  mandatory: true,
  handler: (context) => {
    seen.push({ phase: context.phase, choice: context.choice })
    return undefined
  },
})

describe('resolveChoice continuations keep native requests pending', () => {
  it.each(['xor', 'or'] as const)('waits for a non-choice request from a selected %s branch', (kind) => {
    const { state, player } = setup()
    const submitted: string[] = []
    const quantity = action('continuation-quantity', quantityRequest, (_context, choice) => {
      submitted.push(choice)
      return { type: 'ok' }
    })
    const other = action('continuation-other', () => ({ type: 'ok' }))
    const branch = kind === 'xor'
      ? new XorNode('branch', [new ActionNode('quantity-node', quantity.id), new ActionNode('other-node', other.id)])
      : new OrNode('branch', [new ActionNode('quantity-node', quantity.id), new ActionNode('other-node', other.id)])
    const { engine } = makeEventTestEngine([quantity, other], new SequenceNode('root', [branch]))
    const context = { state, player, space: asActionSpace(quantity) }
    const seen: Array<{ phase: string; choice?: string }> = []
    const cards = new CardRegistry()
    cards.registerListener(recordingListener('continuation-quantity-after', [quantity.id], ['immediatelyAfter', 'after'], seen))

    withActiveRegistry(cards, () => {
      expect(engine.proceed(context).type).toBe('choice')
      engine.resolveChoice('quantity-node', context)

      expect(engine.peekPendingEnvelope()?.request.kind).toBe('resource-quantity-select')
      expect(seen).toEqual([])
      expect(submitted).toEqual([])

      engine.resolveChoice('confirm', context)
      let step = engine.proceed(context)
      for (let index = 0; index < 10 && step.type !== 'done'; index++) {
        if (step.type === 'choice' && kind === 'or') engine.resolveChoice('__done__', context)
        step = engine.proceed(context)
      }
      expect(step.type).toBe('done')
    })
    expect(submitted).toEqual(['confirm'])
    expect(seen.map((entry) => entry.phase)).toEqual(['immediatelyAfter', 'after'])
  })

  it('waits for a non-choice request returned after an earlier choice', () => {
    const { state, player } = setup()
    const submitted: string[] = []
    const host = action(
      'continuation-two-step',
      () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'continue', labelKey: 'ui.interactionContinue' }] },
        promptKey: 'ui.interactionContinue',
      }),
      (_context, choice) => {
        submitted.push(choice)
        return choice === 'continue' ? quantityRequest() : { type: 'ok' }
      },
    )
    const { engine } = makeEventTestEngine([host], new SequenceNode('root', [new ActionNode('host-node', host.id)]))
    const context = { state, player, space: asActionSpace(host) }
    const seen: Array<{ phase: string; choice?: string }> = []
    const cards = new CardRegistry()
    cards.registerListener(recordingListener('continuation-two-step-after', [host.id], ['immediatelyAfter', 'after'], seen))

    withActiveRegistry(cards, () => {
      expect(engine.proceed(context).type).toBe('choice')
      engine.resolveChoice('continue', context)

      expect(engine.peekPendingEnvelope()?.request.kind).toBe('resource-quantity-select')
      expect(seen).toEqual([])

      engine.resolveChoice('confirm', context)
      let step = engine.proceed(context)
      for (let index = 0; index < 10 && step.type !== 'done'; index++) step = engine.proceed(context)
      expect(step.type).toBe('done')
    })
    expect(submitted).toEqual(['continue', 'confirm'])
    expect(seen.map((entry) => entry.phase)).toEqual(['immediatelyAfter', 'after'])
  })

  it('accepts only offered select-trigger values from a selected branch', () => {
    const { state, player } = setup()
    const trigger = action('continuation-trigger', () => ({
      type: 'request',
      request: { kind: 'select-trigger', ownerPlayerId: player.id, options: [{ value: 'first', labelKey: 'ui.yes' }] },
      promptKey: 'ui.interactionContinue',
    }), () => ({ type: 'ok' }))
    const other = action('continuation-other', () => ({ type: 'ok' }))
    const { engine } = makeEventTestEngine([trigger, other], new SequenceNode('root', [
      new XorNode('branch', [new ActionNode('trigger-node', trigger.id), new ActionNode('other-node', other.id)]),
    ]))
    const context = { state, player, space: asActionSpace(trigger) }

    expect(engine.proceed(context).type).toBe('choice')
    engine.resolveChoice('trigger-node', context)

    // The Session validates submissions with this same predicate.
    const envelope = engine.peekPendingEnvelope()!
    expect(envelope.request.kind).toBe('select-trigger')
    expect(isPendingChoiceValueAllowed(envelope, 'first')).toBe(true)
    expect(isPendingChoiceValueAllowed(envelope, 'not-offered')).toBe(false)
  })
})

describe('selected OR/XOR branch choice', () => {
  it.each([
    { before: false, restore: false },
    { before: true, restore: false },
    { before: true, restore: true },
  ])('reaches completion reactions (before=$before, restore=$restore)', ({ before, restore }) => {
    const { state, player } = setup()
    const host = action('branch-host', () => ({ type: 'ok' }))
    const other = action('branch-other', () => ({ type: 'ok' }))
    const { engine } = makeEventTestEngine(
      [host, other, getActionDefinition('gain')!],
      new SequenceNode('root', [new XorNode('branch', [new ActionNode('host-node', host.id), new ActionNode('other-node', other.id)])]),
    )
    const context = { state, player, space: asActionSpace(host) }
    const seen: Array<{ phase: string; choice?: string }> = []
    const cards = new CardRegistry()
    cards.registerListener(recordingListener('branch-host-after', [host.id], ['immediatelyAfter', 'after'], seen))
    if (before) {
      cards.registerListener({
        id: 'branch-host-before',
        cardIds: [CARD],
        actions: [host.id],
        phases: ['before'],
        mandatory: true,
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', sourceCard: CARD, params: { wood: 1 } } }),
      })
    }

    withActiveRegistry(cards, () => {
      expect(engine.proceed(context).type).toBe('choice')
      engine.resolveChoice('host-node', context)
      if (restore) engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
      let step = engine.proceed(context)
      for (let index = 0; index < 10 && step.type !== 'done'; index++) {
        expect(step.type).not.toBe('choice')
        step = engine.proceed(context)
      }
      expect(step.type).toBe('done')
    })
    expect(player.resources.wood).toBe(before ? 1 : 0)
    expect(seen).toEqual([
      { phase: 'immediatelyAfter', choice: 'host-node' },
      { phase: 'after', choice: 'host-node' },
    ])
  })
})
