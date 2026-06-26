import { defineMinorCard } from '../card-source'

const CARD_ID = 'M046_Thicket'

export const M046_Thicket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Thicket",
    deck: "M",
    number: 46,
    category: "FARM_PLANNER",
    desc: [
        "Choose up to 2 of your forests and place 1 additional forest on top of each of them. You cannot take the \"Slash and Burn\" special action on these farmyard spaces unless you remove a tile with a \"Fell Trees\" special action first."
    ],
    cost: {},
    prerequisite: "4 Forests",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
