import { defineMinorCard } from '../card-source'

const CARD_ID = 'M038_NatureReserve'

export const M038_NatureReserve = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nature Reserve",
    deck: "M",
    number: 38,
    category: "FARM_PLANNER",
    desc: [
        "Immediately fence a farmyard space containing at least 1 forest or moor that is adjacent to a pasture, without paying wood for the fences. Once there are no tiles left in the fenced area, the farmyard space becomes a pasture."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "1 Pasture",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
