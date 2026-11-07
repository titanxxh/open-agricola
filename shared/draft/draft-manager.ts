import type { DraftPickPayload, DraftPool, DraftStageSpec, DraftState } from './types'
import type { GameState } from '../contract/types'
import { draftSeatProgress } from '../projections/draft-progress'

export function initDraftState(seatOrder: string[], hands: Record<string, DraftPool>, poolSize: number, totalRounds = 7): DraftState {
  return initStagedDraftState(seatOrder, [{ kind: 'standard', poolSize, totalRounds, pools: hands }])
}

export function initStagedDraftState(seatOrder: string[], stages: DraftStageSpec[]): DraftState {
  if (seatOrder.length === 0 || stages.length === 0) throw new Error('draft requires seats and stages')
  return {
    mode: 'simultaneous', seatOrder: [...seatOrder], lastManualPickerId: null,
    stages: stages.map(stage => {
      if (stage.totalRounds < 1 || stage.totalRounds > stage.poolSize) throw new Error('invalid draft quota')
      return {
        kind: stage.kind, poolSize: stage.poolSize, totalRounds: stage.totalRounds,
        seats: Object.fromEntries(seatOrder.map(id => {
          const pool = stage.pools[id]
          if (!pool || ((stage.kind === 'standard' || stage.kind === 'occupation') && pool.occ.length !== stage.poolSize)
            || (stage.kind !== 'occupation' && pool.minor.length !== stage.poolSize)) {
            throw new Error(`bad initial hand for ${id}`)
          }
          return [id, { kept: { occ: [], minor: [] }, inbox: { 1: structuredClone(pool) } }]
        })),
      }
    }),
  }
}

export type ActualDraftPick = { playerId: string; stageIndex: number; round: number; totalRounds: number; pick: DraftPickPayload }
export type DraftTransition =
  | { kind: 'rejected'; error: string }
  | { kind: 'accepted'; draft: DraftState; picks: ActualDraftPick[]; finished: boolean }

function keepAndPass(draft: DraftState, playerId: string, pick: DraftPickPayload): ActualDraftPick {
  const progress = draftSeatProgress(draft, playerId)
  if (progress.kind !== 'selecting') throw new Error('draft choice has no packet')
  const stage = draft.stages[progress.stageIndex]
  const seat = stage.seats[playerId]
  const pool = progress.pool
  if (pick.occCardId) seat.kept.occ.push(pick.occCardId)
  if (pick.minorCardId) seat.kept.minor.push(pick.minorCardId)
  delete seat.inbox[progress.round]
  if (progress.round < stage.totalRounds) {
    const nextId = draft.seatOrder[(draft.seatOrder.indexOf(playerId) + 1) % draft.seatOrder.length]
    const inbox = stage.seats[nextId].inbox
    if (inbox[progress.round + 1]) throw new Error('draft packet already delivered')
    inbox[progress.round + 1] = {
      occ: pool.occ.filter(id => id !== pick.occCardId),
      minor: pool.minor.filter(id => id !== pick.minorCardId),
    }
  }
  return { playerId, stageIndex: progress.stageIndex, round: progress.round, totalRounds: stage.totalRounds, pick }
}

export function processSubmit(draft: DraftState, playerId: string, pick: DraftPickPayload): DraftTransition {
  if (!draft.seatOrder.includes(playerId)) return { kind: 'rejected', error: `unknown player ${playerId}` }
  const progress = draftSeatProgress(draft, playerId)
  if (progress.kind !== 'selecting' || progress.opportunityKey !== pick.opportunityKey) {
    return { kind: 'rejected', error: 'draft opportunity changed' }
  }
  const needsOcc = progress.stage === 'standard' || progress.stage === 'occupation'
  const needsMinor = progress.stage !== 'occupation'
  if (needsOcc ? !pick.occCardId || !progress.pool.occ.includes(pick.occCardId) : pick.occCardId !== undefined) {
    return { kind: 'rejected', error: 'occ card not in pool' }
  }
  if (needsMinor ? !pick.minorCardId || !progress.pool.minor.includes(pick.minorCardId) : pick.minorCardId !== undefined) {
    return { kind: 'rejected', error: 'minor card not in pool' }
  }
  const next = structuredClone(draft)
  next.lastManualPickerId = playerId
  const picks = [keepAndPass(next, playerId, pick)]
  let changed: boolean
  do {
    changed = false
    for (const id of next.seatOrder) {
      const seat = draftSeatProgress(next, id)
      if (seat.kind !== 'selecting' || seat.round !== seat.totalRounds) continue
      const occ = seat.stage === 'standard' || seat.stage === 'occupation'
      const minor = seat.stage !== 'occupation'
      if ((occ && seat.pool.occ.length !== 1) || (minor && seat.pool.minor.length !== 1)) continue
      picks.push(keepAndPass(next, id, {
        opportunityKey: seat.opportunityKey,
        ...(occ ? { occCardId: seat.pool.occ[0] } : {}),
        ...(minor ? { minorCardId: seat.pool.minor[0] } : {}),
      }))
      changed = true
    }
  } while (changed)
  return { kind: 'accepted', draft: next, picks, finished: next.seatOrder.every(id => draftSeatProgress(next, id).kind === 'finished') }
}

export function finalizeDraft(state: GameState): GameState {
  const draft = state.draft
  if (!draft) throw new Error('no draft to finalize')
  return {
    ...state, phase: 'playing', draft: null,
    players: state.players.map(player => {
      const { kept } = draftSeatProgress(draft, player.id)
      return { ...player, occupationHand: kept.occ, minorHand: kept.minor }
    }),
  }
}
