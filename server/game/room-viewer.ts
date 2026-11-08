import type { WebSocket } from 'ws'
import { isDevRoom, type Room } from './room'

type ConnectionRoom = Pick<Room, 'id' | 'session' | 'players'> & Partial<Pick<Room, 'seatOwners' | 'hotseat'>>

export const controlledSeatIndexes = (room: ConnectionRoom, ws: WebSocket): number[] => {
  const seats = room.players.filter(player => player.ws === ws)
  if (seats.length === 0) return []
  if (room.hotseat) return room.session.state.players.map((_, index) => index)
  const indexes = new Set(seats.map(seat => seat.playerIndex))
  const userId = seats.find(seat => seat.userId)?.userId
  if (!isDevRoom(room.id) && userId) {
    for (const owner of room.seatOwners ?? []) if (owner.userId === userId) indexes.add(owner.playerIndex)
  }
  return [...indexes].sort((left, right) => left - right)
}

export const visiblePlayerIdsForConnection = (room: ConnectionRoom, ws: WebSocket): string[] =>
  controlledSeatIndexes(room, ws).flatMap(index => room.session.state.players[index]?.id ?? [])

export const connectionViewerMetadata = (room: ConnectionRoom, ws: WebSocket) => ({
  controlledPlayerIndexes: controlledSeatIndexes(room, ws),
  visiblePlayerIds: visiblePlayerIdsForConnection(room, ws),
})

export const connectedSeatIndexes = (room: ConnectionRoom): number[] => room.hotseat
  ? room.session.state.players.map((_, index) => index)
  : [...new Set(
  room.players.filter(player => player.ws.readyState === 1).flatMap(player => controlledSeatIndexes(room, player.ws)),
)].sort((left, right) => left - right)
