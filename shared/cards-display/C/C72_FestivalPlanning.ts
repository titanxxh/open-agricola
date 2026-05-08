import { MinorImprovement } from '../types'

const CARD_ID = 'C72_FestivalPlanning'

export const C72_FestivalPlanning = new MinorImprovement({
  id: CARD_ID,
  name: "Festival Planning",
  deck: "C",
  number: 72,
  category: "CROP_PROVIDER",
  desc: ["When you play this card, immediately carry out the field phase on your farmyard only (this is not a harvest). Afterwards, you get a __Major or Minor Improvement__ action."],
  cost: { food: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
