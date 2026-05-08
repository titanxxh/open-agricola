import { MinorImprovement } from '../types'

const CARD_ID = 'E57_CheeseFondue'

export const E57_CheeseFondue = new MinorImprovement({
  id: CARD_ID,
  name: "Cheese Fondue",
  deck: "E",
  number: 57,
  category: "FOOD",
  desc: ['Each time you bake at least 1 <GRAIN> into bread, you get 1 additional <FOOD> if you have at least 1\u00a0<SHEEP> and (another) 1 additional <FOOD> if you have at least 1 <CATTLE>.'],
  cost: { clay: 1 },
  vp: 1,
})
