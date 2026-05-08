import { Occupation } from '../types'

const CARD_ID = 'C161_PotatoDigger'

export const C161_PotatoDigger = new Occupation({
  id: CARD_ID,
  name: "Potato Digger",
  deck: "C",
  number: 161,
  category: "CROP_PROVIDER",
  desc: ["When you play this card, if you have at least 2/4/5 unplanted field tiles, you immediately get 1/2/3 <VEGETABLE>."],
  players: "4+",
  newSet: true,
})
