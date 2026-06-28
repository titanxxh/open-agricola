import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isMajorCardId } from '../helpers/card-type'

const CARD_ID = 'E165_MasterHuntsman'
/**
 * E165 Master Huntsman:
 * When you play this card and each time you build a major improvement, you get 1 pig.
 *
 * BGA: onBuy → gain 1 pig.
 *      isListeningTo → isActionEvent(Improvement) && cardId has type MAJOR.
 *      onPlayerAfterImprovement → gain 1 pig.
 *
 * Occupation onBuy flows must use a occupation listener (engine does not
 * process onBuy flows for occupations).
 */
const onBuyListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

const majorImprovementListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-after-major',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const choice = context.choice
    const cardId = choice?.replace(/^major:/, '').replace(/^minor:/, '')
    if (!cardId || !isMajorCardId(cardId)) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [onBuyListener, majorImprovementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E165_MasterHuntsman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Huntsman',
    deck: 'E',
    number: 165,
    category: 'ANIMALS_-_WILD_BOAR',
    desc: [
        'When you play this card and each time you build a major improvement, you get 1 <PIG>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E165_MasterHuntsman_impl = E165_MasterHuntsman.impl
