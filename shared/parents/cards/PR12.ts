import type { MotherCardDefinition } from '../types'

export const PR12 = {
  id: 'PR12',
  kind: 'mother',
  score: 0.9,
  round: 1,
  gain: { type: 'resource', resource: 'clay', amount: 1 },
  text: 'Place 1 clay on round space 1. At the start of that round, you get the clay.',
  assets: { front: 'PR12.png', back: 'mother' },
} as const satisfies MotherCardDefinition
