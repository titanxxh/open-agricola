import { MinorImprovement } from '../types'

const CARD_ID = 'C62_CookeryExtension'

// TODO: The original card dynamically doubles cooking exchanges from other cooking improvements
// the player has in play, but only during harvest and limited to once per cooking improvement.
// This requires dynamic exchange generation based on other played cards at harvest time,
// which is not currently supported by our exchange system.
// Full implementation would need: inspect player's played cooking improvements, generate
// doubled harvest-only exchanges for each, with per-improvement usage flags.

export const C62_CookeryExtension = new MinorImprovement({
  id: CARD_ID,
  name: 'Cookery Extension',
  deck: 'C',
  number: 62,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each harvest, you can use each of your cooking improvements once to get double the amount of <FOOD> for 1 animal or <VEGETABLE>.',
  ],
  cost: { clay: 2 },
  implemented: false,
})
