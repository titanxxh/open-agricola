import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E23_Apiary'

// E23 Apiary: At the end of each work phase, you can sow exactly 1 crop on 1 field.
// BGA: EndWorkPhase → we use onBeforeReturnHome
registerCardEffect({
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
})

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
