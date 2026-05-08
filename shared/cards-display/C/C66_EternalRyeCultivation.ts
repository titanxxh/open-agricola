import { MinorImprovement } from '../types'

const CARD_ID = 'C66_EternalRyeCultivation'

export const C66_EternalRyeCultivation = new MinorImprovement({
  id: CARD_ID,
  name: "Eternal Rye Cultivation",
  deck: "C",
  number: 66,
  category: "CROP_PROVIDER",
  desc: ["After each harvest in which you have 2 or 3+ <GRAIN> in your supply, you get 1 <FOOD> or 1 additional <GRAIN>, respectively."],
  cost: {},
  prerequisite: "1 Grain Field",
})
