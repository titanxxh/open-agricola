import { defineMinorCard } from '../card-source'

const CARD_ID = 'M092_AridField'

export const M092_AridField = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Arid Field",
    deck: "M",
    number: 92,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, place 1 fuel and 1 food on the emptied farmyard space. This farmyard space is still considered unused. You get the goods once the farmyard space is no longer unused."
    ],
    cost: {},
    prerequisite: "3 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
