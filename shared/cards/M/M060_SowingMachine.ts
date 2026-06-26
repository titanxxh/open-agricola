import { defineMinorCard } from '../card-source'

const CARD_ID = 'M060_SowingMachine'

export const M060_SowingMachine = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Sowing Machine",
    deck: "M",
    number: 60,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take a special action, if you then have at least 2 horses, you can also take a \"Sow\" action."
    ],
    cost: {
        "wood": 3
    },
    prerequisite: "1 Horse",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
