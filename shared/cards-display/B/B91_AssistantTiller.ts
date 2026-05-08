import { Occupation } from '../types'

const CARD_ID = 'B91_AssistantTiller'

export const B91_AssistantTiller = new Occupation({
  id: CARD_ID,
  name: 'Assistant Tiller',
  deck: 'B',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use the __Day Laborer__ action space, you can also plow 1 field.'],
  cost: {},
  players: '1+',
})
