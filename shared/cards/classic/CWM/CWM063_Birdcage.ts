import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM063_Birdcage'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvest: () => payGainFlow({ cardId: CARD_ID, cost: { food: 1 }, gain: { score: 1 } }),
  },
} satisfies CardImpl

export const CWM063_Birdcage = defineMinorCard({
  meta: {
    blocksHouseAnimalZones: true,

    id: 'CWM063_Birdcage',
    name: "Birdcage",
    deck: 'CWM',
    number: 63,
    desc: ["At the end of each harvest, you may pay 1 food for 1 bonus point. Your house can no longer hold animals, even through card effects."],
    cost: {
      wood: 2,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM063.png',
  },
  impl: cardImpl,
})

export const CWM063_Birdcage_impl = CWM063_Birdcage.impl
