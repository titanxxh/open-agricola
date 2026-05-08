import { Occupation } from '../types'

const CARD_ID = 'C166_CattleWhisperer'

export const C166_CattleWhisperer = new Occupation({
  id: CARD_ID,
  name: "Cattle Whisperer",
  deck: "C",
  number: 166,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Add 5 and 8 to the current round and place 1 <CATTLE> on each corresponding round space. At the start of these rounds, you get the <CATTLE>."],
  players: "4+",
})
