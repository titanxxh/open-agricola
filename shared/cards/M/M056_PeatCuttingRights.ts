import { defineMinorCard } from '../card-source'

const CARD_ID = 'M056_PeatCuttingRights'

export const M056_PeatCuttingRights = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat-Cutting Rights",
    deck: "M",
    number: 56,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Add 4 and 7 to the current round and place 1 fuel on each corresponding round space. At the start of these rounds, you can discard the fuel and take the \"Cut Peat\" special action by taking the appropriate special action card."
    ],
    cost: {},
    prerequisite: "1 Horse",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
