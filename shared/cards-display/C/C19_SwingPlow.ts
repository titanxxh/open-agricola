import { MinorImprovement } from '../types'

const CARD_ID = 'C19_SwingPlow'

export const C19_SwingPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Swing Plow',
  deck: 'C',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Place 4 field tiles on this card. Each time you use the __Farmland__ action space, you can also plow up to 2 fields from this card.'],
  cost: { wood: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
