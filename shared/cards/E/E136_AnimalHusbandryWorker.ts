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
  desc: ['If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD> and a __Build Fences__ action. During scoring, each player with the most pastures gets 2 <SCORE>.'],
  cost: {},
  players: "3+",
})
