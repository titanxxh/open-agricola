import { MinorImprovement } from '../types'

const CARD_ID = 'C68_Bookcase'

export const C68_Bookcase = new MinorImprovement({
  id: CARD_ID,
  name: 'Bookcase',
  deck: 'C',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time after you play an occupation, you get 1 <VEGETABLE>.'],
  cost: { wood: 2 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
