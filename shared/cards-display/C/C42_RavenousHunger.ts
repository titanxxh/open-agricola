import { MinorImprovement } from '../types'

const CARD_ID = 'C42_RavenousHunger'

export const C42_RavenousHunger = new MinorImprovement({
  id: CARD_ID,
  name: 'Ravenous Hunger',
  deck: 'C',
  number: 42,
  category: 'GOODS_PROVIDER',
  desc: [
    'Immediately after each time you use the __Vegetable Seeds__ action space, you can place another person on an accumulation space and get 1 additional good of the accumulating type.',
  ],
  cost: { grain: 1 },
  players: '1+',
})
