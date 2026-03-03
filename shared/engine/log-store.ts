import type { LogEntry } from '../game/types'

export class LogStore {
  private entries: LogEntry[] = []

  append(entry: LogEntry) {
    this.entries.unshift(entry)
  }

  all() {
    return [...this.entries]
  }

  clear() {
    this.entries = []
  }
}
