import { Occupation } from '../types'

const CARD_ID = 'B124_Trimmer'

export const B124_Trimmer = new Occupation({
  id: CARD_ID,
  name: 'Trimmer',
  deck: 'B',
  number: 124,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['In each work phase, after you enclose at least one farmyard space, you get 2 <STONE>. (Subdividing an existing pasture does not count.)'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
