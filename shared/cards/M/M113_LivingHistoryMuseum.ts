import { defineMinorCard } from '../card-source'

const CARD_ID = 'M113_LivingHistoryMuseum'

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
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
