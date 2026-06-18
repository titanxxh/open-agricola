import type { MotherCardDefinition } from '../types'

export const PR02 = {
  id: 'PR02',
  kind: 'mother',
  score: -0.25,
  round: 12,
  gain: { type: 'field', amount: 1 },
  text: 'Place 1 field tile on round space 12. At the start of that round, you can plow the field.',
  assets: { front: 'PR02.png', back: 'mother' },
} as const satisfies MotherCardDefinition
