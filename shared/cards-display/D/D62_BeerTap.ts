import { MinorImprovement } from '../types'

const CARD_ID = 'D62_BeerTap'

export const D62_BeerTap = new MinorImprovement({
  id: CARD_ID,
  name: 'Beer Tap',
  deck: 'D',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, you immediately get 2 <FOOD>. In the feeding phase of each harvest, you can turn 2/3/4 <GRAIN> into 3/6/9 <FOOD>.'],
  cost: { wood: 1 },
  newSet: true,
  // Three tiers share the same sourceId so per-source `max:1` caps the whole
  // card to a single tier per harvest (the consumer aggregates by sourceId).
  exchanges: [
    { from: { grain: 2 }, to: { food: 3 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
    { from: { grain: 3 }, to: { food: 6 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
    { from: { grain: 4 }, to: { food: 9 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
  ],
})
