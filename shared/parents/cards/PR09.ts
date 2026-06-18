import type { MotherCardDefinition } from '../types'

export const PR09 = {
  id: 'PR09',
  kind: 'mother',
  score: 0.6,
  round: 5,
  gain: { type: 'resource', resource: 'reed', amount: 1 },
  text: 'Place 1 reed on round space 5. At the start of that round, you get the reed.',
  assets: { front: 'PR09.png', back: 'mother' },
} as const satisfies MotherCardDefinition
