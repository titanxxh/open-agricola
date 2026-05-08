import { MinorImprovement } from '../types'

const CARD_ID = 'D70_StrawManure'

export const D70_StrawManure = new MinorImprovement({
  id: CARD_ID,
  name: "Straw Manure",
  deck: "D",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ["Before the field phase of each harvest, you can pay 1 <GRAIN> from your supply to add 1 <VEGETABLE> to each of up to 2 vegetable fields."],
  cost: {},
  prerequisite: "2 Fields",
})
