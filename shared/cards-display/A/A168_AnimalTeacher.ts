import { Occupation } from '../types'

const CARD_ID = 'A168_AnimalTeacher'

export const A168_AnimalTeacher = new Occupation({
  id: CARD_ID,
  name: 'Animal Teacher',
  deck: 'A',
  number: 168,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Immediately after each time you use a __Lessons__ action space, you can also buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>.'],
  cost: {},
  players: '4+',
})
