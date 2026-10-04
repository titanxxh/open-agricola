import type { Room } from '../game/room'
import type { SerializedGameState } from '../../shared/session/serialization'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import { projectHistoryLogNames } from '../../shared/projections/history-names'

/** Connection names are presentation data; reconnect must not rewrite a saved Frame. */
export const withRoomParticipantNames = (room: Partial<Pick<Room, 'players'>>, state: SerializedGameState): SerializedGameState => ({
  ...state,
  players: state.players.map((player, index) => ({ ...player, name: room.players?.find(seat => seat.playerIndex === index)?.name ?? player.name })),
})
export const projectRoomHistoryNames = (room: Partial<Pick<Room, 'players'>>, payload: GameSyncPayload): GameSyncPayload => {
  const state = withRoomParticipantNames(room, payload.state)
  const names = Object.fromEntries(state.players.map(player => [player.id, player.name]))
  return { ...payload, state: { ...state, log: state.log.map((entry, index) => projectHistoryLogNames(entry, payload.historyWindow?.logRecords[index]?.participantRoles, names)) } }
}
