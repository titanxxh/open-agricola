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
