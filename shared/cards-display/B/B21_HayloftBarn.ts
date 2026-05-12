import { MinorImprovement } from '../types'

const CARD_ID = 'B21_HayloftBarn'

export const B21_HayloftBarn = new MinorImprovement({
  id: CARD_ID,
  name: 'Hayloft Barn',
  deck: 'B',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 4 <FOOD> on this card. Each time you obtain at least 1 <GRAIN>, you also get 1 <FOOD> from this card. Once it is empty, you get a __Family Growth Even without Room__ action.'],
  cost: { wood: 3 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
