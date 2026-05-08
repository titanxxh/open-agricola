import { Occupation } from '../types'

const CARD_ID = 'C165_GameCatcher'

export const C165_GameCatcher = new Occupation({
  id: CARD_ID,
  name: "Game Catcher",
  deck: "C",
  number: 165,
  category: "LIVESTOCK_PROVIDER",
  desc: ["When you play this card, pay 1 <FOOD> for each remaining harvest to immediately get 1 <CATTLE> and 1 <PIG>."],
  players: "4+",
})
