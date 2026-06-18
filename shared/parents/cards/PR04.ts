import type { MotherCardDefinition } from '../types'

export const PR04 = {
  id: 'PR04',
  kind: 'mother',
  score: 0.1,
  round: 7,
  gain: { type: 'resource', resource: 'boar', amount: 1 },
  text: 'Place 1 wild boar on round space 7. At the start of that round, you get the wild boar.',
  assets: { front: 'PR04.png', back: 'mother' },
} as const satisfies MotherCardDefinition
