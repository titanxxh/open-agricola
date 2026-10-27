import type { SoloCreationConfiguration } from '../../shared/contract/game-creation'
import { WS_BASE } from '../config'
import { WsGameTransport, type RoomCreationOptions } from './gameTransport'

export type CreatedRoom = { roomId: string }
let activeCreation: Promise<CreatedRoom> | null = null

const transport = () => new WsGameTransport(undefined, undefined, undefined, {
  journalKey: `agricola.pending-creation:${WS_BASE}`,
})

const track = (operation: Promise<CreatedRoom>): Promise<CreatedRoom> => {
  activeCreation = operation
  void operation.finally(() => { if (activeCreation === operation) activeCreation = null }).catch(() => undefined)
  return operation
}

export function startRoomCreation(options: RoomCreationOptions): Promise<CreatedRoom> {
  if (activeCreation) return activeCreation
  const connection = transport()
  const pending = connection.resumeRoomCreation()
  return track((async () => {
    try {
      if (pending) await Promise.all([connection.connect(), pending])
      else {
        await connection.connect()
        await connection.createRoom(options)
      }
      return { roomId: connection.roomId }
    } finally { connection.destroy() }
  })())
}

export function resumePendingRoomCreation(): Promise<CreatedRoom> | null {
  if (activeCreation) return activeCreation
  const connection = transport()
  const pending = connection.resumeRoomCreation()
  if (!pending) { connection.destroy(); return null }
  return track((async () => {
    try {
      await Promise.all([connection.connect(), pending])
      return { roomId: connection.roomId }
    } finally { connection.destroy() }
  })())
}

export const soloRoomOptions = (configuration: SoloCreationConfiguration, name?: string): RoomCreationOptions => ({
  maxPlayers: 1, soloHandMode: configuration.soloHandMode, name,
  enableCommunityDeck: configuration.enableCommunityDeck, customCardIds: [...configuration.customCardIds],
  enableParentCards: configuration.enableParentCards, draftParents: configuration.draftParents,
  enableThroughTheSeasons: configuration.enableThroughTheSeasons, enableFarmersOfTheMoor: configuration.enableFarmersOfTheMoor,
})
