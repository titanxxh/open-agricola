import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'

const CARD_ID = 'E29_Heirloom'

// E29 Heirloom: prerequisite — you have a person placed on the Day Laborer action.
// Pure bonus-VP minor (2 VP). Once played, has no additional effect.
registerPrerequisite('Your Person on Day Laborer', (player, state) => {
  if (!state) return true
  const dayLaborerSpace = (state.actionSpaces ?? []).find((space) => space.id === 'day-laborer')
  if (!dayLaborerSpace) return false
  return dayLaborerSpace.takenBy === player.id
})

export const E29_Heirloom = new MinorImprovement({
  id: CARD_ID,
  name: 'Heirloom',
  deck: 'E',
  number: 29,
  category: 'BONUS_POINT_GENERATOR',
  desc: ['(This card has no additional effect.)'],
  cost: {},
  vp: 2,
  prerequisite: 'Your Person on Day Laborer',
  evenMoreSet: true,
})
