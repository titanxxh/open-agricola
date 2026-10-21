import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { getSpaceUsePersonPlacementOrdinal } from '../helpers/round-placement'
import { readActionSnapshotExtraData } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'C091_PlowHero'
const listener: CardListenerRegistration = {
  id: 'C91-plow-hero-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const id = context.space?.id
    if (id !== 'farmland' && id !== 'cultivation') return
    // Only triggers for the first farmer placed in the round
    const actionContext = context.actionContext ?? (context.actionSpaceUse?.newPlacement
      ? { placedWorkerId: readActionSnapshotExtraData<string>(context.player, 'placedWorkerId') }
      : undefined)
    if (getSpaceUsePersonPlacementOrdinal(context.player, actionContext) !== 1) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C091_PlowHero = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plow Hero',
    deck: 'C',
    number: 91,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Farmland__ or __Cultivation__ action space with the first person you place in a round, you can plow 1 additional <FIELD> for 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C091_PlowHero_impl = C091_PlowHero.impl
