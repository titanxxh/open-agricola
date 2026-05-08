import { Occupation } from '../types'

export const D158_BeanCounter = new Occupation({
  id: "D158_BeanCounter",
  name: "Bean Counter",
  deck: "D",
  number: 158,
  category: "FOOD_PROVIDER",
  desc: [
    'Each time you use an action space on round spaces 1 to 8, place 1 <FOOD> on this card. Each time this card has 3 <FOOD> on it, move the <FOOD> to your supply.',
  ],
  cost: {},
  players: "4+",
})
