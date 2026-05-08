import { Occupation } from '../types'

const CARD_ID = 'C151_SowingDirector'

export const C151_SowingDirector = new Occupation({
  id: CARD_ID,
  name: 'Sowing Director',
  deck: 'C',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after another player uses the __Grain Utilization__ action space, you get a __Sow__ action.',
  ],
  cost: {},
  players: '4+',
})
