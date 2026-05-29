import { MinorImprovement } from '../types'

const CARD_ID = 'A60_OrientalFireplace'

/**
 * A60 Oriental Fireplace — Anytime exchanges: VEGETABLE→4 FOOD, SHEEP→3 FOOD, CATTLE→5 FOOD.
 * Bake Bread action: GRAIN→2 FOOD.
 * Cookery + Baking improvement. Replaces Fireplace or Cooking Hearth.
 *
 * BGA: isCookery=true, isBakingImprovement=true, returnCards = Fireplace/CookingHearth variants.
 */
export const A60_OrientalFireplace = new MinorImprovement({
  id: CARD_ID,
  name: 'Oriental Fireplace',
  deck: 'A',
  number: 60,
  category: 'FOOD_PROVIDER',
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 4<FOOD>      <SHEEP> <ARROW> 3<FOOD>',
    '<CATTLE> <ARROW> 5<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  vp: 1,
  cost: {},
  isCookery: true,
  isBaking: true,
  fireplaceIdentity: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2'],
  alsoCountsAs: ['major'],
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 4 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { food: 3 }, triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 5 }, triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, triggers: ['bake-bread'] },
  ],
})
