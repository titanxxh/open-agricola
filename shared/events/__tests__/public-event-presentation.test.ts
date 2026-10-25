import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import { registerLanguagePack } from '../../i18n'
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
  it('uses a third language package for public notifications and accumulation targets', () => {
    registerLanguagePack({ version: 1, locale: 'fr-public-events', messages: {
      'resources.wood': 'bois',
      'resources.clay': 'argile',
      'ui.publicEvents.resourceSeparator': ' et ',
      'ui.publicEvents.resourcesPaid': 'Ressources payées : {paid}',
      'ui.publicEvents.roundTarget': 'manche {round}',
      'ui.publicEvents.resourceAccumulated': 'Ressources accumulées : {target} + {resources}',
    } })
    const events = [
      { ...base, type: 'resource.paid', resources: { wood: 1, clay: 2 }, paymentFor: 'bonus' },
      { ...base, id: 'evt-accumulated', seq: 2, type: 'resource.accumulated', resources: { wood: 2 }, to: { kind: 'roundCard', round: 3 } },
    ] satisfies GameEvent[]

    expect(collectPublicEventFeedback(events, 'fr-public-events').notifications).toEqual([
      { id: 'evt', kind: 'payment', message: 'Ressources payées : 1 bois et 2 argile' },
      { id: 'evt-accumulated', kind: 'resource', message: 'Ressources accumulées : manche 3 + 2 bois' },
    ])
  })

  it('keeps detailed cue collectors behind the public feedback entrypoint', () => {
    expect(Object.keys(publicEventPresentation).sort()).toEqual([
      'collectNewPublicEventFeedback',
      'collectPublicEventFeedback',
      'collectUnseenPublicEventFeedback',
      'emptyPublicEventHighlightTargets',
      'maxPublicEventSeq',
      'publicEventOccurrenceCursorFor',
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
