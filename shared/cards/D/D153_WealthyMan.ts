import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D153_WealthyMan'

const harvestGrainFieldThreshold: Record<number, number> = {
  4: 1,
  7: 2,
  9: 3,
  11: 4,
  13: 5,
  14: 6,
}

registerCardEffect({
  id: CARD_ID,
  onStartHarvest: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

    const threshold = harvestGrainFieldThreshold[state.round]
    if (threshold === undefined) return

    const grainFieldCount = player.fields.filter(
      (f) => f.crop === 'grain' && f.remaining > 0,
    ).length
    if (grainFieldCount < threshold) return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
})

export const D153_WealthyMan = new Occupation({
  id: CARD_ID,
  name: "Wealthy Man",
  deck: "D",
  number: 153,
  category: "POINTS_PROVIDER",
  desc: ["At the start of each of the 1st/2nd/3rd/4th/5th/6th harvest, if you have at least 1/2/3/4/5/6 grain fields, you get 1 bonus <SCORE>."],
  cost: {},
  players: "4+",
})
