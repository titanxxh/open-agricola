import type { GameState } from '../../shared/contract/types'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { isDevRoom, type Room } from '../game/room'
import type { WebPushEvent } from './store'

type DraftProjectionState = Pick<GameState, 'phase' | 'draft' | 'players'>
type DraftPushEvent = Extract<WebPushEvent, { kind: 'draft' }>

export function draftPushOpportunity(state: DraftProjectionState, seat: number): string | null {
  const draft = state.draft
  const player = state.players[seat]
  if (state.phase !== 'draft' || !draft || !player) return null
  // Retained global-round drafts have no per-stage seat queues.
  if (!Array.isArray(draft.stages) || draft.stages.some(stage => !stage.seats)) return null
  const progress = draftSeatProgress(draft, player.id)
  return progress.kind === 'selecting' ? progress.opportunityKey : null
}

export function draftPushOpportunities(room: Room, state: DraftProjectionState): ReadonlyArray<string | null> {
  if (process.env.RELEASE_CHANNEL === 'prerelease' || isDevRoom(room.id) || room.hotseat
    || state.phase !== 'draft' || state.players.length < 2) return []
  return state.players.map((_, seat) => draftPushOpportunity(state, seat))
}

export function newDraftPushEvents(args: {
  roomId: string
  before: ReadonlyArray<string | null>
  after: ReadonlyArray<string | null>
  owners: ReadonlyArray<{ userId: string; playerIndex: number }>
  stepNo: number
  createdAt: number
}): DraftPushEvent[] {
  const { roomId, before, after, owners, stepNo, createdAt } = args
  return owners.flatMap(({ userId, playerIndex: seat }) => {
    const opportunityKey = after[seat]
    return opportunityKey && !before[seat]
      ? [{ kind: 'draft', roomId, userId, seat, opportunityKey, stepNo, createdAt }]
      : []
  })
}
