import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { workersAvailable } from '../../domain/player'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { allImprovementCount } from './moor-batch1-helpers'

const CARD_ID = 'M121_Loam'

const listener: CardListenerRegistration = {
  id: 'M121-loam-after-hiring-fair',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['hiring-fair'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const player = context.ownerPlayer ?? context.player
    if (context.state.roundPhase !== 'work' || workersAvailable(context.state, player) !== 1) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => allImprovementCount(player) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M121_Loam = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Loam",
    deck: "M",
    number: 121,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "In each work phase, if you have placed all but one of your people when taking the __Hiring Fair__ special action, you also get 1 <CLAY>."
    ],
    cost: {},
    prerequisite: "1 Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M121_Loam_impl = M121_Loam.impl
