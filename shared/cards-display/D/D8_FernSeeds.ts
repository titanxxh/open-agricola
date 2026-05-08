import { MinorImprovement } from '../types'

const CARD_ID = 'D8_FernSeeds'

export const D8_FernSeeds = new MinorImprovement({
  id: CARD_ID,
  name: "Fern Seeds",
  deck: "D",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["You get 2 <FOOD> and 1 <GRAIN>, which you must sow immediately."],
  passing: true,
  prerequisite: "1 Empty and 2 Planted Fields",
})
