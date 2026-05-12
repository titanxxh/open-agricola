import { MinorImprovement } from '../types'

const CARD_ID = 'D38_MilkingStool'

export const D38_MilkingStool = new MinorImprovement({
  id: CARD_ID,
  name: "Milking Stool",
  deck: "D",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: [
    'In the field phase of each harvest, if you have at least 1/3/5 <CATTLE>, you get 1/2/3 <FOOD>. During scoring, you get 1 bonus <SCORE> for every 2 <CATTLE> you have.',
  ],
  cost: { wood: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  extraVp: true,
})
