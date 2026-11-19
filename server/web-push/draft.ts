import type { GameState } from '../../shared/contract/types'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { isDevRoom, type Room } from '../game/room'
import type { WebPushEvent } from './store'

type DraftState = Pick<GameState, 'phase' | 'draft' | 'players'>
type DraftPushEvent = Extract<WebPushEvent, { kind: 'draft' }>

export function draftPushOpportunities(room: Room, state: DraftState): ReadonlyArray<string | null> {
  if (process.env.RELEASE_CHANNEL === 'prerelease' || isDevRoom(room.id) || room.hotseat
    || state.phase !== 'draft' || !state.draft || state.players.length < 2) return []
  const draft = state.draft
  return state.players.map(player => {
    const progress = draftSeatProgress(draft, player.id)
    return progress.kind === 'selecting' ? progress.opportunityKey : null
  })
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
