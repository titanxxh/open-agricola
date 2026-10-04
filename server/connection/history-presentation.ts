import type { Room } from '../game/room'
import type { SerializedGameState } from '../../shared/session/serialization'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import { projectHistoryLogNames } from '../../shared/projections/history-names'

type RoomParticipantNames = { players?: ReadonlyArray<Pick<Room['players'][number], 'playerIndex' | 'name'>> }

/** Connection names are presentation data; reconnect must not rewrite a saved Frame. */
export const withRoomParticipantNames = (room: RoomParticipantNames, state: SerializedGameState): SerializedGameState => ({
  ...state,
  players: state.players.map((player, index) => {
    const name = room.players?.find(seat => seat.playerIndex === index)?.name
    return name?.trim() ? { ...player, name, nameIsDefault: false } : player
  }),
})
export const projectRoomHistoryNames = (room: RoomParticipantNames, payload: GameSyncPayload): GameSyncPayload => {
  const state = withRoomParticipantNames(room, payload.state)
  const names = Object.fromEntries(state.players.map(player => [player.id, player.name]))
  return { ...payload, state: { ...state, log: state.log.map((entry, index) => projectHistoryLogNames(entry, payload.historyWindow?.logRecords[index]?.participantRoles, names)) } }
}
