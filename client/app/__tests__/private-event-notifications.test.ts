import { describe, expect, it } from 'vitest'
import type { PrivateGameEvent } from '../../../shared/contract/protocol/game'
import {
  collectPrivateEventNotifications,
  privateEventSignature,
} from '../private-event-notifications'

describe('private event notifications', () => {
  it('maps hand change events to count-only notifications', () => {
    const events: PrivateGameEvent[] = [{
      schemaVersion: 1,
      type: 'private.handChanged',
      recipientPlayerId: 'p1',
      cardIds: ['A1', 'B2'],
      cardType: 'mixed',
      reason: 'draft-finalized',
    }]

    expect(collectPrivateEventNotifications(events, 'zh')).toEqual([
      expect.objectContaining({
        kind: 'hand',
        message: expect.stringContaining('2'),
      }),
    ])
  })

  it('dedupes repeated private events only within the current batch', () => {
    const event: PrivateGameEvent = {
      schemaVersion: 1,
      type: 'private.promptShown',
      recipientPlayerId: 'p1',
      promptKind: 'resource-batch-exchange-select',
      sourceCard: 'E78_SleightofHand',
      promptKey: 'ui.interactionSleightOfHand',
    }

    expect(collectPrivateEventNotifications([event, event], 'en')).toHaveLength(1)
    expect(collectPrivateEventNotifications([event], 'en', 'batch-1')).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^batch-1:/) }),
    ])
    expect(collectPrivateEventNotifications([event], 'en', 'batch-2')).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^batch-2:/) }),
    ])
  })

  it('keeps hand signatures independent from card ids while preserving count/source', () => {
    const left: PrivateGameEvent = {
      schemaVersion: 1,
      type: 'private.handChanged',
      recipientPlayerId: 'p1',
      cardIds: ['A1', 'B2'],
      cardType: 'mixed',
      reason: 'card-effect',
      sourceCard: 'C1_Test',
    }
    const right: PrivateGameEvent = {
      ...left,
      cardIds: ['X1', 'Y2'],
    }

    expect(privateEventSignature(left)).toBe(privateEventSignature(right))
  })

  it('does not persist dedupe state across payloads', () => {
    const event: PrivateGameEvent = {
      schemaVersion: 1,
      type: 'private.promptShown',
      recipientPlayerId: 'p1',
      promptKind: 'resource-batch-exchange-select',
    }

    expect(collectPrivateEventNotifications([event], 'en')).toHaveLength(1)
    expect(collectPrivateEventNotifications([event], 'en')).toHaveLength(1)
  })
})
