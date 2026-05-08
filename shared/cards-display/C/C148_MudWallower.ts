import { Occupation } from '../types'

const CARD_ID = 'C148_MudWallower'

export const C148_MudWallower = new Occupation({
  id: CARD_ID,
  name: 'Mud Wallower',
  deck: 'C',
  number: 148,
  category: 'FARM_PLANNER',
  desc: ['Every fourth time you use an accumulation space, you get 1 <PIG>, held by this card.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
  extraVp: true,
})
