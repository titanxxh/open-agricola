import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'
import type { PrivateGameEvent } from '../../../shared/contract/protocol/game'
import { collectPrivateEventNotifications } from '../private-event-notifications'
import {
  buildEventNotificationStackItems,
  collectNewPublicEventFeedback,
  collectNewPublicEventNotifications,
  collectPublicEventHighlightTargets,
  collectPublicEventNotifications,
  collectPublicEventResourceAnimations,
} from '../public-event-notifications'

const base = {
  schemaVersion: 1,
  id: 'evt',
  seq: 1,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
} as const

describe('public event notifications', () => {
  it('maps resource and lifecycle events to transient cues', () => {
    const events: GameEvent[] = [
      { ...base, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 3 }, paidFrom: { kind: 'player', playerId: 'p1' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' }, exchangeSource: 'bake-bread' },
      { ...base, id: 'evt-2', seq: 2, type: 'resource.paid', resources: { wood: 2 }, paymentFor: 'major-improvement' },
      { ...base, id: 'evt-3', seq: 3, type: 'action.revealed', actionId: 'round-1', roundSlot: 1 },
      { ...base, id: 'evt-4', seq: 4, type: 'futureMeeple.queued', playerId: 'p1', cardId: 'B157_Salter', entries: [{ round: 2, resources: { food: 1 } }] },
      { ...base, id: 'evt-5', seq: 5, type: 'farm.fenceBuilt', fences: [{ type: 'fence' }] },
    ]

    expect(collectPublicEventNotifications(events, 'en').map((n) => n.kind)).toEqual([
      'resource',
      'payment',
      'action',
      'future',
      'farm',
    ])
  })

  it('dedupes repeated public events within a batch', () => {
    const event = { ...base, type: 'action.exclusiveUseSet', actionId: 'forest', playerId: 'p1', sourceCardId: 'B23_FinalScenario', untilRound: 4 } satisfies GameEvent

    expect(collectPublicEventNotifications([event, event], 'zh')).toHaveLength(1)
  })

  it('ignores unsupported public event types', () => {
    const event = { ...base, type: 'game.started' } satisfies GameEvent

    expect(collectPublicEventNotifications([event], 'zh')).toEqual([])
  })

  it('selects only new events after the cursor and resets silently when seq moves backward', () => {
    const oldEvent = { ...base, type: 'action.revealed', actionId: 'round-1', roundSlot: 1 } satisfies GameEvent
    const newEvent = { ...base, id: 'evt-2', seq: 2, type: 'action.exclusiveUseCleared', actionId: 'forest', playerId: 'p1', sourceCardId: 'B23_FinalScenario' } satisfies GameEvent

    expect(collectNewPublicEventNotifications([oldEvent], null, 'en')).toEqual({
      notifications: [],
      nextCursor: 1,
    })
    expect(collectNewPublicEventNotifications([oldEvent, newEvent], 1, 'en').notifications).toHaveLength(1)
    expect(collectNewPublicEventNotifications([oldEvent], 5, 'en')).toEqual({
      notifications: [],
      nextCursor: 1,
    })
  })

  it('keeps public and private notifications in separate batches for the same snapshot', () => {
    const publicEvent = { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' } satisfies GameEvent
    const privateEvent: PrivateGameEvent = {
      schemaVersion: 1,
      type: 'private.handChanged',
      recipientPlayerId: 'p1',
      cardIds: ['A116_WoodCutter'],
      cardType: 'occupation',
      reason: 'card-effect',
    }

    const publicBatch = collectNewPublicEventNotifications([publicEvent], 0, 'en', 'public-1').notifications
    const privateBatch = collectPrivateEventNotifications([privateEvent], 'en', 'private-1')

    expect(publicBatch).toEqual([expect.objectContaining({ id: expect.stringMatching(/^public-1:/), kind: 'payment' })])
    expect(privateBatch).toEqual([expect.objectContaining({ id: expect.stringMatching(/^private-1:/), kind: 'hand' })])
    expect(buildEventNotificationStackItems(privateBatch, publicBatch)).toEqual([
      expect.objectContaining({ className: 'private-event-notification', kind: 'hand' }),
      expect.objectContaining({ className: 'public-event-notification', kind: 'payment' }),
    ])
  })

  it('collects highlight targets independently from notifications', () => {
    const event = {
      ...base,
      type: 'worker.placed',
      workerId: 'w1',
      spaceId: 'forest',
    } satisfies GameEvent

    const feedback = collectNewPublicEventFeedback([event], 0, 'en')

    expect(feedback.notifications).toEqual([])
    expect(feedback.highlights.actionIds).toEqual(['forest'])
    expect(feedback.nextCursor).toBe(1)
  })

  it('maps public event fields to board and farm highlight targets', () => {
    const events: GameEvent[] = [
      { ...base, type: 'action.revealed', actionId: 'fencing', roundSlot: 1 },
      {
        ...base,
        id: 'evt-2',
        seq: 2,
        type: 'resource.exchanged',
        paid: { grain: 1 },
        gained: { food: 3 },
        paidFrom: { kind: 'actionSpace', spaceId: 'grain-utilization' },
        paidTo: { kind: 'supply' },
        gainedFrom: { kind: 'supply' },
        gainedTo: { kind: 'player', playerId: 'p1' },
      },
      {
        ...base,
        id: 'evt-3',
        seq: 3,
        type: 'resource.paid',
        resources: { wood: 1 },
        paymentFor: 'cardEffect',
        paymentSources: [{ from: { kind: 'actionSpace', spaceId: 'forest' }, resources: { wood: 1 } }],
      },
      { ...base, id: 'evt-4', seq: 4, type: 'farm.fieldPlowed', fields: [{ playerId: 'p1', row: 1, col: 2 }] },
      {
        ...base,
        id: 'evt-5',
        seq: 5,
        type: 'farm.sown',
        sows: [{ location: { kind: 'field', playerId: 'p1', row: 1, col: 2 }, crop: 'grain', added: 2 }],
      },
      { ...base, id: 'evt-6', seq: 6, type: 'farm.fenceBuilt', newFenceEdges: ['h-0-0'], fences: [], actorPlayerId: 'p1' },
    ]

    expect(collectPublicEventHighlightTargets(events)).toEqual({
      actionIds: ['fencing', 'grain-utilization', 'forest'],
      farmTiles: [
        { playerId: 'p1', key: '1-2' },
      ],
      fenceEdges: [
        { playerId: 'p1', edgeId: 'h-0-0' },
      ],
    })
  })

  it('does not guess farm owners for fence highlights', () => {
    const event = {
      ...base,
      actorPlayerId: undefined,
      type: 'farm.fenceBuilt',
      newFenceEdges: ['h-0-0'],
      fences: [],
    } satisfies GameEvent

    expect(collectPublicEventHighlightTargets([event]).fenceEdges).toEqual([])
  })

  it('maps resource.moved action-space to player resource animation', () => {
    const event = {
      ...base,
      type: 'resource.moved',
      resources: { wood: 3 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([event])).toEqual([
      expect.objectContaining({
        id: 'evt:move:0',
        kind: 'move',
        resources: { wood: 3 },
        from: { kind: 'actionSpace', actionId: 'forest' },
        to: { kind: 'playerResources', playerId: 'p1' },
      }),
    ])
  })

  it('maps resource.exchanged paid and gained sides as exchange animations', () => {
    const event = {
      ...base,
      type: 'resource.exchanged',
      paid: { grain: 1 },
      gained: { food: 3 },
      paidFrom: { kind: 'player', playerId: 'p1' },
      paidTo: { kind: 'supply' },
      gainedFrom: { kind: 'supply' },
      gainedTo: { kind: 'player', playerId: 'p1' },
    } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([event])).toEqual([
      expect.objectContaining({ id: 'evt:exchange-paid:0', kind: 'exchange', resources: { grain: 1 } }),
      expect.objectContaining({ id: 'evt:exchange-gained:0', kind: 'exchange', resources: { food: 3 } }),
    ])
  })

  it('maps resource.paid paymentSources and actor fallback to payment animations', () => {
    const withSources = {
      ...base,
      type: 'resource.paid',
      resources: { wood: 2 },
      paymentFor: 'major-improvement',
      to: { kind: 'supply' },
      paymentSources: [{ from: { kind: 'player', playerId: 'p1' }, resources: { wood: 2 } }],
    } satisfies GameEvent
    const actorFallback = {
      ...base,
      id: 'evt-2',
      seq: 2,
      type: 'resource.paid',
      resources: { clay: 1 },
      paymentFor: 'bonus',
    } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([withSources, actorFallback])).toEqual([
      expect.objectContaining({ id: 'evt:payment:0', kind: 'payment', resources: { wood: 2 } }),
      expect.objectContaining({
        id: 'evt-2:payment:0',
        kind: 'payment',
        resources: { clay: 1 },
        from: { kind: 'playerResources', playerId: 'p1' },
        to: { kind: 'supply' },
      }),
    ])
  })

  it('does not animate empty resources or unsupported locations', () => {
    const emptyMoved = {
      ...base,
      type: 'resource.moved',
      resources: { wood: 0 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    } satisfies GameEvent
    const cardMoved = {
      ...base,
      id: 'evt-2',
      seq: 2,
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'card', cardId: 'A1_Test' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'cardEffect',
    } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([emptyMoved, cardMoved])).toEqual([])
  })

  it('includes resource animations in the shared public event feedback cursor', () => {
    const oldEvent = { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' } satisfies GameEvent
    const newEvent = { ...base, id: 'evt-2', seq: 2, type: 'resource.moved', resources: { clay: 1 }, from: { kind: 'actionSpace', spaceId: 'clay-pit' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' } satisfies GameEvent

    expect(collectNewPublicEventFeedback([oldEvent], null, 'en').resourceAnimations).toEqual([])
    expect(collectNewPublicEventFeedback([oldEvent, newEvent], 1, 'en').resourceAnimations).toEqual([
      expect.objectContaining({ resources: { clay: 1 } }),
    ])
  })

  it('does not dedupe distinct events with identical endpoints and resources', () => {
    const first = { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' } satisfies GameEvent
    const second = { ...base, id: 'evt-2', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([first, second]).map((animation) => animation.id)).toEqual([
      'evt:move:0',
      'evt-2:move:0',
    ])
  })
})
