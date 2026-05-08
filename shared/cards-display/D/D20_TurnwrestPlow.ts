import { MinorImprovement } from '../types'

const CARD_ID = 'D20_TurnwrestPlow'

export const D20_TurnwrestPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Turnwrest Plow',
  deck: 'D',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Place 2 field tiles on this card. Each time you use the __Farmland__ or __Cultivation__ action space, you can also plow up to 2 fields from this card.'],
  cost: { wood: 3 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
