import { parseTeamConfiguration, type TeamConfiguration } from './team'

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
  enableMoorBalanceRules: boolean
}

export type TeamCreationConfiguration = Omit<SoloCreationConfiguration, 'kind' | 'maxPlayers' | 'soloHandMode'> & {
  kind: 'team'
  maxPlayers: 4 | 6
  teamConfig: TeamConfiguration
  enableSnakeOpening: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal: boolean
} & ({ draftMode?: never; draftPoolSize?: never } | { draftMode: 'simultaneous'; draftPoolSize: number })

export type GameCreationConfiguration = SoloCreationConfiguration | TeamCreationConfiguration

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const commonConfiguration = (value: Record<string, unknown>): boolean =>
  value.officialCardPool === 'default-implemented-A-E'
  && typeof value.enableCommunityDeck === 'boolean'
  && typeof value.enableParentCards === 'boolean' && typeof value.draftParents === 'boolean'
  && typeof value.enableThroughTheSeasons === 'boolean' && typeof value.enableFarmersOfTheMoor === 'boolean'
  && typeof value.enableMoorBalanceRules === 'boolean'
  && (!value.enableMoorBalanceRules || value.enableFarmersOfTheMoor)
  && Array.isArray(value.customCardIds) && value.customCardIds.every(id => typeof id === 'string')

export const isSoloCreationConfiguration = (value: unknown): value is SoloCreationConfiguration => object(value)
  && value.kind === 'standard-solo' && value.maxPlayers === 1
  && (value.soloHandMode === 'random' || value.soloHandMode === 'choose-7') && commonConfiguration(value)

export function isTeamCreationConfiguration(value: unknown): value is TeamCreationConfiguration {
  if (!object(value) || value.kind !== 'team' || (value.maxPlayers !== 4 && value.maxPlayers !== 6)
    || !commonConfiguration(value) || typeof value.enableSnakeOpening !== 'boolean'
    || typeof value.allowIncompleteFarmersOfTheMoorMinorDeal !== 'boolean') return false
  if (value.draftMode === undefined ? value.draftPoolSize !== undefined
    : value.draftMode !== 'simultaneous' || typeof value.draftPoolSize !== 'number'
      || !Number.isInteger(value.draftPoolSize) || value.draftPoolSize < 7 || value.draftPoolSize > 10) return false
  try { return parseTeamConfiguration(value.teamConfig, value.maxPlayers) !== undefined }
  catch { return false }
}

export const isGameCreationConfiguration = (value: unknown): value is GameCreationConfiguration =>
  isSoloCreationConfiguration(value) || isTeamCreationConfiguration(value)

export type ResolvedWorkshopSource = {
  workshopCardId: string
  logicalCardId: string
  approvedVersionId: string
}

export type GameCreationRecord = {
  configuration: GameCreationConfiguration
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

export type GameCreationConfigurationResponse =
  | { ok: true; configuration: GameCreationConfiguration; issues: SoloCreationIssue[] }
  | Extract<SoloCreationConfigurationResponse, { ok: false }>
