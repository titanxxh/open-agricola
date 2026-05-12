import { MinorImprovement } from '../types'

const CARD_ID = 'A36_FacadesCarving'

export const A36_FacadesCarving = new MinorImprovement({
  id: CARD_ID,
  name: 'Facades Carving',
  deck: 'A',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you can exchange any number of <FOOD> for 1 bonus <SCORE> each, up to the number of completed harvests.'],
  cost: { clay: 2 },
  prerequisite: 'Wood in Your Supply >= Current Round',
  extraVp: true,
})
