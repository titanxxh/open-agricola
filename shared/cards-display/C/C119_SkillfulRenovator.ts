import { Occupation } from '../types'

const CARD_ID = 'C119_SkillfulRenovator'

export const C119_SkillfulRenovator = new Occupation({
  id: CARD_ID,
  name: 'Skillful Renovator',
  deck: 'C',
  number: 119,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. Each time after you renovate, you get a number of <WOOD> equal to the number of people you placed that round.',
  ],
  cost: {},
  players: '1+',
})
