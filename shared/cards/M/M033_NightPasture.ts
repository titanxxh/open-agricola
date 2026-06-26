import { defineMinorCard } from '../card-source'

const CARD_ID = 'M033_NightPasture'

export const M033_NightPasture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Night Pasture",
    deck: "M",
    number: 33,
    category: "FARM_PLANNER",
    desc: [
        "You can keep up to 3 animals of any type on this card; the other players can each keep an additional 1 animal on it. The animals on this card count as only yours when animals breed. You are always the last player to breed in the breeding phase."
    ],
    cost: {
        "clay": 2
    },
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
