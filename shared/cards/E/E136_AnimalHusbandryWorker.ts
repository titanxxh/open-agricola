import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E136_AnimalHusbandryWorker'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const myPastures = player.pastures.length
    const maxPastures = Math.max(...state.players.map((p) => p.pastures.length))
    return myPastures === maxPastures && myPastures > 0 ? 2 : 0
  },
})

export const E136_AnimalHusbandryWorker = new Occupation({
  id: CARD_ID,
  name: "Animal Husbandry Worker",
  deck: "E",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2 bonus <SCORE> if you have the most pastures (shared)."],
  cost: {},
  players: "3+",
})
