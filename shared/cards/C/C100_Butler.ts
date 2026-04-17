import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C100_Butler'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    return player.rooms > player.familySize ? 4 : 0
  },
})

export const C100_Butler = new Occupation({
  id: CARD_ID,
  name: "Butler",
  deck: "C",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["If you play this card in round 11 or before, during scoring, you get 4 bonus <SCORE> if you then have more rooms than people."],
  cost: {},
  players: "1+",
  maxRound: 11,
})
