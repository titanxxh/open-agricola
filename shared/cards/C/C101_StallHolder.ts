import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { getUnfencedStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'

const CARD_ID = 'C101_StallHolder'
const anytimeListener: CardListenerRegistration = {
  id: 'C101-stall-holder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.resources.grain < 2) return
    const unfencedStables = getUnfencedStableCountForCards(context.player)
    const foodGain = unfencedStables + 1
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          payLeaf({ cardId: CARD_ID, cost: { grain: 2 } }),
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: foodGain }),
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C101_StallHolder.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    setCardFlag(player, CARD_ID, false)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C101_StallHolder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stall Holder',
    deck: 'C',
    number: 101,
    category: 'POINTS_PROVIDER',
    desc: ['Once per round, if you have 0/1/2/3/4 unfenced <STABLE> on your farm, you can exchange 2 <GRAIN> for 1 bonus <SCORE> and 1/2/3/4/5 <FOOD>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const C101_StallHolder_impl = C101_StallHolder.impl
