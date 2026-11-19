import { defineMinorCard } from '../../card-source'
import { grantImmediateGuestLeaf } from '../../helpers/guest-flow'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CNL017_MonasticVows'

export const CNL017_MonasticVows = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Monastic Vows',
    deck: 'CNL',
    number: 17,
    desc: ['At the end of each work phase, you may take 1 <BEGGING> card, 3 <FOOD> and 1 guest. Place the guest immediately, then return it.'],
    cost: {},
  },
  impl: {
    effect: {
      id: CARD_ID,
      onAllWorkersPlaced: () => ({
        type: 'seq',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { begging: 1, food: 3 }),
          grantImmediateGuestLeaf(CARD_ID),
        ],
      }),
    },
  },
})
