import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C72_FestivalPlanning'

// BGA: Carry out private field phase (reap), then get a Major or Minor Improvement action.
// Simplified: grant an optional improvement-any action (reap phase not supported separately).
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'reap',
          optional: true,
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf' as const,
          actionId: 'improvement-any',
          optional: true,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

export const C72_FestivalPlanning = new MinorImprovement({
  id: CARD_ID,
  name: "Festival Planning",
  deck: "C",
  number: 72,
  category: "CROP_PROVIDER",
  desc: ["When you play this card, immediately carry out the field phase on your farmyard only (this is not a harvest). Afterwards, you get a __Major or Minor Improvement__ action."],
  cost: { food: 1 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
