import { Occupation } from '../types'

const CARD_ID = 'E156_ClaypitOwner'

export const E156_ClaypitOwner = new Occupation({
  id: CARD_ID,
  name: 'Claypit Owner',
  deck: 'E',
  number: 156,
  category: 'GOODS_-_GET',
  desc: [
    'Each time another player plays or builds an improvement with a printed <CLAY> cost, you get 1 <FOOD> and 1 <CLAY>.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
