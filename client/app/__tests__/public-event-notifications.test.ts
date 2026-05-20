import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'
import type { PrivateGameEvent } from '../../../shared/contract/protocol/game'
import { collectPrivateEventNotifications } from '../private-event-notifications'
import {
  buildEventNotificationStackItems,
  collectNewPublicEventNotifications,
  collectPublicEventNotifications,
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
})
