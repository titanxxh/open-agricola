import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'
import { getRoundPlacementDetails } from '../helpers/round-placement'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D176_Woodshacker'

const ownerWoodUsesThisRound = (context: CardListenerContext) =>
  getRoundPlacementDetails(context.player).filter((entry) => isWoodAccumulationSpaceId(entry.spaceId)).length

const listener: CardListenerRegistration = {
  id: 'D176-woodshacker-after-wood',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    const count = ownerWoodUsesThisRound(context)
    if (count === 1) return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
    if (count === 2) return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D176_Woodshacker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Woodshacker',
    deck: 'D',
    number: 176,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['In the work phase of each round, the first and the second time you use a wood accumulation space, you also get 1 and 2 clay respectively.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D176_Woodshacker_impl = D176_Woodshacker.impl
