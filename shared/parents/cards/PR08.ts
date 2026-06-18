import type { MotherCardDefinition } from '../types'

export const PR08 = {
  id: 'PR08',
  kind: 'mother',
  score: 0.5,
  round: 3,
  gain: { type: 'resource', resource: 'stone', amount: 1 },
  text: 'Place 1 stone on round space 3. At the start of that round, you get the stone.',
  assets: { front: 'PR08.png', back: 'mother' },
} as const satisfies MotherCardDefinition
