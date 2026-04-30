import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C51_FishingNet'

/**
 * Part 1: When an opponent uses the Fishing accumulation space,
 * the card owner gains 1 food (simplified from "opponent pays 1 food")
 * and the card is flagged for the delayed return-home effect.
 */
const listener: CardListenerRegistration = {
  id: 'C51-fishing-net-opponent-fishing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 1, recipientPlayerId: ownerId },
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C51_FishingNet = new MinorImprovement({
  id: CARD_ID,
  name: "Fishing Net",
  deck: "C",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["Each time another player uses the __Fishing__ accumulation space, they must first pay you 1 <FOOD>. Then, in the returning home phase of that round, place 2 <FOOD> on __Fishing__."],
  cost: {"reed":1},
  vp: 1,
})

export const C51_FishingNet_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (!isCardFlagged(player, CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
    const fishingSpace = state.actionSpaces.find(s => s.id === 'fishing')
    if (fishingSpace) {
      fishingSpace.resources.food = (fishingSpace.resources.food ?? 0) + 2
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
