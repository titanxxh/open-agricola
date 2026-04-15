import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E165_MasterHuntsman'

/**
 * E165 Master Huntsman:
 * When you play this card and each time you build a major improvement, you get 1 pig.
 *
 * BGA: onBuy → gain 1 pig.
 *      isListeningTo → isActionEvent(Improvement) && cardId has type MAJOR.
 *      onPlayerAfterImprovement → gain 1 pig.
 *
 * Occupation onBuy flows must use a play-occupation listener (engine does not
 * process onBuy flows for occupations).
 */
const onBuyListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

const majorImprovementListener: CardListenerRegistration = {
  id: 'E165-master-huntsman-after-major',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const choice = context.choice
    if (!choice || !choice.startsWith('major:')) return
    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(onBuyListener)
registerCardListener(majorImprovementListener)

export const E165_MasterHuntsman = new Occupation({
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
})
