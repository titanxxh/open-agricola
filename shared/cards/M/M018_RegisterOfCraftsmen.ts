import { defineMinorCard } from '../card-source'

const CARD_ID = 'M018_RegisterOfCraftsmen'

export const M018_RegisterOfCraftsmen = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Register of Craftsmen",
    deck: "M",
    number: 18,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Immediately acquire your choice of the Joinery, Pottery, or Basketmaker's Workshop without placing a person. You pay 1 stone less for it."
    ],
    cost: {},
    prerequisite: "2 Major Improvements",
    passing: true,
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
