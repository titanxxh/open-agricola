import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E134_Omnifarmer'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    const stored = (player.cardStates?.[CARD_ID]?.extraData?.storedTypes as number | undefined)
    if (!stored || stored < 2) return 0
    const vpMap = [0, 0, 3, 5, 7, 9]
    return vpMap[Math.min(stored, 5)] ?? 9
  },
})

export const E134_Omnifarmer = new Occupation({
  id: CARD_ID,
  name: "Omnifarmer",
  deck: "E",
  number: 134,
  category: "ACTIONS_BOOSTER",
  desc: ["Each harvest, you can place 1 harvested crop or 1 newborn animal on this card, irretrievably. Once this game, if there are 2/3/4/5 different goods on this, you get 3/5/7/9 bonus <SCORE>."],
  cost: {},
  players: "3+",
})
