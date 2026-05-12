import { MinorImprovement } from '../types'

const CARD_ID = 'C59_SchnappsDistillery'

export const C59_SchnappsDistillery = new MinorImprovement({
  id: CARD_ID,
  name: "Schnapps Distillery",
  deck: "C",
  number: 59,
  category: "FOOD_PROVIDER",
  desc: ["In each feeding phase, you can use this card to turn exactly 1 <VEGETABLE> into 5 <FOOD>. During scoring, you get 1 bonus <SCORE> each for your 5th and 6th <VEGETABLE>."],
  cost: { stone: 2, vegetable: 1 },
  vp: 2,
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 5 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
  ],
  extraVp: true,
})
