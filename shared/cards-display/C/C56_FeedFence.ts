import { MinorImprovement } from '../types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'C56_FeedFence'

export const C56_FeedFence = new MinorImprovement({
  id: CARD_ID,
  name: 'Feed Fence',
  deck: 'C',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: [
    'For each new stable you build, you get 1 <FOOD> —for your last one, get 3 <FOOD>. Each time you build stables, you can build exactly 1 stable for 1 <CLAY> instead of 2 <WOOD>.',
  ],
  cost: { wood: 1 },
  // Trade modifier: 1 clay substitutes for 2 wood, max 1 per stables action
  // BGA: Utils::addCost($args['costs'], [CLAY => 1, 'max' => 1], $this->id)
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['stables'],
    from: { clay: 1 },
    to: { wood: 2 },
    max: 1,
  } as TradeModifier,
})
