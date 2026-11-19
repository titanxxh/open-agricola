import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getPrintedImprovementResourceCost } from '../../../actions/helpers/improvement-helpers'

const CARD_ID = 'CWM017_Engineer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computePurchaseResourceGrants: (_state, _player, purchase) => [
      { food: getPrintedImprovementResourceCost(purchase.cardId, 'stone') > 0 ? 2 : 1 },
    ],
  },
} satisfies CardImpl

export const CWM017_Engineer = defineOccupationCard({
  meta: {
    id: 'CWM017_Engineer',
    name: "Engineer",
    deck: 'CWM',
    number: 17,
    desc: ["Immediately before you play an improvement, you get 1 food, or 2 food if its printed cost includes at least 1 stone."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM017.png',
  },
  impl: cardImpl,
})

export const CWM017_Engineer_impl = CWM017_Engineer.impl
