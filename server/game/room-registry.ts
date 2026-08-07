import type { Room } from './room.ts'

export class RoomRegistry {
  private rooms = new Map<string, Room>()
  private lastActivity = new Map<string, number>()

  get(id: string): Room | undefined { return this.rooms.get(id) }
  set(room: Room): void { this.rooms.set(room.id, room) }
  delete(id: string): void {
    const room = this.rooms.get(id)
    room?.customSessionExecutor?.dispose()
    this.rooms.delete(id)
  }
  has(id: string): boolean { return this.rooms.has(id) }
  iter(): IterableIterator<Room> { return this.rooms.values() }
  size(): number { return this.rooms.size }

  touchActivity(id: string, now: number): void { this.lastActivity.set(id, now) }
  lastActivityOf(id: string): number | undefined { return this.lastActivity.get(id) }
  clearActivity(id: string): void { this.lastActivity.delete(id) }
}
