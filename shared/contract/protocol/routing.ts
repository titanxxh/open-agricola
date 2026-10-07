import type { CommandIdentity } from './commands'
export type RoomDiscoveryRequest = {
  roomId?: string
  developmentSlot?: boolean
  allocationId?: string
  pendingIdentity?: CommandIdentity
}
export type RoomDiscoveryResponse = { wsPath: string; roomId?: string; allocationId?: string }
