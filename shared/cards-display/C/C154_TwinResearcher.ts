import { Occupation } from '../types'

const CARD_ID = 'C154_TwinResearcher'

export const C154_TwinResearcher = new Occupation({
  id: CARD_ID,
  name: 'Twin Researcher',
  deck: 'C',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time you use one of the two accumulation spaces for the same type of good containing exactly the same number of goods, you can also buy 1 bonus <SCORE> for 1 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
  extraVp: true,
})
