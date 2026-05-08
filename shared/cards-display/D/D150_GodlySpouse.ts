import { Occupation } from '../types'

const CARD_ID = 'D150_GodlySpouse'

export const D150_GodlySpouse = new Occupation({
  id: CARD_ID,
  name: "Godly Spouse",
  deck: "D",
  number: 150,
  category: "ACTIONS_BOOSTER",
  desc: [
    'Each time you take a __Family Growth__ action with the second person you place in a round, return the first person you placed home, unless it is on the __Meeting Place__ action space.',
  ],
  cost: {},
  players: "4+",
})
