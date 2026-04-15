import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E26_Sundial'

const TRIGGER_ROUNDS = new Set([7, 9])

// E26 Sundial: At the end of the work phases of rounds 7 and 9, you can take a Sow action.
// BGA: EndWorkPhase → we use onBeforeReturnHome
registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (!TRIGGER_ROUNDS.has(state.round)) return
    if (player.fields.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID },
      ],
    }
  },
})

export const E26_Sundial = new MinorImprovement({
  id: CARD_ID,
  name: 'Sundial',
  deck: 'E',
  number: 26,
  category: 'ACTION',
  desc: ['At the end of the work phases of rounds 7 and 9, you can take a __Sow__ action without placing a person.'],
  cost: { wood: 1 },
})
