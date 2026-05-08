import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { E38_RodCollection } from '../../cards-display/E/E38_RodCollection'
export { E38_RodCollection }

const CARD_ID = E38_RodCollection.id

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
