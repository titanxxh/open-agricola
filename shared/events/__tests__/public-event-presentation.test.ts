import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import { cardText, registerLanguagePack, t } from '../../i18n'
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

  it('names cards and action spaces instead of showing their ids', () => {
    const events = [
      { ...base, id: 'evt-card', type: 'card.stackChanged', cardId: 'CFL061_BlacklegChicken', resources: { food: 1 }, delta: -1, reason: 'take' },
      { ...base, id: 'evt-future', seq: 2, type: 'futureMeeple.queued', playerId: 'p1', cardId: 'CWM073_DiamondMine', entries: [{ round: 5, resources: { stone: 1 } }] },
      { ...base, id: 'evt-space', seq: 3, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 3 } },
      { ...base, id: 'evt-on-card', seq: 4, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'card', cardId: 'CFL061_BlacklegChicken' } },
    ] satisfies GameEvent[]

    for (const locale of ['zh', 'en'] as const) {
      const messages = collectPublicEventFeedback(events, locale).notifications.map(notification => notification.message)
      const chicken = cardText(locale, 'CFL061_BlacklegChicken').name
      const mine = cardText(locale, 'CWM073_DiamondMine').name
      expect(messages).toEqual([
        t(locale, 'ui.publicEvents.cardResources', { card: chicken, sign: '-', resources: `1 ${t(locale, 'resources.food')}` }),
        t(locale, 'ui.publicEvents.futureWorkerQueued', { card: mine }),
        t(locale, 'ui.publicEvents.actionAccumulated', { action: t(locale, 'actions.forest.name'), resources: `3 ${t(locale, 'resources.wood')}` }),
        t(locale, 'ui.publicEvents.resourceAccumulated', { target: chicken, resources: `1 ${t(locale, 'resources.food')}` }),
      ])
      expect(messages.join('\n')).not.toMatch(/CFL061|CWM073|forest/)
      expect(chicken).not.toBe('CFL061_BlacklegChicken')
    }
    expect(collectPublicEventFeedback(events, 'zh').notifications[1]?.message).toBe('已放到回合格：钻石矿车')
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
