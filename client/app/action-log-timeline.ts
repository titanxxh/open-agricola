import type { GameEvent } from '../../shared/contract/events'
import type { LogEntry } from '../../shared/contract/types'
import { eventsToLogEntries } from '../../shared/events/log-mapper'
import type { Locale } from '../../shared/i18n'
import { collectPublicEventNotifications } from './public-event-notifications'
import type { ReplayTimelineEntry } from './replay-timeline'

export type ActionLogTimelineRow =
  | {
      kind: 'event'
      key: string
      entry: ReplayTimelineEntry
      logEntry: LogEntry | null
      label: string
      round: number
      status: ReplayTimelineEntry['status']
      replayable: boolean
      strikethrough: boolean
    }
  | {
      kind: 'legacyLog'
      key: string
      logEntry: LogEntry
      label: string
      round: number
      replayable: false
      strikethrough: false
    }

export type ActionLogTimelineBucket = {
  round: number
  rows: ActionLogTimelineRow[]
}

type BuildActionLogTimelineRowsInput = {
  entries: readonly ReplayTimelineEntry[]
  legacyLog: readonly LogEntry[]
  currentRound: number
  locale: Locale
  playerNames: Record<string, string>
  actionNames?: Record<string, string>
}

type ResourcePaidEvent = Extract<GameEvent, { type: 'resource.paid' }>

const minorImprovementPaymentPurpose = ['minor', 'improvement'].join('-') as ResourcePaidEvent['paymentFor']

const groupLegacyLog = (
  log: readonly LogEntry[],
  currentRound: number,
): ActionLogTimelineBucket[] => {
  const buckets: ActionLogTimelineBucket[] = []
  let rows: ActionLogTimelineRow[] = []
  let round = currentRound

  log.forEach((logEntry, index) => {
    if (logEntry.key === 'log.enterRound') {
      const nextRound = Number(logEntry.params?.round ?? round)
      if (rows.length > 0) {
        buckets.push({ round: Number.isFinite(nextRound) ? nextRound : round, rows })
        rows = []
      }
      round = (Number.isFinite(nextRound) ? nextRound : round) - 1
      return
    }

    rows.push({
      kind: 'legacyLog',
      key: `legacy:${index}:${logEntry.key}`,
      logEntry,
      label: '',
      round,
      replayable: false,
      strikethrough: false,
    })
  })

  if (rows.length > 0) buckets.push({ round, rows })
  return buckets
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stableValue(entryValue)]),
  )
}

const logEntryIdentity = (entry: LogEntry): string =>
  JSON.stringify({
    key: entry.key,
    params: stableValue(entry.params ?? {}),
  })

const paymentForEvent = (
  events: readonly GameEvent[],
  event: GameEvent,
  paymentFor: ResourcePaidEvent['paymentFor'],
): GameEvent | undefined =>
  [...events]
    .filter((candidate) =>
      candidate.type === 'resource.paid' &&
      candidate.seq < event.seq &&
      candidate.actorPlayerId === event.actorPlayerId &&
      candidate.paymentFor === paymentFor)
    .sort((left, right) => right.seq - left.seq)[0]

const consumedPaymentSeqsFor = (events: readonly GameEvent[]): Set<number> => {
  const consumed = new Set<number>()
  events.forEach((event) => {
    if (event.type === 'card.played') {
      const purposes = event.cardType === 'occupation'
        ? ['occupation' as const]
        : ['major-improvement' as const, minorImprovementPaymentPurpose]
      const payment = purposes
        .map((purpose) => paymentForEvent(events, event, purpose))
        .find(Boolean)
      if (payment) consumed.add(payment.seq)
    }
    if (event.type === 'farm.renovated') {
      const payment = paymentForEvent(events, event, 'renovation')
      if (payment) consumed.add(payment.seq)
    }
    if (event.type === 'farm.stableBuilt') {
      const payment = paymentForEvent(events, event, 'stables')
      if (payment) consumed.add(payment.seq)
    }
  })
  return consumed
}

type LogMapperContextInput = {
  playerNames: Record<string, string>,
  actionNames?: Record<string, string>,
}

const entryHasStandaloneLog = (
  entry: ReplayTimelineEntry,
  context: LogMapperContextInput,
): boolean =>
  !!entry.event && eventsToLogEntries([entry.event], context).length > 0

const buildContextualLogEntryMapForGroup = (
  entries: readonly ReplayTimelineEntry[],
  context: LogMapperContextInput,
): Map<string, LogEntry> => {
  const eventEntries = entries.filter((entry): entry is ReplayTimelineEntry & { event: GameEvent } =>
    !!entry.event)
  const events = eventEntries.map((entry) => entry.event)
  const consumedPaymentSeqs = consumedPaymentSeqsFor(events)
  const visibleEntries = [...eventEntries]
    .sort((left, right) => right.event.seq - left.event.seq)
    .filter((entry) =>
      !consumedPaymentSeqs.has(entry.event.seq) &&
      entryHasStandaloneLog(entry, context))
  const logEntries = eventsToLogEntries(events, context)
  const map = new Map<string, LogEntry>()
  visibleEntries.forEach((entry, index) => {
    const logEntry = logEntries[index]
    if (logEntry) map.set(entry.key, logEntry)
  })
  return map
}

const buildContextualLogEntryMap = (
  entries: readonly ReplayTimelineEntry[],
  context: LogMapperContextInput,
): Map<string, LogEntry> => {
  const map = new Map<string, LogEntry>()
  const groups = new Map<number, ReplayTimelineEntry[]>()
  entries
    .filter((entry) => !!entry.event)
    .forEach((entry) => {
      groups.set(entry.packetSeq, [...(groups.get(entry.packetSeq) ?? []), entry])
    })
  groups.forEach((groupEntries) => {
    buildContextualLogEntryMapForGroup(groupEntries, context)
      .forEach((logEntry, key) => map.set(key, logEntry))
  })

  return map
}

const visibleReplayDerivedLogCounts = (
  contextualLogEntries: ReadonlyMap<string, LogEntry>,
): Map<string, number> => {
  const counts = new Map<string, number>()
  ;[...contextualLogEntries.values()]
    .filter((entry) => entry.key !== 'log.enterRound')
    .forEach((entry) => {
      const key = logEntryIdentity(entry)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
  return counts
}

const removeReplayDerivedLegacyRows = (
  legacyLog: readonly LogEntry[],
  contextualLogEntries: ReadonlyMap<string, LogEntry>,
): LogEntry[] => {
  const counts = visibleReplayDerivedLogCounts(contextualLogEntries)
  if (counts.size === 0) return [...legacyLog]
  return legacyLog.filter((entry) => {
    if (entry.key === 'log.enterRound') return true
    const key = logEntryIdentity(entry)
    const remaining = counts.get(key) ?? 0
    if (remaining <= 0) return true
    counts.set(key, remaining - 1)
    return false
  })
}

const structuredEventSummary = (
  event: GameEvent,
  playerNames: Record<string, string>,
  actionNames?: Record<string, string>,
): string => {
  const parts: string[] = [event.type]
  if (event.actorPlayerId) parts.push(`actor=${playerNames[event.actorPlayerId] ?? event.actorPlayerId}`)
  if (event.targetPlayerId) parts.push(`target=${playerNames[event.targetPlayerId] ?? event.targetPlayerId}`)
  if (event.sourceActionId) parts.push(`action=${actionNames?.[event.sourceActionId] ?? event.sourceActionId}`)
  if (event.sourceCardId) parts.push(`card=${event.sourceCardId}`)
  if ('cardId' in event && typeof event.cardId === 'string') parts.push(`cardId=${event.cardId}`)
  parts.push(`seq=${event.seq}`)
  return parts.join(' · ')
}

const eventLabel = (
  entry: ReplayTimelineEntry,
  locale: Locale,
  playerNames: Record<string, string>,
  actionNames?: Record<string, string>,
  contextualLogEntry?: LogEntry,
): { logEntry: LogEntry | null; label: string } => {
  if (!entry.event) return { logEntry: null, label: locale === 'zh' ? 'archive 缺口' : 'Archive gap' }

  if (contextualLogEntry) return { logEntry: contextualLogEntry, label: '' }

  const [logEntry] = eventsToLogEntries([entry.event], { playerNames, actionNames })
  if (logEntry) return { logEntry, label: '' }

  const [notification] = collectPublicEventNotifications([entry.event], locale)
  if (notification) return { logEntry: null, label: notification.message }

  return { logEntry: null, label: structuredEventSummary(entry.event, playerNames, actionNames) }
}

const mergeBuckets = (rows: ActionLogTimelineRow[]): ActionLogTimelineBucket[] => {
  const byRound = new Map<number, ActionLogTimelineRow[]>()

  rows.forEach((row) => {
    byRound.set(row.round, [...(byRound.get(row.round) ?? []), row])
  })

  return [...byRound.entries()]
    .sort(([left], [right]) => right - left)
    .map(([round, bucketRows]) => ({ round, rows: bucketRows }))
}

export const buildActionLogTimelineRows = ({
  entries,
  legacyLog,
  currentRound,
  locale,
  playerNames,
  actionNames,
}: BuildActionLogTimelineRowsInput): ActionLogTimelineBucket[] => {
  const mapperContext = { playerNames, actionNames }
  const contextualLogEntries = buildContextualLogEntryMap(entries, mapperContext)
  const eventRows: ActionLogTimelineRow[] = [...entries]
    .sort((left, right) =>
      right.packetSeq - left.packetSeq || right.packetLocalIndex - left.packetLocalIndex)
    .map((entry) => {
      const { logEntry, label } = eventLabel(
        entry,
        locale,
        playerNames,
        actionNames,
        contextualLogEntries.get(entry.key),
      )
      return {
        kind: 'event',
        key: entry.key,
        entry,
        logEntry,
        label,
        round: entry.event?.round ?? currentRound,
        status: entry.status,
        replayable: entry.replayable,
        strikethrough: entry.status === 'canceled',
      }
    })
  const visibleLegacyLog = removeReplayDerivedLegacyRows(legacyLog, contextualLogEntries)
  const legacyRows = groupLegacyLog(visibleLegacyLog, currentRound).flatMap((bucket) => bucket.rows)

  return mergeBuckets([...eventRows, ...legacyRows])
}
