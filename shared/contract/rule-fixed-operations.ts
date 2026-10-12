import type { Resource, RuleAmount } from './types'

/** Closed rules whose targets or amounts are chosen only when the scheduled action runs. */
export type RuleFixedOperation =
  | { kind: 'breed-animals'; animals: readonly ('sheep' | 'boar' | 'cattle' | 'horse')[]; requireCapacity: true }
  | { kind: 'take-field-crop'; crop: 'grain' | 'vegetable'; amount: number }
  | { kind: 'expire-extra-room'; fact: string; removeUnhousedWorker: boolean }
  | { kind: 'collect-board-resources'; resources: readonly (keyof Resource)[] }
  | { kind: 'each-space-worker'; spaceId: string; alternativeGain: Partial<Resource> }
  | { kind: 'discounted-action'; actionId: 'renovate-house'; discounts: readonly Partial<Resource>[] }
  | { kind: 'borrow-fences'; maximumPerOpponent: number }
  | { kind: 'bounded-exchange'; maximum: RuleAmount; cost: Partial<Resource>; gain: Partial<Resource>; bonusVp: number; quantity: 'choose' | 'maximum' }
