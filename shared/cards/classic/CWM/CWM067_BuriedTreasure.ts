import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM067_BuriedTreasure'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-space',
      cardIds: [CARD_ID],
      actionSpaces: ['farmland', 'cultivation'],
      phases: ['after'],
      handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { stone: 1 }) }),
    },
  ],
} satisfies CardImpl

export const CWM067_BuriedTreasure = defineMinorCard({
  meta: {
    id: 'CWM067_BuriedTreasure',
    name: "Buried Treasure",
    deck: 'CWM',
    number: 67,
    desc: ["Whenever you use __Farmland__ or __Cultivation__, you also get 1 <STONE>."],
    cost: {},
    vp: 0,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM067.png',
  },
  impl: cardImpl,
})

export const CWM067_BuriedTreasure_impl = CWM067_BuriedTreasure.impl
