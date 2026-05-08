import { Occupation } from '../types'

const CARD_ID = 'B152_JuniorArtist'

export const B152_JuniorArtist = new Occupation({
  id: CARD_ID,
  name: 'Junior Artist',
  deck: 'B',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Day Laborer__ action space, you can pay 1 <FOOD> to use an unoccupied __Traveling Players__ or __Lessons__ action space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
