import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import * as publicEventPresentation from '../public-event-presentation'
import { collectPublicEventFeedback } from '../public-event-presentation'

const base = {
  schemaVersion: 1,
  id: 'evt',
  seq: 1,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
} as const

describe('public event presentation', () => {
  it('keeps detailed cue collectors behind the public feedback entrypoint', () => {
    expect(Object.keys(publicEventPresentation).sort()).toEqual([
      'collectNewPublicEventFeedback',
      'collectPublicEventFeedback',
      'emptyPublicEventHighlightTargets',
      'maxPublicEventSeq',
    ])
  })

  it('projects all live and replay feedback surfaces through one namespaced batch', () => {
    const paid = {
      ...base,
      type: 'resource.paid',
      resources: { wood: 1 },
      paymentFor: 'bonus',
      sourceActionId: 'forest',
    } satisfies GameEvent
    const passed = {
      ...base,
      id: 'evt-pass',
      seq: 2,
      type: 'card.passed',
      fromPlayerId: 'p1',
      toPlayerId: 'p2',
      cardId: 'A004_Passed',
    } satisfies GameEvent

    const feedback = collectPublicEventFeedback([paid, passed], 'en', 'replay:event:1:0')

    expect(feedback.notifications).toEqual([
      expect.objectContaining({ id: 'replay:event:1:0:evt', kind: 'payment' }),
    ])
    expect(feedback.highlights.actionIds).toEqual(['forest'])
    expect(feedback.resourceAnimations).toEqual([
      expect.objectContaining({ id: 'replay:event:1:0:evt:payment:0', resources: { wood: 1 } }),
    ])
    expect(feedback.cardPassAnimations).toEqual([
      expect.objectContaining({
        id: 'replay:event:1:0:evt-pass:card-pass:0',
        eventId: 'evt-pass',
        cardId: 'A004_Passed',
      }),
    ])
  })
})
