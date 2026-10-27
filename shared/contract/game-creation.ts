export type SoloHandMode = 'random' | 'choose-7'

/** Accepted choices only. Seeds, dealt cards and executable code are not configuration. */
export type SoloCreationConfiguration = {
  kind: 'standard-solo'
  maxPlayers: 1
  soloHandMode: SoloHandMode
  enableCommunityDeck: boolean
  customCardIds: string[]
  officialCardPool: 'default-implemented-A-E'
  enableParentCards: boolean
  draftParents: boolean
  enableThroughTheSeasons: boolean
  enableFarmersOfTheMoor: boolean
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const isSoloCreationConfiguration = (value: unknown): value is SoloCreationConfiguration => object(value)
  && value.kind === 'standard-solo' && value.maxPlayers === 1
  && (value.soloHandMode === 'random' || value.soloHandMode === 'choose-7')
  && value.officialCardPool === 'default-implemented-A-E'
  && typeof value.enableCommunityDeck === 'boolean'
  && typeof value.enableParentCards === 'boolean' && typeof value.draftParents === 'boolean'
  && typeof value.enableThroughTheSeasons === 'boolean' && typeof value.enableFarmersOfTheMoor === 'boolean'
  && Array.isArray(value.customCardIds) && value.customCardIds.every(id => typeof id === 'string')

export type ResolvedWorkshopSource = {
  workshopCardId: string
  logicalCardId: string
  approvedVersionId: string
}

export type GameCreationRecord = {
  configuration: SoloCreationConfiguration
  resolvedWorkshopSources: ResolvedWorkshopSource[]
}

export type SoloCreationIssue = {
  workshopCardId: string
  reason: 'missing' | 'not-live' | 'load-failed' | 'not-applicable' | 'community-takeover'
  logicalCardId?: string
}

export type SoloCreationErrorCode = 'login_required' | 'not_participant' | 'source_not_completed'
  | 'source_not_solo' | 'source_removed' | 'creation_configuration_unavailable' | 'creation_requires_adjustment'

export type SoloCreationConfigurationResponse =
  | { ok: true; configuration: SoloCreationConfiguration; issues: SoloCreationIssue[] }
  | { ok: false; code: SoloCreationErrorCode; message: string }
