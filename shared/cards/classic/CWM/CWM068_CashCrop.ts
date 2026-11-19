import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { makeCardFieldImpl } from '../../helpers/card-field'

const CARD_ID = 'CWM068_CashCrop'

const cardImpl = makeCardFieldImpl(CARD_ID, {
  allowedCrops: ['grain', 'vegetable'],
  capacity: 1,
  harvestDestination: 'bonus-vp',
}) satisfies CardImpl

export const CWM068_CashCrop = defineMinorCard({
  meta: {
    cardField: { allowedCrops: ['grain', 'vegetable'], capacity: 1 },

    id: 'CWM068_CashCrop',
    name: "Cash Crop",
    deck: 'CWM',
    number: 68,
    desc: ["This card counts as one field. You may sow grain or vegetables on it. Each crop harvested from it must immediately become 1 bonus point instead of entering your supply. Points already earned remain after returning this card. Crops removed by other means do not score."],
    cost: {
      wood: 4,
      reed: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM068.png',
  },
  presentation: { cardFields: true, counters: ['bonusVp'] },
  impl: cardImpl,
})

export const CWM068_CashCrop_impl = CWM068_CashCrop.impl
