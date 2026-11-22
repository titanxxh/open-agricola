import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM066_Brazier'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvestFeedingPhase: () => ({
      type: 'xor',
      optional: true,
      children: (['vegetable', 'sheep', 'boar', 'cattle'] as const).map((resource, i) =>
        payGainActionFlow({
          cardId: CARD_ID,
          cost: { [resource]: 1 },
          gain: { food: [3, 2, 3, 4][i]! },
        }),
      ),
    }),
  },
} satisfies CardImpl

export const CWM066_Brazier = defineMinorCard({
  meta: {
    isCookery: true,

    id: 'CWM066_Brazier',
    name: "Brazier",
    deck: 'CWM',
    number: 66,
    desc: ["During each harvest feeding phase, you may convert at most one good to <FOOD>: 1 <VEGETABLE> for 3 <FOOD>, 1 <SHEEP> for 2 <FOOD>, 1 <BOAR> for 3 <FOOD>, or 1 <CATTLE> for 4 <FOOD>."],
    cost: {
      wood: 1,
      clay: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM066.png',
  },
  impl: cardImpl,
})

export const CWM066_Brazier_impl = CWM066_Brazier.impl
