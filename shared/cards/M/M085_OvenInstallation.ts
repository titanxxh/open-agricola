import { defineMinorCard } from '../card-source'

const CARD_ID = 'M085_OvenInstallation'

export const M085_OvenInstallation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Oven Installation",
    deck: "M",
    number: 85,
    category: "GOODS_PROVIDER",
    desc: [
        "You no longer need to heat your house. The Heating Oven starts under the Clay Oven."
    ],
    cost: {},
    vp: -1,
    returnCards: [
        "Major_Moor_HeatingOven"
    ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
    heatingFuelCap: 0,
    // Counts for Oven Damper scoring, but this upgrade is not a Firewood build trigger.
    ovenIdentity: true,
    firewoodBuildTrigger: false,
  },
})
