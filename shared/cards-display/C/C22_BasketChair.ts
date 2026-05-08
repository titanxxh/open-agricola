import { MinorImprovement } from '../types'

const CARD_ID = 'C22_BasketChair'

export const C22_BasketChair = new MinorImprovement({
  id: CARD_ID,
  name: 'Basket Chair',
  deck: 'C',
  number: 22,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you can immediately move the first person you placed this work phase to this card (unless it is on __Meeting Place__). If you do, immediately afterward, you can place another person.',
  ],
  cost: { reed: 1 },
  vp: 1,
  evenMoreSet: true,
})
