import { Occupation } from '../types'

export const E159_OldMiser = new Occupation({
  id: "E159_OldMiser",
  name: "Old Miser",
  deck: "E",
  number: 159,
  category: "FOOD",
  desc: ["In the feeding phase of each harvest, each of your people requires 1 less <FOOD>. During scoring, your people are worth 2 points each instead of 3."],
  cost: {},
  players: "4+",
})
