import type { MotherCardDefinition } from '../types'

export const PR06 = {
  id: 'PR06',
  kind: 'mother',
  score: 0.3,
  round: 7,
  gain: { type: 'resource', resource: 'vegetable', amount: 1 },
  text: 'Place 1 vegetable on round space 7. At the start of that round, you get the vegetable.',
  assets: { front: 'PR06.png', back: 'mother' },
} as const satisfies MotherCardDefinition
