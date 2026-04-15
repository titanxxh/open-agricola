import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { getLooseStableKeys } from '../../actions/effects/animals'

const CARD_ID = 'C101_StallHolder'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
  },
})

const anytimeListener: CardListenerRegistration = {
  id: 'C101-stall-holder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 2) return
    const unfencedStables = getLooseStableKeys(context.player).length
    const foodGain = unfencedStables + 1
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 2 } }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: foodGain }),
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C101_StallHolder.anytime',
    }
  },
}

registerCardListener(anytimeListener)

export const C101_StallHolder = new Occupation({
  id: CARD_ID,
  name: 'Stall Holder',
  deck: 'C',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Once per round, if you have 0/1/2/3/4 unfenced stables, you can exchange 2 <GRAIN> for 1 bonus point and 1/2/3/4/5 <FOOD>.'],
  cost: {},
  players: '1+',
})
