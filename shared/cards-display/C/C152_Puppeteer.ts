import { Occupation } from '../types'

const CARD_ID = 'C152_Puppeteer'

export const C152_Puppeteer = new Occupation({
  id: CARD_ID,
  name: 'Puppeteer',
  deck: 'C',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time another player uses the __Traveling Players__ accumulation space, you can pay them 1 <FOOD> to immediately play an occupation without paying an occupation cost.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
