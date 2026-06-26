import { defineMinorCard } from '../card-source'

const CARD_ID = 'M096_FallowLand'

export const M096_FallowLand = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fallow Land",
    deck: "M",
    number: 96,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you take the \"Fell Trees\" or \"Cut Peat\" special action, place 1 food on the emptied farmyard space. This farmyard space is still considered unused. Once the farmyard space is no longer unused, you get the food."
    ],
    cost: {},
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
