import { defineMinorCard } from '../card-source'

const CARD_ID = 'M121_Loam'

export const M121_Loam = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Loam",
    deck: "M",
    number: 121,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "In each work phase, if you have placed all but one of your people when taking the \"Hiring Fair\" special action, you also get 1 clay."
    ],
    cost: {},
    prerequisite: "1 Improvement",
    implemented: false,
    requiresFarmersOfTheMoor: true,
  },
})
