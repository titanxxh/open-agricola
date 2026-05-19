import type { EventSink } from '../contract/events'

export const noopEventSink: EventSink = {
  emit: () => undefined,
  emitMany: () => undefined,
}
