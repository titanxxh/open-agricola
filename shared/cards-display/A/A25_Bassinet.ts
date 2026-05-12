import { MinorImprovement } from '../types'

const CARD_ID = 'A25_Bassinet'

export const A25_Bassinet = new MinorImprovement({
  id: CARD_ID,
  name: 'Bassinet',
  deck: 'A',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'You can place a(nother) person on the first non-accumulating action space used in each work phase, if there is only 1 person, including newborns, on that space. (There can never be two people on __Meeting Place__.)',
  ],
  cost: { wood: 1, reed: 1 },
  vp: 0,
})
