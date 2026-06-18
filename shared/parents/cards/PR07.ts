import type { MotherCardDefinition } from '../types'

export const PR07 = {
  id: 'PR07',
  kind: 'mother',
  score: 0.4,
  round: 4,
  gain: { type: 'resource', resource: 'grain', amount: 1 },
  text: 'Place 1 grain on round space 4. At the start of that round, you get the grain.',
  assets: { front: 'PR07.png', back: 'mother' },
} as const satisfies MotherCardDefinition
