import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E23_Apiary'

export const E23_Apiary = new MinorImprovement({
  id: CARD_ID,
  name: 'Apiary',
  deck: 'E',
  number: 23,
  category: 'ACTION',
  desc: ['At the end of each work phase, you can sow exactly 1 crop on 1 field.'],
  cost: {},
  prerequisite: '4 Occupations',
  occupationPrerequisites: { min: 4 },
  evenMoreSet: true,
})

export const E23_Apiary_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (_state, player) => {
    if (player.fields.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', params: { max: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
