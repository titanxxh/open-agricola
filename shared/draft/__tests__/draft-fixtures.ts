import type { DraftPickPayload, DraftState } from '../types'
import { draftSeatProgress } from '../../projections/draft-progress'

export function firstDraftPick(draft: DraftState, playerId: string): DraftPickPayload {
  const progress = draftSeatProgress(draft, playerId)
  if (progress.kind !== 'selecting') throw new Error(`no draft choice for ${playerId}`)
  return {
    opportunityKey: progress.opportunityKey,
    ...(progress.stage === 'standard' || progress.stage === 'occupation' ? { occCardId: progress.pool.occ[0] } : {}),
    ...(progress.stage !== 'occupation' ? { minorCardId: progress.pool.minor[0] } : {}),
  }
}
