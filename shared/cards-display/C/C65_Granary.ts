import { MinorImprovement } from '../types'

const CARD_ID = 'C65_Granary'

export const C65_Granary = new MinorImprovement({
  id: CARD_ID,
  name: "Granary",
  deck: "C",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["Place 1 <GRAIN> each on the remaining spaces for rounds 8, 10, and 12. At the start of these rounds, you get the <GRAIN>."],
  vp: 1,
  altCosts: [{ wood: 3 }, { clay: 3 }],
})
