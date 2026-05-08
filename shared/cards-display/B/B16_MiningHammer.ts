import { MinorImprovement } from '../types'

const CARD_ID = 'B16_MiningHammer'

export const B16_MiningHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Mining Hammer',
  deck: 'B',
  number: 16,
  category: 'FARM_PLANNER',
  desc: [
    'When you play this card, you immediately get 1 <FOOD>. Each time you renovate, you can also build a stable without paying <WOOD>.',
  ],
  cost: { wood: 1 },
})
