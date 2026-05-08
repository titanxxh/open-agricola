import { MinorImprovement } from '../types'

const CARD_ID = 'E18_SeedAlmanac'

export const E18_SeedAlmanac = new MinorImprovement({
  id: CARD_ID,
  name: 'Seed Almanac',
  deck: 'E',
  number: 18,
  category: 'FARMYARD_-_PLOWING',
  desc: [
    'Each time after you play a minor improvement after this one, you can pay 1 <FOOD> to plow 1 field.',
  ],
  cost: { reed: 1 },
  prerequisite: '4 Occupations',
  occupationPrerequisites: { min: 4 },
})
