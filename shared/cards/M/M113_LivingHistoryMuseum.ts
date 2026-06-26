import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import { discountCardCostCandidate } from '../../actions/payment/internal'

const CARD_ID = 'M113_LivingHistoryMuseum'
const discountByTarget = {
  Major_Moor_HeatingOven: 'clay',
  Major_Moor_TiledOven: 'stone',
  Major_Moor_RidingStables: 'wood',
  Major_Moor_VillageChurch: 'stone',
  Major_Moor_FurnitureStall: 'wood',
  Major_Moor_BasketStall: 'reed',
  Major_Moor_CeramicsStall: 'clay',
} as const

const costListener: CardListenerRegistration = {
  id: 'M113-living-history-museum-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (context.state.enableFarmersOfTheMoor !== true) return null
    if (!context.cardId) return null
    const resource = discountByTarget[context.cardId as keyof typeof discountByTarget]
    if (!resource) return null
    return discountCardCostCandidate(candidate, CARD_ID, { [resource]: 1 })
  },
}

const cardImpl = {
  listeners: [costListener],
  prerequisiteCheck: (player) => player.houseType === 'clay',
  reaches: Object.keys(discountByTarget),
} satisfies CardImpl

export const M113_LivingHistoryMuseum = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Living History Museum",
    deck: "M",
    number: 113,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "These major improvements cost you 1 building resource less: Heating Oven 1 <CLAY>, Tiled Oven 1 <STONE>, Riding Stables 1 <WOOD>, Village Church 1 <STONE>, Furniture Stall 1 <WOOD>, Basket Stall 1 <REED>, Ceramics Stall 1 <CLAY>. It starts under the Peat-charcoal Kiln."
    ],
    cost: {},
    vp: 4,
    prerequisite: "Clay House",
    returnCards: [
        "Major_Moor_MuseumOfTheMoors"
    ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M113_LivingHistoryMuseum_impl = M113_LivingHistoryMuseum.impl
