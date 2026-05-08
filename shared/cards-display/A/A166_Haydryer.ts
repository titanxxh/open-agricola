import { Occupation } from '../types'

const CARD_ID = 'A166_Haydryer'

export const A166_Haydryer = new Occupation({
  id: CARD_ID,
  name: "Haydryer",
  deck: "A",
  number: 166,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Immediately before each harvest, you can buy 1 <CATTLE> for 4 <FOOD> minus 1 <FOOD> for each pasture you have. (The minimum cost is 0)."],
  cost: {},
  players: "4+",
})
