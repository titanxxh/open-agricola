import type { DraftPool, DraftStageKind, DraftState } from '../draft/types'

type Progress = { kept: DraftPool; targets: { occ: number; minor: number } }
export type DraftSeatProgress = Progress & (
  | { kind: 'finished' }
  | { kind: 'waiting'; stage: DraftStageKind; stageIndex: number; round: number; totalRounds: number }
  | { kind: 'selecting'; stage: DraftStageKind; stageIndex: number; round: number; totalRounds: number;
      opportunityKey: string; pool: DraftPool }
)

export function draftSeatProgress(draft: DraftState, playerId: string): DraftSeatProgress {
  const kept: DraftPool = { occ: [], minor: [] }
  const targets = { occ: 0, minor: 0 }
  for (const stage of draft.stages) {
    const seat = stage.seats[playerId]
    if (seat) {
      kept.occ.push(...seat.kept.occ)
      kept.minor.push(...seat.kept.minor)
    }
    if (stage.kind === 'standard' || stage.kind === 'occupation') targets.occ += stage.totalRounds
    if (stage.kind !== 'occupation') targets.minor += stage.totalRounds
  }
  for (const [stageIndex, stage] of draft.stages.entries()) {
    const seat = stage.seats[playerId]
    if (!seat) continue
    const picked = stage.kind === 'standard' || stage.kind === 'occupation' ? seat.kept.occ.length : seat.kept.minor.length
    if (picked >= stage.totalRounds) continue
    const round = picked + 1
    const pool = seat.inbox[round]
    const progress = { kept, targets, stage: stage.kind, stageIndex, round, totalRounds: stage.totalRounds }
    return pool
      ? { ...progress, kind: 'selecting', opportunityKey: `${stageIndex}:${round}`, pool }
      : { ...progress, kind: 'waiting' }
  }
  return { kind: 'finished', kept, targets }
}
