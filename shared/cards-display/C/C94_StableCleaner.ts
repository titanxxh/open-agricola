import { Occupation } from '../types'

const CARD_ID = 'C94_StableCleaner'

export const C94_StableCleaner = new Occupation({
  id: CARD_ID,
  name: 'Stable Cleaner',
  deck: 'C',
  number: 94,
  category: 'ACTIONS_BOOSTER',
  desc: ['At any time, you can take the __Build Stables__ action without placing a person. If you do, each stable costs you 1 <WOOD> and 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
