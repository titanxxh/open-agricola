import { Occupation } from '../types'

const CARD_ID = 'C146_WorkshopAssistant'

export const C146_WorkshopAssistant = new Occupation({
  id: CARD_ID,
  name: "Workshop Assistant",
  deck: "C",
  number: 146,
  category: "GOODS_PROVIDER",
  desc: [
    'Place unique pairs of different building resources on this card, one for each improvement you have built. Each time another player renovates, you may move one such pair to your supply.',
  ],
  cost: {},
  players: "3+",
})
