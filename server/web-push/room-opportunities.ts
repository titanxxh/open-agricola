import type { GameState } from '../../shared/contract/types'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import type { SerializedAuthoritativeGameState } from '../../shared/session/serialization'
import { isDevRoom, type Room } from '../game/room'
import type { SessionResponse } from '../game/authoritative-session'
import type { RoomPushEvent, RoomPushOpportunity } from './store'

type DraftProjectionState = Pick<GameState, 'phase' | 'draft' | 'players'>

export function draftPushOpportunity(state: DraftProjectionState, seat: number): string | null {
  const draft = state.draft
  const player = state.players[seat]
  if (state.phase !== 'draft' || !draft || !player) return null
  // Retained global-round drafts have no per-stage seat queues.
  if (!Array.isArray(draft.stages) || draft.stages.some(stage => !stage.seats)) return null
  const progress = draftSeatProgress(draft, player.id)
  return progress.kind === 'selecting' ? progress.opportunityKey : null
}

export function roomPushOpportunities(
  room: Room, state: SerializedAuthoritativeGameState, interaction?: SessionResponse['interaction'],
): ReadonlyArray<RoomPushOpportunity | null> {
  if (process.env.RELEASE_CHANNEL === 'prerelease' || isDevRoom(room.id) || room.hotseat || room.status !== 'playing'
    || state.players.length < 2 || state.gameOver) return []
  if (state.phase === 'draft') return state.players.map((_, seat) => {
    const key = draftPushOpportunity(state, seat)
    return key ? { kind: 'draft', opportunityKey: key } : null
  })
  if (state.phase !== 'playing') return []
  const pending = interaction ?? room.session.getInteraction()
  const actor = pending.stateId === 'wait' ? pending.playerIndex : state.currentPlayerIndex
  return state.players.map((_, seat) => seat === actor ? { kind: 'turn' } : null)
}

export function newRoomPushEvents(args: {
  roomId: string
  before: ReadonlyArray<RoomPushOpportunity | null>
  after: ReadonlyArray<RoomPushOpportunity | null>
  owners: ReadonlyArray<{ userId: string; playerIndex: number }>
  stepNo: number
  createdAt: number
}): RoomPushEvent[] {
  const { roomId, before, after, owners, stepNo, createdAt } = args
  return owners.flatMap(({ userId, playerIndex: seat }) => {
    const opportunity = after[seat]
    if (!opportunity || opportunity.kind === before[seat]?.kind) return []
    return [{ ...opportunity, roomId, userId, seat, stepNo, createdAt }]
  })
}
