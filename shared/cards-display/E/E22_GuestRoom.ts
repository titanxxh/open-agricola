import { MinorImprovement } from '../types'

const CARD_ID = 'E22_GuestRoom'

export const E22_GuestRoom = new MinorImprovement({
  id: CARD_ID,
  name: 'Guest Room',
  deck: 'E',
  number: 22,
  desc: ['Immediately place any amount of <FOOD> from your supply on this card. Once per round, you can discard 1 <FOOD> from this card to place a person from your supply in that round.'],
  cost: { wood: 4, reed: 1 },
  category: 'FARMYARD_-_PLACE_FOR_PERSON',
})
