import type { MotherCardDefinition } from '../types'

export const PR05 = {
  id: 'PR05',
  kind: 'mother',
  score: 0.2,
  round: 4,
  gain: { type: 'resource', resource: 'sheep', amount: 1 },
  text: 'Place 1 sheep on round space 4. At the start of that round, you get the sheep.',
  assets: { front: 'PR05.png', back: 'mother' },
} as const satisfies MotherCardDefinition
