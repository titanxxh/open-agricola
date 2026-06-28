import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'
import type { PrivateGameEvent } from '../../../shared/contract/protocol/game'
import { publicEventMappingPolicy } from '../../../shared/events/event-mapping-policy'
import { collectPrivateEventNotifications } from '../private-event-notifications'
import {
  buildEventNotificationStackItems,
  collectNewPublicEventFeedback,
  collectNewPublicEventNotifications,
  collectPublicEventHighlightTargets,
  collectPublicEventNotifications,
  collectPublicEventResourceAnimations,
  maxPublicEventSeq,
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

type ClientConsumerSurface = 'notification' | 'highlight' | 'resourceAnimation'
type ClientConsumerFixtures = {
  mapped?: GameEvent
  silent?: GameEvent
}
type ClientFixtureMatrix = Partial<Record<GameEvent['type'], Partial<Record<ClientConsumerSurface, ClientConsumerFixtures>>>>

const clientFixtureMatrix = {
  'resource.moved': {
    highlight: {
      mapped: { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' },
      silent: { ...base, id: 'resource-moved-no-action', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' },
      silent: { ...base, id: 'resource-moved-card-animation', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'card', cardId: 'A001_Test' }, to: { kind: 'card', cardId: 'A002_Test' }, reason: 'cardEffect' },
    },
  },
  'resource.exchanged': {
    highlight: {
      mapped: { ...base, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'actionSpace', spaceId: 'grain-utilization' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
      silent: { ...base, id: 'exchange-no-action', seq: 2, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'player', playerId: 'p1' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'player', playerId: 'p1' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
      silent: { ...base, id: 'exchange-card-endpoints', seq: 2, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'card', cardId: 'A001_Test' }, paidTo: { kind: 'card', cardId: 'A002_Test' }, gainedFrom: { kind: 'card', cardId: 'A003_Test' }, gainedTo: { kind: 'roundCard', round: 3 } },
    },
  },
  'resource.accumulated': {
    notification: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-silent', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' }, silent: true },
    },
    highlight: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-card-highlight', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'card', cardId: 'B048_ForestStone' } },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-card-animation', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'card', cardId: 'B048_ForestStone' } },
    },
  },
  'resource.paid': {
    notification: {
      mapped: { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-empty-notification', seq: 2, type: 'resource.paid', resources: {}, paymentFor: 'bonus', bonusSources: ['A001_Test'] },
    },
    highlight: {
      mapped: { ...base, type: 'resource.paid', sourceActionId: 'construct', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-no-action', seq: 2, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-no-actor', seq: 2, actorPlayerId: undefined, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' },
    },
  },
  'action.accumulated': {
    notification: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-notification', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
    highlight: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-highlight', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-animation', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
  },
  'farm.sown': {
    highlight: {
      mapped: { ...base, type: 'farm.sown', sows: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', added: 2 }] },
      silent: { ...base, id: 'sown-card', seq: 2, type: 'farm.sown', sows: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', added: 2 }] },
    },
  },
  'farm.fieldPlowed': {
    highlight: {
      mapped: { ...base, type: 'farm.fieldPlowed', fields: [{ playerId: 'p1', row: 1, col: 1 }] },
      silent: { ...base, id: 'plowed-empty', seq: 2, type: 'farm.fieldPlowed', fields: [] },
    },
  },
  'farm.roomBuilt': {
    highlight: {
      mapped: { ...base, type: 'farm.roomBuilt', rooms: [{ playerId: 'p1', row: 1, col: 1, type: 'wood' }] },
      silent: { ...base, id: 'room-empty', seq: 2, type: 'farm.roomBuilt', rooms: [] },
    },
  },
  'farm.renovated': {
    highlight: {
      mapped: { ...base, type: 'farm.renovated', playerId: 'p1', from: 'wood', to: 'clay', rooms: [{ row: 1, col: 1 }] },
      silent: { ...base, id: 'renovated-empty', seq: 2, type: 'farm.renovated', playerId: 'p1', from: 'wood', to: 'clay', rooms: [] },
    },
  },
  'farm.stableBuilt': {
    highlight: {
      mapped: { ...base, type: 'farm.stableBuilt', stables: [{ playerId: 'p1', row: 1, col: 1 }] },
      silent: { ...base, id: 'stable-empty', seq: 2, type: 'farm.stableBuilt', stables: [] },
    },
  },
  'farm.fenceBuilt': {
    highlight: {
      mapped: { ...base, type: 'farm.fenceBuilt', fences: [], newFenceEdges: ['h-0-0'] },
      silent: { ...base, id: 'fence-no-owner', seq: 2, actorPlayerId: undefined, type: 'farm.fenceBuilt', fences: [], newFenceEdges: ['h-0-0'] },
    },
  },
  'farm.cropAdded': {
    highlight: {
      mapped: { ...base, type: 'farm.cropAdded', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
      silent: { ...base, id: 'crop-added-card', seq: 2, type: 'farm.cropAdded', crops: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
    },
  },
  'farm.cropRemoved': {
    highlight: {
      mapped: { ...base, type: 'farm.cropRemoved', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'harvest' },
      silent: { ...base, id: 'crop-removed-card', seq: 2, type: 'farm.cropRemoved', crops: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
    },
  },
  'card.stackChanged': {
    notification: {
      mapped: { ...base, type: 'card.stackChanged', cardId: 'C081_MaterialHub', targetPlayerId: 'p1', resources: { wood: 2 }, delta: 2, reason: 'store' },
      silent: { ...base, id: 'stack-empty', seq: 2, type: 'card.stackChanged', cardId: 'C081_MaterialHub', targetPlayerId: 'p1', resources: {}, reason: 'store' },
    },
  },
} satisfies ClientFixtureMatrix

const clientSurfaceHasOutput = (surface: ClientConsumerSurface, event: GameEvent): boolean => {
  if (surface === 'notification') return collectPublicEventNotifications([event], 'en').length > 0
  if (surface === 'highlight') {
    const highlights = collectPublicEventHighlightTargets([event])
    return highlights.actionIds.length + highlights.farmTiles.length + highlights.fenceEdges.length > 0
  }
  return collectPublicEventResourceAnimations([event]).length > 0
}

describe('public event notifications', () => {
  it('returns the maximum public event sequence', () => {
    expect(maxPublicEventSeq()).toBe(0)
    expect(maxPublicEventSeq([])).toBe(0)
    expect(maxPublicEventSeq([{ seq: 2 }, { seq: 8 }, { seq: 5 }])).toBe(8)
  })

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

  it('maps selected card, future, and worker events to public notifications', () => {
    const events: GameEvent[] = [
      { ...base, type: 'card.infoboxChanged', cardId: 'B021_HayloftBarn', text: '+2 food', targetPlayerId: 'p1' },
      { ...base, id: 'evt-2', seq: 2, type: 'card.stackChanged', cardId: 'C081_MaterialHub', targetPlayerId: 'p1', resources: { wood: 2 }, delta: 2, reason: 'store' },
      { ...base, id: 'evt-3', seq: 3, type: 'card.swappedWithBoard', playerId: 'p1', fromPlayerCardId: 'A001_Test', toPlayerCardId: 'A002_Test' },
      { ...base, id: 'evt-4', seq: 4, type: 'card.returnedToBoard', playerId: 'p1', cardId: 'A002_Test' },
      { ...base, id: 'evt-5', seq: 5, type: 'futureMeeple.removed', playerId: 'p1', cardId: 'B157_Salter', rounds: [3] },
      { ...base, id: 'evt-6', seq: 6, type: 'futureMeeple.resolved', playerId: 'p1', cardId: 'B157_Salter', round: 3, resources: { food: 2 } },
      { ...base, id: 'evt-7', seq: 7, type: 'worker.promoted', playerId: 'p1', workerId: 'w1', from: 'newborn', to: 'adult' },
    ]

    const notifications = collectPublicEventNotifications(events, 'zh')

    expect(notifications).toHaveLength(7)
    expect(notifications.map((n) => n.kind)).toEqual([
      'card',
      'card',
      'card',
      'card',
      'future',
      'future',
      'action',
    ])
    expect(notifications[0]?.message).toBe('卡牌标记：B021_HayloftBarn：+2 food')
  })

  it('keeps noisy lifecycle and low-level card state events notification-silent', () => {
    const events: GameEvent[] = [
      { ...base, type: 'card.stateChanged', cardId: 'A001_Test', key: 'used', value: true, targetPlayerId: 'p1' },
      { ...base, id: 'evt-2', seq: 2, type: 'work.started' },
      { ...base, id: 'evt-3', seq: 3, type: 'returnHome.started' },
      { ...base, id: 'evt-4', seq: 4, type: 'worker.returned', workers: [{ playerId: 'p1', workerId: 'w1' }], to: 'home' },
      { ...base, id: 'evt-5', seq: 5, type: 'farm.cropAdded', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
      { ...base, id: 'evt-6', seq: 6, type: 'farm.cropRemoved', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'harvest' },
      { ...base, id: 'evt-7', seq: 7, type: 'farm.animalMoved', animals: { sheep: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' } },
    ]

    expect(collectPublicEventNotifications(events, 'zh')).toEqual([])
  })

  it('keeps empty card stack changes notification-silent', () => {
    const event = {
      ...base,
      type: 'card.stackChanged',
      cardId: 'C081_MaterialHub',
      targetPlayerId: 'p1',
      resources: {},
      reason: 'store',
    } satisfies GameEvent

    expect(publicEventMappingPolicy['card.stackChanged'].notification.mode).toBe('conditional')
    expect(collectPublicEventNotifications([event], 'zh')).toEqual([])
  })

  it('keeps empty resource payment notifications silent', () => {
    const event = {
      ...base,
      type: 'resource.paid',
      resources: {},
      paymentFor: 'bonus',
      bonusSources: ['A001_Test'],
    } satisfies GameEvent

    expect(publicEventMappingPolicy['resource.paid'].notification.mode).toBe('conditional')
    expect(collectPublicEventNotifications([event], 'en')).toEqual([])
  })

  it('uses a minus sign for card stack take notifications', () => {
    const event = {
      ...base,
      type: 'card.stackChanged',
      cardId: 'C081_MaterialHub',
      targetPlayerId: 'p1',
      resources: { wood: 1 },
      delta: -1,
      reason: 'take',
    } satisfies GameEvent

    expect(collectPublicEventNotifications([event], 'en')).toEqual([
      expect.objectContaining({
        kind: 'card',
        message: expect.stringContaining(' - '),
      }),
    ])
  })

  it('dedupes repeated public events within a batch', () => {
    const event = { ...base, type: 'action.exclusiveUseSet', actionId: 'forest', playerId: 'p1', sourceCardId: 'B023_FinalScenario', untilRound: 4 } satisfies GameEvent

    expect(collectPublicEventNotifications([event, event], 'zh')).toHaveLength(1)
  })

  it('ignores unsupported public event types', () => {
    const event = { ...base, type: 'game.started' } satisfies GameEvent

    expect(collectPublicEventNotifications([event], 'zh')).toEqual([])
  })

  it('selects only new events after the cursor and resets silently when seq moves backward', () => {
    const oldEvent = { ...base, type: 'action.revealed', actionId: 'round-1', roundSlot: 1 } satisfies GameEvent
    const newEvent = { ...base, id: 'evt-2', seq: 2, type: 'action.exclusiveUseCleared', actionId: 'forest', playerId: 'p1', sourceCardId: 'B023_FinalScenario' } satisfies GameEvent

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

  it('does not highlight a farm tile for special stables', () => {
    const event = {
      ...base,
      type: 'farm.stableBuilt',
      stables: [
        {
          playerId: 'p1',
          row: 1,
          col: 1,
          kind: 'special',
          sourceCardId: 'B085_FarmHand',
        },
      ],
    } satisfies GameEvent

    expect(collectPublicEventHighlightTargets([event]).farmTiles).toEqual([])
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
      from: { kind: 'card', cardId: 'A001_Test' },
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

  it('does not replay canceled events after aligning the cursor to the snapshot max seq', () => {
    const canceledEvent = { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' } satisfies GameEvent
    const undoSnapshotEvents = [
      { ...base, id: 'evt-kept', seq: 2, type: 'game.started' },
    ] satisfies GameEvent[]

    expect(collectNewPublicEventFeedback([canceledEvent], 0, 'en').notifications).toHaveLength(1)
    expect(collectNewPublicEventFeedback(undoSnapshotEvents, maxPublicEventSeq(undoSnapshotEvents), 'en')).toEqual({
      notifications: [],
      highlights: { actionIds: [], farmTiles: [], fenceEdges: [] },
      resourceAnimations: [],
      nextCursor: 2,
    })
  })

  it('does not dedupe distinct events with identical endpoints and resources', () => {
    const first = { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' } satisfies GameEvent
    const second = { ...base, id: 'evt-2', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' } satisfies GameEvent

    expect(collectPublicEventResourceAnimations([first, second]).map((animation) => animation.id)).toEqual([
      'evt:move:0',
      'evt-2:move:0',
    ])
  })

  it('maps accumulation events to notifications, highlights, and animations', () => {
    const actionAccumulated = {
      ...base,
      type: 'action.accumulated',
      spaceId: 'forest',
      resources: { wood: 2 },
    } satisfies GameEvent
    const resourceSpace = {
      ...base,
      id: 'evt-2',
      seq: 2,
      type: 'resource.accumulated',
      resources: { food: 1 },
      to: { kind: 'actionSpace', spaceId: 'fishing' },
    } satisfies GameEvent
    const resourceCard = {
      ...base,
      id: 'evt-3',
      seq: 3,
      type: 'resource.accumulated',
      resources: { food: 2 },
      to: { kind: 'card', playerId: 'p1', cardId: 'B048_ForestStone' },
    } satisfies GameEvent

    expect(collectPublicEventNotifications([actionAccumulated, resourceSpace, resourceCard], 'en')).toEqual([
      expect.objectContaining({ id: 'evt', kind: 'resource', message: expect.stringContaining('forest') }),
      expect.objectContaining({ id: 'evt-2', kind: 'resource', message: expect.stringContaining('fishing') }),
      expect.objectContaining({ id: 'evt-3', kind: 'resource', message: expect.stringContaining('B048_ForestStone') }),
    ])
    expect(collectPublicEventHighlightTargets([actionAccumulated, resourceSpace, resourceCard]).actionIds).toEqual([
      'forest',
      'fishing',
    ])
    expect(collectPublicEventResourceAnimations([actionAccumulated, resourceSpace, resourceCard])).toEqual([
      expect.objectContaining({
        id: 'evt:accumulate:0',
        kind: 'move',
        resources: { wood: 2 },
        from: { kind: 'supply' },
        to: { kind: 'actionSpace', actionId: 'forest' },
      }),
      expect.objectContaining({
        id: 'evt-2:accumulate:0',
        kind: 'move',
        resources: { food: 1 },
        from: { kind: 'supply' },
        to: { kind: 'actionSpace', actionId: 'fishing' },
      }),
    ])
  })

  it('keeps silent action-space accumulation visual cues without notifications', () => {
    const silent = {
      ...base,
      type: 'resource.accumulated',
      resources: { reed: 1 },
      to: { kind: 'actionSpace', spaceId: 'reed-bank' },
      silent: true,
    } satisfies GameEvent

    expect(collectPublicEventNotifications([silent], 'en')).toEqual([])
    expect(collectPublicEventHighlightTargets([silent]).actionIds).toEqual(['reed-bank'])
    expect(collectPublicEventResourceAnimations([silent])).toEqual([
      expect.objectContaining({ id: 'evt:accumulate:0', resources: { reed: 1 } }),
    ])
  })

  it('does not notify, highlight, or animate empty accumulation resources', () => {
    const emptyAction = {
      ...base,
      type: 'action.accumulated',
      spaceId: 'forest',
      resources: { wood: 0 },
    } satisfies GameEvent
    const emptyResource = {
      ...base,
      id: 'evt-2',
      seq: 2,
      type: 'resource.accumulated',
      resources: {},
      to: { kind: 'actionSpace', spaceId: 'fishing' },
    } satisfies GameEvent

    expect(collectPublicEventNotifications([emptyAction, emptyResource], 'en')).toEqual([])
    expect(collectPublicEventHighlightTargets([emptyAction, emptyResource]).actionIds).toEqual([])
    expect(collectPublicEventResourceAnimations([emptyAction, emptyResource])).toEqual([])
  })

  it('has client fixture coverage for every conditional public cue surface', () => {
    for (const [type, policy] of Object.entries(publicEventMappingPolicy) as Array<[GameEvent['type'], typeof publicEventMappingPolicy[GameEvent['type']]]>) {
      for (const surface of ['notification', 'highlight', 'resourceAnimation'] as const) {
        if (policy[surface].mode !== 'conditional') continue
        const fixtures = clientFixtureMatrix[type]?.[surface]
        expect(fixtures?.mapped, `${type}.${surface}.mapped`).toBeTruthy()
        expect(fixtures?.silent, `${type}.${surface}.silent`).toBeTruthy()
      }
    }
  })

  it('keeps conditional client fixtures aligned with public cue collectors', () => {
    for (const [type, surfaces] of Object.entries(clientFixtureMatrix) as Array<[GameEvent['type'], Partial<Record<ClientConsumerSurface, ClientConsumerFixtures>>]>) {
      for (const [surface, fixtures] of Object.entries(surfaces) as Array<[ClientConsumerSurface, ClientConsumerFixtures]>) {
        if (fixtures.mapped) expect(clientSurfaceHasOutput(surface, fixtures.mapped), `${type}.${surface}.mapped`).toBe(true)
        if (fixtures.silent) expect(clientSurfaceHasOutput(surface, fixtures.silent), `${type}.${surface}.silent`).toBe(false)
      }
    }
  })
})
