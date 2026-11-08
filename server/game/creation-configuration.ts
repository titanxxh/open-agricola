import { isSoloCreationConfiguration, type GameCreationRecord, type ResolvedWorkshopSource } from '../../shared/contract/game-creation'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const reference = (value: unknown): value is ResolvedWorkshopSource => object(value)
  && typeof value.workshopCardId === 'string' && typeof value.logicalCardId === 'string'
  && typeof value.approvedVersionId === 'string'

export const parseGameCreationRecord = (json: string): GameCreationRecord | null => {
  try {
    const value: unknown = JSON.parse(json)
    if (!object(value) || !isSoloCreationConfiguration(value.configuration) || !Array.isArray(value.resolvedWorkshopSources)
      || !value.resolvedWorkshopSources.every(reference)) return null
    return { configuration: value.configuration, resolvedWorkshopSources: value.resolvedWorkshopSources }
  } catch { return null }
}
