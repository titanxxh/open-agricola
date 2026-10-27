import type { GameCreationRecord, SoloCreationConfiguration, ResolvedWorkshopSource } from '../../shared/contract/game-creation'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const configuration = (value: unknown): value is SoloCreationConfiguration => object(value)
  && value.kind === 'standard-solo' && value.maxPlayers === 1
  && (value.soloHandMode === 'random' || value.soloHandMode === 'choose-7')
  && value.officialCardPool === 'default-implemented-A-E'
  && typeof value.enableCommunityDeck === 'boolean'
  && typeof value.enableParentCards === 'boolean' && typeof value.draftParents === 'boolean'
  && typeof value.enableThroughTheSeasons === 'boolean' && typeof value.enableFarmersOfTheMoor === 'boolean'
  && Array.isArray(value.customCardIds) && value.customCardIds.every(id => typeof id === 'string')

const reference = (value: unknown): value is ResolvedWorkshopSource => object(value)
  && typeof value.workshopCardId === 'string' && typeof value.logicalCardId === 'string'
  && typeof value.approvedVersionId === 'string'

export const parseGameCreationRecord = (json: string): GameCreationRecord | null => {
  try {
    const value: unknown = JSON.parse(json)
    if (!object(value) || !configuration(value.configuration) || !Array.isArray(value.resolvedWorkshopSources)
      || !value.resolvedWorkshopSources.every(reference)) return null
    return { configuration: value.configuration, resolvedWorkshopSources: value.resolvedWorkshopSources }
  } catch { return null }
}
