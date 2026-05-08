import { Occupation } from '../types'

const CARD_ID = 'D94_HenpeckedHusband'

export const D94_HenpeckedHusband = new Occupation({
  id: CARD_ID,
  name: "Henpecked Husband",
  deck: "D",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you take a __Build Rooms__ action with the second person you place, return the first person you placed home, unless it is on the __Meeting Place__ action space."],
  cost: {},
  players: "1+",
})
