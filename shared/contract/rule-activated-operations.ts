import type { Resource } from './types'

export type RuleActivatedOperation =
  | { kind: 'put-on-action-space'; spaceId: string; resources: Partial<Resource>; occurrencesFact?: string }
  | { kind: 'supply-worker-placement' }
  | { kind: 'move-worker-from-space'; spaceId: string }
  | { kind: 'card-fact-refund'; fact: string; divisor: number; resource: keyof Resource }
  | { kind: 'take-stored-resources'; resources: readonly (keyof Resource)[] }
  | { kind: 'harvest-selected-supply-reward'; crop: 'grain' | 'vegetable'; selectionFact: string; applicationTag: string; excludedTag: string }
  | { kind: 'supply-worker-turn' }
  | { kind: 'release-reserved-worker'; workerFact: string }
  | { kind: 'gain-per-building-resource-collected'; resource: keyof Resource; perBuildingResource: number }
  | { kind: 'skip-next-turns'; countFact: string }
