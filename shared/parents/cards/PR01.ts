import type { MotherCardDefinition } from '../types'

export const PR01 = {
  id: 'PR01',
  kind: 'mother',
  score: -0.75,
  round: 2,
  gain: { type: 'stable', amount: 1, fromSupply: true, freeBuild: true },
  text: 'Place 1 stable from your supply on round space 2. At the start of that round, you can build the stable at no cost.',
  assets: { front: 'PR01.png', back: 'mother' },
} as const satisfies MotherCardDefinition
