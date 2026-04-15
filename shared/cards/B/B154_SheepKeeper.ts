import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'

const CARD_ID = 'B154_SheepKeeper'

registerPrerequisite('Less Than 7 Sheep', (player) => player.resources.sheep < 7)

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
  desc: ['You can only play this card if you have less than 7 <SHEEP>. Once this game, when you have 7 <SHEEP> on your farm, you immediately get 3 bonus points and 2 <FOOD>.'],
  cost: {},
  players: '4+',
  prerequisite: 'Less Than 7 Sheep',
})
