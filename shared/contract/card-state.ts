import type { CardResourceStats, CropStack, Resource, SupplyTokenKey } from './types'
import type { AnimalKey } from './animals'

/** Derived rule facts. Storage and interpretation belong to the contributing Card Source. */
export type CardRuleContributions = {
  reservedSupply?: Partial<Record<SupplyTokenKey, number>>
  unusedSpaceReduction?: number
}

export type PublicCardMarker = {
  id: string
  label: string
  sourceCardId: string
  score?: number
  sourcePlayerId?: string
}

/** Public display facts derived by the owning source. The map key carries source identity. */
export type CardStatePresentation = {
  infobox?: string
  counters?: Record<string, number>
  stack?: string[]
  resourceStats?: CardResourceStats
  resourceGroups?: Partial<Resource>[]
  cropLayers?: { stack: CropStack; slotIndex?: number; top?: boolean }[]
  animalMarkers?: { animal: AnimalKey; count: number; pose?: 'lying' }[]
  heldWorkerId?: string
  reservedActionSpaces?: string[]
  actionSpaceAttachments?: { spaceId: string; resources: Partial<Resource> }[]
  farmTerrainMarkers?: { row: number; col: number; kind: string; workerId?: string }[]
  publicCardMarkers?: PublicCardMarker[]
  completedTier?: 1 | 2 | 3
}

/** Source-owned opt-ins to established display adapters. Internal keys are never enumerated. */
export type CardPresentationDeclaration = {
  counters?: readonly string[]
  stack?: boolean
  cardFields?: boolean
  heldWorker?: boolean
  reservedActionSpaces?: boolean
  actionSpaceAttachments?: boolean
  farmTerrainMarkers?: boolean
  publicCardMarkers?: boolean
}
