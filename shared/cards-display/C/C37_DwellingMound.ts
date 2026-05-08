import { MinorImprovement } from '../types'

const CARD_ID = 'C37_DwellingMound'

export const C37_DwellingMound = new MinorImprovement({
  id: CARD_ID,
  name: "Dwelling Mound",
  deck: "C",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["From now on, you must pay 1 <FOOD> for each new field tile that you place in your farmyard."],
  cost: { food: 1 },
  prerequisite: "Play in Round 3 or Before",
  maxRound: 3,
  vp: 3,
})
