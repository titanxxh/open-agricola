import { getAssignedAnimalsByType } from '../../domain/animals'
import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B154_SheepKeeper'
const anytimeListener: CardListenerRegistration = {
  id: 'B154-sheep-keeper-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (getAssignedAnimalsByType(context.player, context.state).sheep < 7) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { food: 2 }),
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B154_SheepKeeper.anytime',
    }
  },
}

const cardImpl = {
  prerequisiteCheck: (player, state) => getAssignedAnimalsByType(player, state).sheep < 7,
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B154_SheepKeeper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Keeper',
    deck: 'B',
    number: 154,
    category: 'POINTS_PROVIDER',
    desc: ['You can only play this card if you have less than 7 <SHEEP>. Once this game, when you have 7 <SHEEP> on your farm, you immediately get 3 bonus <SCORE> and 2 <FOOD>.'],
    cost: {},
    players: '4+',
    prerequisite: 'Less Than 7 Sheep',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B154_SheepKeeper_impl = B154_SheepKeeper.impl
