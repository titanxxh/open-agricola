import { MinorImprovement } from '../types'

const CARD_ID = 'B54_Tumbrel'

export const B54_Tumbrel = new MinorImprovement({
  id: CARD_ID,
  name: 'Tumbrel',
  deck: 'B',
  number: 54,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <FOOD>. Each time after you take an unconditional __Sow__ action, you get 1 <FOOD> for each stable you have.',
  ],
  cost: { wood: 1 },
})
