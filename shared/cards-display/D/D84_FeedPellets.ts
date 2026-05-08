import { MinorImprovement } from '../types'

const CARD_ID = 'D84_FeedPellets'

export const D84_FeedPellets = new MinorImprovement({
  id: CARD_ID,
  name: "Feed Pellets",
  deck: "D",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ['When you play this card, you immediately get 1 <SHEEP>. In the feeding phase of each harvest, you can exchange exactly 1 <VEGETABLE> for 1 animal of a type you already have.'],
  cost: {},
})
