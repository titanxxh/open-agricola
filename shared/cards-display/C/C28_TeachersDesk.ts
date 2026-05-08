import { MinorImprovement } from '../types'

const CARD_ID = 'C28_TeachersDesk'

export const C28_TeachersDesk = new MinorImprovement({
  id: CARD_ID,
  name: "Teacher's Desk",
  deck: 'C',
  number: 28,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Major Improvement__ or __House Redevelopment__ action space, you can also play 1 occupation at an occupation cost of 1 <FOOD>.',
  ],
  cost: { wood: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
