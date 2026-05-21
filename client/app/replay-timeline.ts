import type { GameEvent, PublicEventArchivePacket } from '../../shared/contract/events'
import { isPublicEventReplayable } from '../../shared/events/event-mapping-policy'

export type ReplayTimelineStatus = 'active' | 'canceled' | 'missing'
export type ReplayTimelineFilter = 'all' | 'active' | 'canceled'

export type ReplayTimelineEntry = {
  key: string
  kind: 'event' | 'cancellationMarker'
  packetSeq: number
  packetLocalIndex: number
  event: GameEvent | null
  eventId?: string
  eventSeq?: number
  status: ReplayTimelineStatus
  payloadSource: 'currentEvents' | 'canceledArchive' | 'missing'
  replayable: boolean
  canceledByPacketSeq?: number
  canceledEventRefs?: Array<{ eventId: string; eventSeq: number }>
  cancelReason?: 'undoStep' | 'undoAction'
}

export type ReplayTimelineSummary = {
  totalEvents: number
  activeEvents: number
  canceledEvents: number
  missingEvents: number
}

type BuildReplayTimelineInput = {
  events: readonly GameEvent[]
  publicEventArchive: readonly PublicEventArchivePacket[]
}

const eventRefKey = (eventId: string, eventSeq: number) => `${eventId}:${eventSeq}`

const currentEventMap = (events: readonly GameEvent[]) => {
  const map = new Map<string, GameEvent>()
  events.forEach((event) => map.set(eventRefKey(event.id, event.seq), event))
  return map
}

const findNearestActiveMatch = (
  entries: ReplayTimelineEntry[],
  eventId: string,
  eventSeq: number,
): ReplayTimelineEntry | undefined => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      entry?.kind === 'event' &&
      (entry.status === 'active' || entry.status === 'missing') &&
      entry.eventId === eventId &&
      entry.eventSeq === eventSeq
    ) {
      return entry
    }
  }
  return undefined
}

export const buildReplayTimeline = ({
  events,
  publicEventArchive,
}: BuildReplayTimelineInput): ReplayTimelineEntry[] => {
  const byRef = currentEventMap(events)
  const entries: ReplayTimelineEntry[] = []

  for (const packet of [...publicEventArchive].sort((left, right) => left.packetSeq - right.packetSeq)) {
    if (packet.type === 'publicEvents.committed') {
      packet.eventIds.forEach((eventId, packetLocalIndex) => {
        const eventSeq = packet.eventSeqs[packetLocalIndex]
        if (typeof eventSeq !== 'number') return
        const event = byRef.get(eventRefKey(eventId, eventSeq)) ?? null
        entries.push({
          key: `event:${packet.packetSeq}:${packetLocalIndex}:${eventId}:${eventSeq}`,
          kind: 'event',
          packetSeq: packet.packetSeq,
          packetLocalIndex,
          event,
          eventId,
          eventSeq,
          status: event ? 'active' : 'missing',
          payloadSource: event ? 'currentEvents' : 'missing',
          replayable: event ? isPublicEventReplayable(event) : false,
        })
      })
      continue
    }

    packet.canceledEvents.forEach((event) => {
      const match = findNearestActiveMatch(entries, event.id, event.seq)
      if (!match) return
      match.event = event
      match.status = 'canceled'
      match.payloadSource = 'canceledArchive'
      match.replayable = isPublicEventReplayable(event)
      match.canceledByPacketSeq = packet.packetSeq
      match.cancelReason = packet.reason
    })
  }

  return entries
}

export const replayTimelineOrder = (entry: ReplayTimelineEntry): [number, number] => [
  entry.packetSeq,
  entry.packetLocalIndex,
]

export const replayTimelineNamespaceId = (entry: ReplayTimelineEntry, id: string): string => (
  `replay:${entry.key}:${id}`
)

export const filterReplayTimeline = (
  entries: readonly ReplayTimelineEntry[],
  filter: ReplayTimelineFilter,
): ReplayTimelineEntry[] => {
  if (filter === 'active') return entries.filter((entry) => entry.status === 'active')
  if (filter === 'canceled') return entries.filter((entry) => entry.status === 'canceled')
  return [...entries]
}

export const summarizeReplayTimeline = (
  entries: readonly ReplayTimelineEntry[],
): ReplayTimelineSummary => ({
  totalEvents: entries.filter((entry) => entry.kind === 'event').length,
  activeEvents: entries.filter((entry) => entry.status === 'active').length,
  canceledEvents: entries.filter((entry) => entry.status === 'canceled').length,
  missingEvents: entries.filter((entry) => entry.status === 'missing').length,
})
