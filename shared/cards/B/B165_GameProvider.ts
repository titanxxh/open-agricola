import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B165_GameProvider'

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainFields = player.fields.filter(f => f.crop === 'grain' && f.remaining > 0)
    if (grainFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'field-select',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        fieldFilter: 'has-grain',
        maxSelections: 4,
        fieldEffect: 'discard-grain-for-pigs',
      },
    }
  },
})

export const B165_GameProvider = new Occupation({
  id: "B165_GameProvider",
  name: "Game Provider",
  deck: "B",
  number: 165,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Immediately before each harvest, you can discard 1/3/4 <GRAIN> from different fields to get 1/2/3 <PIG>."],
  cost: {},
  players: "4+",
})
