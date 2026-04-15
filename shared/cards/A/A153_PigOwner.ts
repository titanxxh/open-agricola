import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'A153_PigOwner'

const anytimeListener: CardListenerRegistration = {
  id: 'A153-pig-owner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.boar < 5) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.A153_PigOwner.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const A153_PigOwner = new Occupation({
  id: CARD_ID,
  name: 'Pig Owner',
  deck: 'A',
  number: 153,
  category: 'POINTS_PROVIDER',
  desc: ['The first time you have 5 or more <PIG>, you get 3 bonus <SCORE>.'],
  cost: {},
  players: '4+',
})
