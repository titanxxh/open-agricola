import { beforeEach, describe, it, expect } from 'vitest'
import { CardRegistry } from '../../../cards/registry'
import { setActiveCardRegistry } from '../../../cards/active-registry'
import { EngineTree } from '../../tree'
import { ActionNode } from '../action-node'
import { ParallelNode } from '../parallel-node'
import {
  evaluateTriggerSelect,
  isPureResourceFlowCurrentlyPayable,
} from '../../trigger-select'
import {
  ACTIVATE_CARD_ACTION_ID,
  type ActivateCardActionNode,
  type ActivateCardActionParams,
} from '../../activation-action'
import type { EngineContext } from '../../types'
import type { ActionExecutionContext, GameState, PlayerState, Resource } from '../../../contract/types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

const baseResources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  ...overrides,
})

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: baseResources(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {} as PlayerState['stats'],
  ...overrides,
})

const makeContext = (player = makePlayer()): ActionExecutionContext => ({
  state: { players: [player], currentPlayerIndex: 0 } as unknown as GameState,
  player,
  space: {} as ActionExecutionContext['space'],
})

const makeActivate = (
  id: string,
  cardId: string,
  mandatory = true,
  paramOverrides: Partial<ActivateCardActionParams> = {},
): ActivateCardActionNode => {
  const params: ActivateCardActionParams = {
    listenerId: `listener-${id}`,
    cardId,
    phase: 'after',
    actionId: 'place-farmer',
    event: {},
    mandatory,
    ...paramOverrides,
  }
  return new ActionNode(id, ACTIVATE_CARD_ACTION_ID, cardId, params) as ActivateCardActionNode
}

const makeTriggerSelect = (
  children: ActivateCardActionNode[],
  ownerPlayerId = 'p1',
): ParallelNode => {
  const node = new ParallelNode('ptn1', children)
  node.mode = 'trigger-select'
  node.triggerOwnerPlayerId = ownerPlayerId
  node.ownerPlayerId = ownerPlayerId
  node.triggerChildren = children.map((child) => ({
    nodeId: child.id,
    cardId: child.params.cardId,
    listenerId: child.params.listenerId,
    mandatory: child.params.mandatory === true,
  }))
  return node
}

describe('ParallelNode trigger-select mode', () => {
  beforeEach(() => {
    setActiveCardRegistry(new CardRegistry())
  })

  it('emits select-trigger with one option per unresolved trigger child', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', false),
      makeActivate('b', 'C2', false),
    ])

    const result = node.step(stubCtx)

    expect(result).toEqual({
      kind: 'request',
      request: {
        kind: 'select-trigger',
        ownerPlayerId: 'p1',
        options: [
          { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
          { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
          { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
        ],
      },
    })
  })

  it('selecting a child records selectedChildId', () => {
    const a = makeActivate('a', 'C1')
    const node = makeTriggerSelect([a, makeActivate('b', 'C2')])

    expect(node.chooseCard('C1')).toBe(a)
    expect(node.selectedChildId).toBe('a')
  })

  it('keeps a selected non-card trigger child active for one-shot prompts', () => {
    const child = new ActionNode(
      'extra-a',
      'activate-extra-turn',
      'A092_AdoptiveParents',
      { cardId: 'A092_AdoptiveParents' },
    )
    const node = new ParallelNode('ptn-extra', [child])
    node.mode = 'trigger-select'
    node.resolveAfterSelection = true
    node.triggerOwnerPlayerId = 'p1'
    node.ownerPlayerId = 'p1'
    node.triggerChildren = [{
      nodeId: child.id,
      cardId: 'A092_AdoptiveParents',
      listenerId: '',
      mandatory: true,
    }]

    expect(node.chooseCard('A092_AdoptiveParents')).toBe(child)

    expect(node.step(stubCtx)).toEqual({ kind: 'continue' })
    expect(child.getState()).not.toBe('resolved')
    expect(node.getState()).not.toBe('resolved')
  })

  it('follow-up inserted after selected child runs before next trigger prompt', () => {
    const a = makeActivate('a', 'C1')
    const b = makeActivate('b', 'C2')
    const followUp = new ActionNode('follow-up', 'gain-wood')
    const node = makeTriggerSelect([a, b])
    const tree = new EngineTree(node)

    node.chooseCard('C1')
    tree.insertAfter('a', [followUp])
    a.setState('resolved')

    expect(tree.nextUnresolved()).toBe(followUp)
  })

  it('hides pass while an unresolved mandatory child remains', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', true),
      makeActivate('b', 'C2', false),
    ])

    expect(node.buildSelectOptions()).toEqual([
      { value: 'C1', labelKey: 'cards.C1.name', sourceCard: 'C1' },
      { value: 'C2', labelKey: 'cards.C2.name', sourceCard: 'C2' },
    ])
  })

  it('pass resolves optional unresolved children and the host', () => {
    const a = makeActivate('a', 'C1', false)
    const b = makeActivate('b', 'C2', false)
    const node = makeTriggerSelect([a, b])

    node.passAll()

    expect(node.getState()).toBe('resolved')
    expect(a.getState()).toBe('resolved')
    expect(b.getState()).toBe('resolved')
  })

  it('persists trigger-select metadata in cursor data', () => {
    const node = makeTriggerSelect([
      makeActivate('a', 'C1', false),
      makeActivate('b', 'C2', true),
    ])

    node.chooseCard('C1')
    const cursor = node.toCursor()

    expect(cursor.type).toBe('parallel')
    expect(cursor.data).toMatchObject({
      childrenIds: ['a', 'b'],
      mode: 'trigger-select',
      selectedChildId: 'a',
      triggerOwnerPlayerId: 'p1',
      triggerChildren: [
        { nodeId: 'a', cardId: 'C1', listenerId: 'listener-a', mandatory: false },
        { nodeId: 'b', cardId: 'C2', listenerId: 'listener-b', mandatory: true },
      ],
    })
  })

  it('disabled trigger option remains visible', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['C1'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'pay', params: { cost: { wood: 1 } } },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const node = makeTriggerSelect([makeActivate('a', 'C1', false)])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(evaluation.options).toEqual([
      {
        value: 'C1',
        labelKey: 'cards.C1.name',
        sourceCard: 'C1',
        disabled: true,
        disabledReasonKey: 'ui.interactionTriggerUnavailable',
      },
      { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
    ])
  })

  it('no-op mandatory trigger evaluates without a pass-only option list', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['C1'],
      mandatory: true,
      handler: () => undefined,
    })
    setActiveCardRegistry(cardRegistry)
    const child = makeActivate('a', 'C1', true)
    const node = makeTriggerSelect([child])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(child.getState()).not.toBe('resolved')
    expect(evaluation.options).toEqual([])
  })

  it('keeps mutation-only listener triggers selectable', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['MutationOnlyCard'],
      handler: (context) => {
        const effectPlayer = context.effectPlayer ?? context.player
        effectPlayer.cardStates.MutationOnlyCard = { ready: true }
      },
    })
    setActiveCardRegistry(cardRegistry)
    const player = makePlayer({
      minorPlayed: ['MutationOnlyCard'],
    })
    const node = makeTriggerSelect([makeActivate('a', 'MutationOnlyCard', false)])

    const evaluation = evaluateTriggerSelect(node, makeContext(player))

    expect(player.cardStates).toEqual({})
    expect(evaluation.options).toEqual([
      {
        value: 'MutationOnlyCard',
        labelKey: 'cards.MutationOnlyCard.name',
        sourceCard: 'MutationOnlyCard',
      },
      {
        value: '__pass__',
        labelKey: 'ui.interactionSelectTriggerPass',
        disabled: true,
      },
    ])
  })

  it('before-action pass is disabled while an enabled trigger can unlock continuation', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['TestClayBeforeBake'],
      actions: ['bake-bread'],
      phases: ['before'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const player = makePlayer({
      resources: baseResources({ grain: 0 }),
      improvements: ['Major_Fireplace1'],
    })
    const child = makeActivate('a', 'TestClayBeforeBake', false, {
      phase: 'before',
      actionId: 'bake-bread',
    })
    const node = makeTriggerSelect([child])

    const evaluation = evaluateTriggerSelect(node, makeContext(player), {
      canContinueWithoutTriggers: () => false,
      canReachContinuationThroughTriggers: () => true,
    })

    expect(evaluation.options).toEqual([
      {
        value: 'TestClayBeforeBake',
        labelKey: 'cards.TestClayBeforeBake.name',
        sourceCard: 'TestClayBeforeBake',
      },
      {
        value: '__pass__',
        labelKey: 'ui.interactionSelectTriggerPass',
        disabled: true,
      },
    ])
  })

  it('before-action pass stays enabled when enabled trigger cannot unlock continuation', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['TestWoodBeforeBake'],
      actions: ['bake-bread'],
      phases: ['before'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const player = makePlayer({
      resources: baseResources({ grain: 0 }),
      improvements: ['Major_Fireplace1'],
    })
    const child = makeActivate('a', 'TestWoodBeforeBake', false, {
      phase: 'before',
      actionId: 'bake-bread',
    })
    const node = makeTriggerSelect([child])

    const evaluation = evaluateTriggerSelect(node, makeContext(player), {
      canContinueWithoutTriggers: () => false,
      canReachContinuationThroughTriggers: () => false,
    })

    expect(evaluation.options).toEqual([
      {
        value: 'TestWoodBeforeBake',
        labelKey: 'cards.TestWoodBeforeBake.name',
        sourceCard: 'TestWoodBeforeBake',
      },
      { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
    ])
  })

  it('disabled-only trigger-select keeps pass enabled', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['D066_PotterCeramics'],
      actions: ['bake-bread'],
      phases: ['before'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'pay', params: { cost: { clay: 1 } } },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const player = makePlayer({
      resources: baseResources({ grain: 0, clay: 0 }),
      improvements: ['Major_Fireplace1'],
    })
    const child = makeActivate('a', 'D066_PotterCeramics', false, {
      phase: 'before',
      actionId: 'bake-bread',
    })
    const node = makeTriggerSelect([child])

    const evaluation = evaluateTriggerSelect(node, makeContext(player), {
      canContinueWithoutTriggers: () => false,
    })

    expect(evaluation.options).toEqual([
      {
        value: 'D066_PotterCeramics',
        labelKey: 'cards.D066_PotterCeramics.name',
        sourceCard: 'D066_PotterCeramics',
        disabled: true,
        disabledReasonKey: 'ui.interactionTriggerUnavailable',
      },
      { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
    ])
  })

  it('disables pass for an enabled non-optional trigger flow even without explicit mandatory metadata', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['CleanupCard'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const node = makeTriggerSelect([makeActivate('a', 'CleanupCard', false)])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(evaluation.options).toEqual([
      {
        value: 'CleanupCard',
        labelKey: 'cards.CleanupCard.name',
        sourceCard: 'CleanupCard',
      },
      {
        value: '__pass__',
        labelKey: 'ui.interactionSelectTriggerPass',
        disabled: true,
      },
    ])
  })

  it('keeps pass enabled for an enabled optional trigger flow', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['OptionalCard'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, optional: true },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const node = makeTriggerSelect([makeActivate('a', 'OptionalCard', false)])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(evaluation.options).toEqual([
      {
        value: 'OptionalCard',
        labelKey: 'cards.OptionalCard.name',
        sourceCard: 'OptionalCard',
      },
      { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
    ])
  })

  it('keeps non-resource continuation flows selectable', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['NonResourceFlowCard'],
      handler: () => ({
        flow: { type: 'leaf', actionId: 'custom-follow-up' },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const node = makeTriggerSelect([makeActivate('a', 'NonResourceFlowCard', false)])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(evaluation.options).toEqual([
      {
        value: 'NonResourceFlowCard',
        labelKey: 'cards.NonResourceFlowCard.name',
        sourceCard: 'NonResourceFlowCard',
      },
      {
        value: '__pass__',
        labelKey: 'ui.interactionSelectTriggerPass',
        disabled: true,
      },
    ])
  })

  it('applicable mandatory trigger with optional child remains enabled', () => {
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'listener-a',
      cardIds: ['C126_Excavator'],
      mandatory: true,
      handler: () => ({
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
            {
              type: 'seq',
              optional: true,
              children: [
                { type: 'leaf', actionId: 'pay', params: { cost: { wood: 2 } } },
                { type: 'leaf', actionId: 'gain', params: { food: 1 } },
              ],
            },
          ],
        },
      }),
    })
    setActiveCardRegistry(cardRegistry)
    const node = makeTriggerSelect([makeActivate('a', 'C126_Excavator', true)])

    const evaluation = evaluateTriggerSelect(node, makeContext())

    expect(evaluation.options).toEqual([
      {
        value: 'C126_Excavator',
        labelKey: 'cards.C126_Excavator.name',
        sourceCard: 'C126_Excavator',
      },
      {
        value: '__pass__',
        labelKey: 'ui.interactionSelectTriggerPass',
        disabled: true,
      },
    ])
  })
})

describe('isPureResourceFlowCurrentlyPayable', () => {
  it('traverses parallel pure gain and pay children', () => {
    expect(isPureResourceFlowCurrentlyPayable(
      {
        type: 'parallel',
        children: [
          { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
          { type: 'leaf', actionId: 'pay', params: { cost: { wood: 1 } } },
        ],
      },
      baseResources(),
    )).toBe(true)
  })

  it('treats or and xor flows as non-payable previews', () => {
    expect(isPureResourceFlowCurrentlyPayable(
      {
        type: 'or',
        children: [{ type: 'leaf', actionId: 'gain', params: { wood: 1 } }],
      },
      baseResources(),
    )).toBe(false)
    expect(isPureResourceFlowCurrentlyPayable(
      {
        type: 'xor',
        children: [{ type: 'leaf', actionId: 'gain', params: { wood: 1 } }],
      },
      baseResources(),
    )).toBe(false)
  })

  it('treats unknown leaf actions as non-payable previews', () => {
    expect(isPureResourceFlowCurrentlyPayable(
      { type: 'leaf', actionId: 'unknown-action' },
      baseResources(),
    )).toBe(false)
  })

  it('checks optional pay flows instead of treating optional as free', () => {
    expect(isPureResourceFlowCurrentlyPayable(
      {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 } },
          { type: 'leaf', actionId: 'gain', params: { grain: 1 } },
        ],
      },
      baseResources({ clay: 0 }),
    )).toBe(false)
  })

  it('checks supply-token costs when availability is provided', () => {
    const flow = {
      type: 'seq' as const,
      children: [
        { type: 'leaf' as const, actionId: 'pay', params: { wood: 1, fence: 1 } },
        { type: 'leaf' as const, actionId: 'gain', params: { food: 2 } },
      ],
    }
    expect(isPureResourceFlowCurrentlyPayable(
      flow,
      baseResources({ wood: 1 }),
      { supplyTokens: { fence: 0 } },
    )).toBe(false)
    expect(isPureResourceFlowCurrentlyPayable(
      flow,
      baseResources({ wood: 1 }),
      { supplyTokens: { fence: 1 } },
    )).toBe(true)
  })
})
