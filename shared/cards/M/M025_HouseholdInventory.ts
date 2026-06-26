import { defineMinorCard } from '../card-source'

const CARD_ID = 'M025_HouseholdInventory'

export const M025_HouseholdInventory = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Household Inventory",
    deck: "M",
    number: 25,
    category: "GOODS_PROVIDER",
    desc: [
        "If you have exactly 5/6/7/8/9/10 unused farmyard spaces, you immediately get the following 1/2/3/4/5/6 goods (in this order): 1 <REED>, 1 <GRAIN>, 1 <CATTLE>, 1 <STONE>, 1 <VEGETABLE>, 1 <HORSE>."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "1 Field, 1 Pasture or 1 Stable",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
