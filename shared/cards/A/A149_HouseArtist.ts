import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'
import { isTravelingPlayersSpaceId } from '../helpers/action-space-categories'

const CARD_ID = 'A149_HouseArtist'
const triggerListener: CardListenerRegistration = {
  id: 'A149-house-artist-after-traveling-players',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isTravelingPlayersSpaceId(context.space?.id)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'construct',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const costListener: CardListenerRegistration = {
  id: 'A149-house-artist-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard !== CARD_ID) return
    return { trades: [constructUnitDiscountTrade(CARD_ID, { reed: 1 })] }
  },
}

const cardImpl = {
  listeners: [triggerListener, costListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A149_HouseArtist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'House Artist',
    deck: 'A',
    number: 149,
    category: 'FARM_PLANNER',
    desc: [
        'Each time you use the __Traveling Players__ accumulation space, you also get a __Build Rooms__ action. Each room you build during the action costs you 1 <REED> less.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A149_HouseArtist_impl = A149_HouseArtist.impl
