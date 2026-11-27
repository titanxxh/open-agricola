import { defineMinorCard } from '../../card-source'
import { makeCardFieldImpl } from '../../helpers/card-field'
import { bonusVpLeaf, payLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM068_CashCrop'

const cardImpl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
  {
    onReap: ({ crop, amount, trigger }) => {
      if (trigger.phase !== 'harvest' || amount <= 0) return
      return {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [crop]: amount } }),
          bonusVpLeaf(CARD_ID, amount),
        ],
      }
    },
  },
)

export const CWM068_CashCrop = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cash Crop',
    deck: 'CWM',
    number: 68,
    cost: {},
    vp: 0,
    extraVp: true,
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    cardField: { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
    isField: true,
    desc: [
      'When you __Sow__, you may __Sow__ on this card as if it were 1 <FIELD>. Whenever you harvest goods from this card during the field phase of a harvest, you must exchange these harvested goods for 1 bonus <SCORE> each.',
    ],
    artUrl: 'assets/classic/CWM/CWM068.png',
    implemented: true,
  },
  presentation: { cardFields: true },
  impl: cardImpl,
})

export const CWM068_CashCrop_impl = CWM068_CashCrop.impl
