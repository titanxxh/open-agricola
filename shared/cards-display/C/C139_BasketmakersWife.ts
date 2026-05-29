import { Occupation } from '../types'

const CARD_ID = 'C139_BasketmakersWife'

export const C139_BasketmakersWife = new Occupation({
  id: CARD_ID,
  name: "Basketmaker's Wife",
  deck: "C",
  number: 139,
  category: "FOOD_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <REED> and 1 <FOOD>. At any time, you can turn 1 <REED> into 2 <FOOD>."],
  players: "3+",
  waresSalesmanGains: [{ reed: 2 }],
  exchanges: [
    { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
  ],
})
