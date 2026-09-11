import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E038_RodCollection'
const afterCollectListener: CardListenerRegistration = {
  id: 'E38-rod-collection-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const maxWood = Math.min(2, context.player.resources.wood ?? 0)
    if (maxWood <= 0) return
    const children: ActionFlow[] = Array.from({ length: maxWood }, (_, index) => {
      const wood = index + 1
      return {
        type: 'seq',
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { wood } },
        children: [
          { type: 'leaf', actionId: 'pay', sourceCard: CARD_ID, params: { wood } },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'woodCount', amount: wood },
          },
        ],
      }
    })
    return {
      flow: {
        type: 'xor',
        optional: true,
        promptKey: 'ui.interactionFlowSelect',
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
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

export const E038_RodCollection = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Rod Collection",
    deck: "E",
    number: 38,
    category: "BONUS_POINTS_-_GET",
    desc: ['Each time you use __Fishing__, you can place up to 2 <WOOD> on this card, irretrievably. During scoring, each such <WOOD> is worth 1 bonus <SCORE>, except the 1st, 4th, 7th, and 10th.'],
    prerequisite: '3 Occupations',
    vp: 1,
    extraVp: true,
  },
  impl: cardImpl,
})

export const E038_RodCollection_impl = E038_RodCollection.impl
