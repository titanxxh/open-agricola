import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM002_AnimalBuyer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: () => ({
      type: 'seq',
      children: [0, 1].map(() => ({
        type: 'xor',
        optional: true,
        children: (['sheep', 'boar', 'cattle'] as const).map((animal, index) =>
          payGainActionFlow({ cardId: CARD_ID, cost: { food: index + 2 }, gain: { [animal]: 1 } }),
        ),
      })),
    }),
  },
} satisfies CardImpl

export const CWM002_AnimalBuyer = defineOccupationCard({
  meta: {
    id: 'CWM002_AnimalBuyer',
    name: "Animal Buyer",
    deck: 'CWM',
    number: 2,
    desc: ["After the field phase of each harvest, you may buy up to 2 animals in one purchase. Each sheep, wild boar, or cattle costs 2, 3, or 4 food, respectively."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM002.png',
  },
  impl: cardImpl,
})

export const CWM002_AnimalBuyer_impl = CWM002_AnimalBuyer.impl
