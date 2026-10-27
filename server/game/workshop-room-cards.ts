import type { CustomCardData } from '../../shared/cards/session-card-context'
import type { CustomCodeManifest } from '../../shared/custom-code/types'
import { cardAllowedForPlayerCount } from '../../shared/cards/player-count-filter'
import type { SoloCreationConfiguration, SoloCreationIssue, ResolvedWorkshopSource } from '../../shared/contract/game-creation'
import type { PostgresDatabase } from '../database/postgres'
import { loadLiveDraft, type WorkshopDraft } from '../workshop-drafts'
import { isLoadableLive } from '../workshop-status'

export const workshopDraftToCustomCard = (draft: WorkshopDraft): CustomCardData => ({
  cardType: draft.cardType,
  // The approved persistence DTO carries the already admitted card definition.
  cardJson: draft.cardJson as unknown as CustomCardData['cardJson'],
  effectCode: draft.effectCode,
  compiledCode: draft.compiledCode,
  codeManifest: draft.codeManifest as CustomCodeManifest | null,
  artUrl: draft.artUrl,
})

/** Resolve every explicit source, retaining unavailable choices for correction. */
export async function resolveSoloWorkshopCards(db: Pick<PostgresDatabase, 'prepare' | 'transaction'>, configuration: SoloCreationConfiguration) {
  const cards: CustomCardData[] = []
  const resolvedWorkshopSources: ResolvedWorkshopSource[] = []
  const issues: SoloCreationIssue[] = []
  for (const workshopCardId of configuration.customCardIds) {
    try {
      await db.transaction(async () => {
        const row = await db.prepare('SELECT card_id, review_status, live, built_in, approved_version_id FROM workshop_cards WHERE id=? FOR SHARE')
          .get<{ card_id: string; review_status: string; live: number; built_in: number; approved_version_id: string | null }>(workshopCardId)
        if (!row) { issues.push({ workshopCardId, reason: 'missing' }); return }
        if (row.review_status === 'merged' && row.built_in === 1) {
          issues.push({ workshopCardId, logicalCardId: row.card_id, reason: 'community-takeover' }); return
        }
        if (!isLoadableLive(row) || !row.approved_version_id) {
          issues.push({ workshopCardId, logicalCardId: row.card_id, reason: 'not-live' }); return
        }
        const card = workshopDraftToCustomCard(await loadLiveDraft(db, workshopCardId))
        if (!configuration.enableCommunityDeck || !cardAllowedForPlayerCount(card.cardJson.players, 1)
          || (card.cardJson.requiresFarmersOfTheMoor && !configuration.enableFarmersOfTheMoor)) {
          issues.push({ workshopCardId, logicalCardId: card.cardJson.id, reason: 'not-applicable' }); return
        }
        cards.push(card)
        resolvedWorkshopSources.push({ workshopCardId, logicalCardId: card.cardJson.id, approvedVersionId: row.approved_version_id })
      })()
    } catch {
      issues.push({ workshopCardId, reason: 'load-failed' })
    }
  }
  return { cards, resolvedWorkshopSources, issues }
}
