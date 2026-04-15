import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C85_DenBuilder'

const anytimeListener: CardListenerRegistration = {
  id: 'C85-den-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.houseType === 'wood') return
    if (context.player.resources.grain < 1 || context.player.resources.food < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1, food: 2 } }),
          { type: 'leaf', actionId: 'build-farmhand-room', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C85_DenBuilder.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C85_DenBuilder = new Occupation({
  id: CARD_ID,
  name: 'Den Builder',
  deck: 'C',
  number: 85,
  category: 'FARM_PLANNER',
  desc: ['When you live in a clay or stone house, you can pay 1 <GRAIN> and 2 <FOOD>. If you do, for the rest of the game, this card provides room for exactly one person.'],
  cost: {},
  players: '1+',
  implemented: true,
})
