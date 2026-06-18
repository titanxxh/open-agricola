import type { MotherCardDefinition } from '../types'

export const PR11 = {
  id: 'PR11',
  kind: 'mother',
  score: 0.8,
  round: 1,
  gain: { type: 'resource', resource: 'food', amount: 1 },
  text: 'Place 1 food on round space 1. At the start of that round, you get the food.',
  assets: { front: 'PR11.png', back: 'mother' },
} as const satisfies MotherCardDefinition
