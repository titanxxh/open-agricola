import { MinorImprovement } from '../types'

const CARD_ID = 'C3_CarriageTrip'

export const C3_CarriageTrip = new MinorImprovement({
  id: CARD_ID,
  name: "Carriage Trip",
  deck: "C",
  number: 3,
  category: "ACTIONS_BOOSTER",
  desc: ["If you play this card in the work phase, you can immediately place another person."],
  cost: {},
  passing: true,
  prerequisite: "1 Person yet to Place",
})
