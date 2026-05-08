import { MinorImprovement } from '../types'

const CARD_ID = 'C26_Flail'

export const C26_Flail = new MinorImprovement({
  id: CARD_ID,
  name: 'Flail',
  deck: 'C',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you immediately get 2 <FOOD>. Each time you use the __Farmland__ or __Cultivation__ action space, you can also take a __Bake Bread__ action.',
  ],
  cost: { wood: 1 },
})
