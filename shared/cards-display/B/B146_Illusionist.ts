import { Occupation } from '../types'

const CARD_ID = 'B146_Illusionist'

export const B146_Illusionist = new Occupation({
  id: CARD_ID,
  name: 'Illusionist',
  deck: 'B',
  number: 146,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use a building resource accumulation space, you can discard exactly 1 card from your hand to get 1 additional building resource of the accumulating type.',
  ],
  cost: {},
  players: '3+',
  evenMoreSet: true,
})
