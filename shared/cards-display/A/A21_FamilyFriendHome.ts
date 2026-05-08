import { MinorImprovement } from '../types'

const CARD_ID = 'A21_FamilyFriendHome'

export const A21_FamilyFriendHome = new MinorImprovement({
  id: CARD_ID,
  name: 'Family Friendly Home',
  deck: 'A',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time you take a __Build Rooms__ action while having more rooms than people already, you also get a __Family Growth__ action and 1 <FOOD>.'],
  cost: {},
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})
