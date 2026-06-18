import type { MotherCardDefinition } from '../types'

export const PR03 = {
  id: 'PR03',
  kind: 'mother',
  score: 0,
  round: 8,
  gain: { type: 'resource', resource: 'cattle', amount: 1 },
  text: 'Place 1 cattle on round space 8. At the start of that round, you get the cattle.',
  assets: { front: 'PR03.png', back: 'mother' },
} as const satisfies MotherCardDefinition
