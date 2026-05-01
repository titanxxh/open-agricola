import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E38_RodCollection'

// Each time you use Fishing, place up to 2 wood on this card
const afterCollectListener: CardListenerRegistration = {
  id: 'E38-rod-collection-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'increment-extra-data', key: 'woodCount', amount: 2 },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E38_RodCollection = new MinorImprovement({
  id: CARD_ID,
  name: "Rod Collection",
  deck: "E",
  number: 38,
  category: "BONUS_POINTS_-_GET",
  desc: ['Each time you use __Fishing__, you can place up to 2 <WOOD> on this card, irretrievably. During scoring, each such <WOOD> is worth 1 bonus <SCORE>, except the 1st, 4th, 7th, and 10th.'],
  cost: { wood: 1 },
  vp: 1,
})

export const E38_RodCollection_impl = {
  listeners: [afterCollectListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const wood = readCardExtraData<number>(player, CARD_ID, 'woodCount') ?? 0
    // 1 VP per wood except at positions 1, 4, 7, 10 (1-indexed)
    // i.e. no VP at 0-indexed positions 0, 3, 6, 9
    // VP = wood - floor((wood + 2) / 3)
    return wood - Math.floor((wood + 2) / 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
