import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL028_HashwithFries'

const cardImpl = {
  prerequisiteCheck: (player) =>
    player.resources.grain >= 1 && player.resources.vegetable >= 1 && player.resources.cattle >= 1,
  effect: {
    id: CARD_ID,
    onBuy: () =>
      payGainFlow({
        cardId: CARD_ID,
        cost: { grain: 1, vegetable: 1, cattle: 1 },
        gain: { food: 5, score: 3 },
        choiceLabelKey: 'ui.interactionResourceExchange',
      }),
  },
} satisfies CardImpl

export const CFL028_HashwithFries = defineMinorCard({
  meta: {
    id: 'CFL028_HashwithFries',
    name: 'Hash with Fries',
    deck: 'CFL',
    number: 28,
    passing: true,
    extraVp: true,
    desc: [
      'Immediately, you can exchange 1 <GRAIN>, 1 <VEGETABLE>, and 1 <CATTLE> for 5 <FOOD> and 3 bonus <SCORE>. Then pass this card to the player on your left.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL028.png',
    prerequisite: '1 grain, 1 vegetable, and 1 cattle',
  },
  impl: cardImpl,
})
