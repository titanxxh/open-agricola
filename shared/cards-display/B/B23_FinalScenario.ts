import { MinorImprovement } from '../types'

const CARD_ID = 'B23_FinalScenario'

export const B23_FinalScenario = new MinorImprovement({
  id: CARD_ID,
  name: 'Final Scenario',
  deck: 'B',
  number: 23,
  category: 'ACTIONS_BOOSTER',
  desc: ['Reveal the action space card for round 14. Only you can use it until round 14 starts.'],
  cost: {},
  prerequisite: 'Round 13 or Before',
  evenMoreSet: true,
})
