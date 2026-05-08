import { MinorImprovement } from '../types'

const CARD_ID = 'D28_WritingDesk'

export const D28_WritingDesk = new MinorImprovement({
  id: CARD_ID,
  name: 'Writing Desk',
  deck: 'D',
  number: 28,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you use a __Lessons__ action space, you can play 1 additional occupation for an occupation cost of 2 <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
