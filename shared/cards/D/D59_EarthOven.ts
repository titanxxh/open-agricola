import { MinorImprovement } from '../types'

const CARD_ID = 'D59_EarthOven'

/**
 * D59 Earth Oven — Anytime exchanges: VEGETABLE→3 FOOD, SHEEP→2 FOOD, PIG→3 FOOD, CATTLE→3 FOOD.
 * Bake Bread action: GRAIN→2 FOOD.
 * Cookery + Baking improvement. Replaces Fireplace only.
 *
 * BGA: isCookery=true, isBakingImprovement=true, returnCards = Fireplace variants.
 * VP: 3.
 */
export const D59_EarthOven = new MinorImprovement({
  id: CARD_ID,
  name: 'Earth Oven',
  deck: 'D',
  number: 59,
  category: 'FOOD_PROVIDER',
  desc: ['[Anytime] <VEGETABLE> → 3<FOOD>   <SHEEP> → 2<FOOD>   <PIG> → 3<FOOD>   <CATTLE> → 3<FOOD>', '[__Bake Bread__ action:] <GRAIN> → 2<FOOD>'],
  vp: 3,
  cost: {},
  isCookery: true,
  isBaking: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 3 }, trigger: 'anytime' },
    { from: { sheep: 1 }, to: { food: 2 }, trigger: 'anytime' },
    { from: { boar: 1 }, to: { food: 3 }, trigger: 'anytime' },
    { from: { cattle: 1 }, to: { food: 3 }, trigger: 'anytime' },
    { from: { grain: 1 }, to: { food: 2 }, trigger: 'bake-bread' },
  ],
})
