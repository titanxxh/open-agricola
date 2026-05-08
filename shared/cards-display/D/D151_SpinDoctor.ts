import { Occupation } from '../types'

const CARD_ID = 'D151_SpinDoctor'

export const D151_SpinDoctor = new Occupation({
  id: CARD_ID,
  name: 'Spin Doctor',
  deck: 'D',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['Immediately after each time you use the __Traveling Players__ accumulation space, you can place another person on an action space of your choice, regardless whether or not the action space is occupied.'],
  cost: {},
  players: '4+',
})
