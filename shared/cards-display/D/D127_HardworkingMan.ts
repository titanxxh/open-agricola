import { PlayerActionCard } from '../types'

const CARD_ID = 'D127_HardworkingMan'

export const D127_HardworkingMan = new PlayerActionCard({
  id: CARD_ID,
  name: "Hardworking Man",
  deck: "D",
  number: 127,
  category: "FARM_PLANNER",
  desc: ["This card is an action space for you only. If each other player has more rooms than you, it provides the __Day Laborer__, __Building Rooms__, and __Major Improvement__ actions (all three)."],
  cost: {},
  players: "3+",
})
