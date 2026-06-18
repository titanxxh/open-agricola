import type { MotherCardDefinition } from '../types'

export const PR10 = {
  id: 'PR10',
  kind: 'mother',
  score: 0.7,
  round: 1,
  gain: { type: 'resource', resource: 'wood', amount: 1 },
  text: 'Place 1 wood on round space 1. At the start of that round, you get the wood.',
  assets: { front: 'PR10.png', back: 'mother' },
} as const satisfies MotherCardDefinition
