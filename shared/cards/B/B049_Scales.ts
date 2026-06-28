import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardPlayedEvent, DraftGameEvent } from '../../contract/events'
import { gainLeaf } from '../helpers/pay-gain-node'
import { countTriggerCardsAs } from '../helpers/trigger-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'B049_Scales'
/**
 * B49 Scales
 * Each time after you place an improvement or occupation in front of you,
 * if you then have the same number of improvements and occupations in play,
 * you get 2 food.
 *
 * BGA: countOccupations() == countAllImprovements()
 * Passing cards do not trigger this (they are never "in front of you").
 * We count occupationPlayed.length vs (minorPlayed.length + improvements.length).
 */

const hasPlayedCardForAction = (
  context: CardListenerContext,
  sourceActionId: 'occupation' | 'improvement',
  cardTypes: readonly string[],
) => {
  const events = context.actionEvents ?? context.transactionEvents
  type QueryableCardPlayedEvent = CardPlayedEvent | DraftGameEvent<'card.played'>
  const isCardPlayedEvent = (
    event: CardListenerContext['transactionEvents'][number],
  ): event is QueryableCardPlayedEvent =>
    event.type === 'card.played'
  return events.some((event) =>
    isCardPlayedEvent(event) &&
    event.sourceActionId === sourceActionId &&
    cardTypes.includes(event.cardType),
  )
}

const checkBalance = (context: CardListenerContext): ActionHookResult | void => {

  const occCount = countTriggerCardsAs(context, context.player, 'occupation')
  const impCount = countTriggerCardsAs(context, context.player, 'improvement')

  if (occCount === impCount) {
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  }
}

const occupationListener: CardListenerRegistration = {
  id: 'B49-scales-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasPlayedCardForAction(context, 'occupation', ['occupation'])) return
    return checkBalance(context)
  },
}

const improvementListener: CardListenerRegistration = {
  id: 'B49-scales-after-improvement',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!hasPlayedCardForAction(context, 'improvement', ['minor', 'major'])) return
    return checkBalance(context)
  },
}

const cardImpl = {
  listeners: [occupationListener, improvementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B049_Scales = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Scales',
    deck: 'B',
    number: 49,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time after you place an improvement or occupation in front of you, if you then have the same number of improvements and occupations in play, you get 2 <FOOD>.',
      ],
    cost: { wood: 1 },
    prerequisite: 'No Occupation',
    occupationPrerequisites: { max: 0 },
  },
  impl: cardImpl,
})

export const B049_Scales_impl = B049_Scales.impl
