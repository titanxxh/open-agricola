import { Occupation } from '../types'

export const C175_VillageTeacher = new Occupation({
  id: 'C175_VillageTeacher',
  name: 'Village Teacher',
  deck: 'C',
  number: 175,
  category: 'CROP_PROVIDER',
  desc: ['Immediately after each time you use a "Lessons" action space, if this is the 1st/2nd/3rd occupied Lessons action space that round, you get 1 food/grain/vegetable.'],
  cost: {},
  players: '5+',
})
