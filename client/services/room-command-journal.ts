import type { ClientCommand } from '../../shared/contract/protocol/ws'

/** Tab-local requests survive reconnect/reload. They contain no authentication credentials. */
export class RoomCommandJournal {
  readonly commands = new Map<string, ClientCommand>()
  private readonly key: string
  roomId: string
  playerIndex?: number
  constructor(key: string, roomId: string) {
    this.key = key
    this.roomId = roomId
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      if (!value || !Array.isArray(value.commands)) return
      const relevant = value.roomId === roomId || value.commands.some((command: ClientCommand) =>
        command.commandContext?.roomId === roomId || (!roomId && command.type === 'createRoom'))
      if (!relevant) return
      this.roomId = typeof value.roomId === 'string' ? value.roomId : roomId
      if (Number.isInteger(value.playerIndex) && value.playerIndex >= 0) this.playerIndex = value.playerIndex
      for (const command of value.commands.slice(0, 32) as ClientCommand[]) {
        if (command.commandContext?.commandId && command.commandContext.scopeId) this.commands.set(command.commandContext.commandId, command)
      }
    } catch { /* Storage may be disabled; live reconnect still retains the journal. */ }
  }
  save(): void {
    try {
      if (!this.commands.size) sessionStorage.removeItem(this.key)
      else sessionStorage.setItem(this.key, JSON.stringify({ roomId: this.roomId, playerIndex: this.playerIndex, commands: [...this.commands.values()] }))
    } catch { /* In-memory recovery remains available. */ }
  }
}
