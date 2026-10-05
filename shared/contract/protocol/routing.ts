import type { CommandIdentity } from './commands'
export type RoomDiscoveryRequest = {
  roomId?: string
  allocationId?: string
  pendingIdentity?: CommandIdentity
}
export type RoomDiscoveryResponse = { wsPath: string; roomId?: string; allocationId?: string }
