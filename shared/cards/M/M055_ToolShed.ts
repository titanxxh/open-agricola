import { defineMinorCard } from '../card-source'

const CARD_ID = 'M055_ToolShed'

export const M055_ToolShed = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Tool Shed",
    deck: "M",
    number: 55,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Once per round, immediately before or after you take the \"Slash and Burn\" or \"Cut Peat\" special action, you can also take the respective other special action."
    ],
    cost: {
        "wood": 1,
        "clay": 1
    },
    vp: 1,
    prerequisite: "2 Improvements",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
