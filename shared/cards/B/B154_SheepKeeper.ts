import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B154_SheepKeeper'

const anytimeListener: CardListenerRegistration = {
  id: 'B154-sheep-keeper-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.sheep < 7) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: 2 }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B154_SheepKeeper.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const B154_SheepKeeper = new Occupation({
  id: CARD_ID,
  name: 'Sheep Keeper',
  deck: 'B',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: ['Once this game, when you have 7 or more <SHEEP>, you get 3 bonus <SCORE> and 2 <FOOD>.'],
  cost: {},
  players: '4+',
})
