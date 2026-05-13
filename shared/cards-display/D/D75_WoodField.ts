import { MinorImprovement } from '../types'

const CARD_ID = 'D75_WoodField'

export const D75_WoodField = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Field',
  deck: 'D',
  number: 75,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'You can plant <WOOD> on this card as though it were 2 fields, but it is considered 1 field. Sow and harvest <WOOD> on this card as you would <GRAIN>.',
  ],
  vp: 1,
  cost: { food: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  isField: true,
})
