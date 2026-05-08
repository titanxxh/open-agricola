import { Occupation } from '../types'

const CARD_ID = 'A121_ClayPuncher'

export const A121_ClayPuncher = new Occupation({
  id: CARD_ID,
  name: "Clay Puncher",
  deck: "A",
  number: 121,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "When you play this card and each time after you use a __Lessons__ action space or the __Clay Pit__ accumulation space, you get 1 <CLAY>.",
  ],
  cost: {},
  players: "1+",
  newSet: true,
})
