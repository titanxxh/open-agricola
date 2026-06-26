import { defineMinorCard } from '../card-source'

const CARD_ID = 'M041_CattleCollar'

export const M041_CattleCollar = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cattle Collar",
    deck: "M",
    number: 41,
    category: "FARM_PLANNER",
    desc: [
        "Each time after you use the \"Farmland\" or \"Cultivation\" action space or take the \"Slash and Burn\" special action, if you have at least 1 cattle, you can plow 1 additional field."
    ],
    cost: {
        "wood": 1
    },
    vp: 1,
    prerequisite: "Play in Round 8 or Later",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
