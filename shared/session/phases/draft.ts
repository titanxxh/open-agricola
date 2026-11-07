import type { DraftPickPayload } from '../../draft/types'
import { processSubmit } from '../../draft/draft-manager'
import { draftSeatProgress } from '../../projections/draft-progress'
import { recordDraftPick } from '../stats'
import type { GameCore, SessionResponse } from '../session-core'
import type { PrivateGameEvent } from '../../contract/protocol/game'
import { findPlayerById } from '../../domain/player'

export const submitDraftPick = (core: GameCore, playerId: string, pick: DraftPickPayload): SessionResponse => {
  const player = findPlayerById(core.state, playerId)
  const last = player?.lastDraftSubmission
  if (last && last.opportunityKey === pick.opportunityKey && last.occCardId === pick.occCardId && last.minorCardId === pick.minorCardId) {
    return core.emitResponse(true)
  }
  if (core.state.phase !== 'draft' || !core.state.draft) return core.emitResponse(false, 'not in draft phase')
  const result = processSubmit(core.state.draft, playerId, pick)
  if (result.kind === 'rejected') return core.emitResponse(false, result.error)
  core.setDraftState(result.draft)
  if (player) player.lastDraftSubmission = { ...pick }
  const privateEvents: PrivateGameEvent[] = []
  for (const actual of result.picks) {
    const pickedPlayer = findPlayerById(core.state, actual.playerId)
    if (pickedPlayer) {
      if (actual.pick.occCardId) recordDraftPick(pickedPlayer, actual.pick.occCardId, actual.round)
      if (actual.pick.minorCardId) recordDraftPick(pickedPlayer, actual.pick.minorCardId, actual.round)
    }
    const progress = draftSeatProgress(result.draft, actual.playerId)
    privateEvents.push({
      schemaVersion: 1, type: 'private.draftUpdated', recipientPlayerId: actual.playerId,
      round: actual.round, totalRounds: actual.totalRounds, picked: actual.pick,
      poolCounts: { occ: progress.kind === 'selecting' ? progress.pool.occ.length : 0, minor: progress.kind === 'selecting' ? progress.pool.minor.length : 0 },
      keptCounts: { occ: progress.kept.occ.length, minor: progress.kept.minor.length },
      advanced: progress.kind === 'selecting' && progress.stageIndex === actual.stageIndex && progress.round === actual.round + 1,
      finished: result.finished,
    })
  }
  if (result.finished) {
    core.applyDraftFinalize()
    for (const p of core.state.players) privateEvents.push({
      schemaVersion: 1, type: 'private.handChanged', recipientPlayerId: p.id,
      cardIds: [...p.occupationHand, ...p.minorHand], cardType: 'mixed', reason: 'draft-finalized',
    })
  }
  return core.emitResponse(true, undefined, privateEvents)
}
