import { PlayerActionCard } from '../types'

const CARD_ID = 'D23_PioneeringSpirit'

export const D23_PioneeringSpirit = new PlayerActionCard({
  id: CARD_ID,
  name: "Pioneering Spirit",
  deck: "D",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["This card is an action space for you only. In rounds 3-5, it provides a __Renovation__ action. In rounds 6-8, it provides your choice of 1 <VEGETABLE>, <PIG>, or <CATTLE>."],
  cost: {},
})
