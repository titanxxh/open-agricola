import type { SoloCreationConfiguration, SoloCreationIssue, ResolvedWorkshopSource } from '../../shared/contract/game-creation'

/**
 * Games use only the cards in the deployed build (ADR 0052). A retained
 * configuration that still names a Workshop card needs adjustment; an empty
 * `customCardIds` resolves to no sources.
 */
export function resolveSoloWorkshopSources(configuration: SoloCreationConfiguration): {
  resolvedWorkshopSources: ResolvedWorkshopSource[]
  issues: SoloCreationIssue[]
} {
  return {
    resolvedWorkshopSources: [],
    issues: configuration.customCardIds.map(workshopCardId => ({ workshopCardId, reason: 'not-live' as const })),
  }
}
