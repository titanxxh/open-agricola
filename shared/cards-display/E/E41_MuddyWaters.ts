import { MinorImprovement } from '../types'

const CARD_ID = 'E41_MuddyWaters'

export const E41_MuddyWaters = new MinorImprovement({
  id: CARD_ID,
  name: 'Muddy Waters',
  deck: 'E',
  number: 41,
  category: 'GOODS_-_GET',
  desc: ['Alternate placing 1 <FOOD> and 1 <CLAY> on each remaining even-numbered round space, starting with <FOOD>. At the start of these rounds, you get the respective good.'],
  vp: 1,
  prerequisite: '5 Cards in Play',
})
