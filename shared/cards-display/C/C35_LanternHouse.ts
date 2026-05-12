import { MinorImprovement } from '../types'

const CARD_ID = 'C35_LanternHouse'

export const C35_LanternHouse = new MinorImprovement({
  id: CARD_ID,
  name: "Lantern House",
  deck: "C",
  number: 35,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 negative <SCORE> for each card left in your hand. You cannot discard cards from your hand unplayed. If you already have, you cannot play this card."],
  cost: { wood: 1 },
  vp: 7,
  // BGA parity: requires no occupations played before buying this minor.
  // Ref: bga-agricola/modules/php/Cards/C/C35_LanternHouse.php
  prerequisite: "No Occupations",
  occupationPrerequisites: { max: 0 },
  extraVp: true,
})
