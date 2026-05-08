import { MinorImprovement } from '../types'

const CARD_ID = 'D42_EducationBonus'

export const D42_EducationBonus = new MinorImprovement({
  id: CARD_ID,
  name: 'Education Bonus',
  deck: 'D',
  number: 42,
  category: 'GOODS_PROVIDER',
  desc: [
    'After you play your 1st/2nd/3rd/4th/5th/6th occupation this game, you immediately get 1 <GRAIN>/<CLAY>/<REED>/<STONE>/<VEGETABLE>/<FIELD> (not retroactively).',
  ],
  cost: { food: 1 },
  prerequisite: '2 Imps',
  improvementPrerequisites: { min: 2 },
})
