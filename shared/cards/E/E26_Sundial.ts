import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E26_Sundial'

const TRIGGER_ROUNDS = new Set([7, 9])

export const E26_Sundial = new MinorImprovement({
  id: CARD_ID,
  name: 'Sundial',
  deck: 'E',
  number: 26,
  category: 'ACTION',
  desc: ['At the end of the work phases of rounds 7 and 9, you can take a __Sow__ action without placing a person.'],
  cost: { wood: 1 },
})

export const E26_Sundial_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
