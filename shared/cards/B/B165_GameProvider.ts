import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import { fieldTopStack, fieldDecrementTop } from '../../game/field'

const CARD_ID = 'B165_GameProvider'

registerFieldEffect('discard-grain-for-pigs', ({ player, fields }) => {
  let grainsRemoved = 0
  for (const key of fields) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (top && top.kind === 'grain' && top.remaining > 0) {
      fieldDecrementTop(field)
      grainsRemoved++
    }
  }
  const pigs = grainsRemoved >= 4 ? 3 : grainsRemoved >= 3 ? 2 : grainsRemoved >= 1 ? 1 : 0
  player.resources.boar = (player.resources.boar ?? 0) + pigs
})

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const grainFields = player.fields.filter(f => fieldTopStack(f)?.kind === 'grain')
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
