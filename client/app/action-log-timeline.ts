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
      kind: 'stateLog'
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
  stateLog: readonly LogEntry[]
  currentRound: number
  locale: Locale
  playerNames: Record<string, string>
  actionNames?: Record<string, string>
}

type ResourcePaidEvent = Extract<GameEvent, { type: 'resource.paid' }>

const minorImprovementPaymentPurpose = ['minor', 'improvement'].join('-') as ResourcePaidEvent['paymentFor']

const groupStateLog = (
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
      kind: 'stateLog',
      key: `state-log:${index}:${logEntry.key}`,
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

const logEntryIdentityParams = (entry: LogEntry): unknown => {
  const params = entry.params ?? {}
  if (
    entry.key !== 'log.playImprovement' &&
    entry.key !== 'log.playMinorImprovement' &&
    entry.key !== 'log.playOccupation'
  ) {
    return params
  }
  const { player: _player, ...rest } = params
  return rest
}

const logEntryIdentity = (entry: LogEntry): string =>
  JSON.stringify({
    key: entry.key,
    params: stableValue(logEntryIdentityParams(entry)),
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
      // Stable payments are emitted AFTER farm.stableBuilt (the pay child
      // runs in afterHostListeners) — find the nearest FOLLOWING stables
      // payment, bounded by the next stableBuilt (mirrors the shared
      // mapper's stablePaymentForEvent).
      const nextStableBuiltSeq = events
        .filter((candidate) =>
          candidate.type === 'farm.stableBuilt' &&
          candidate.seq > event.seq &&
          candidate.actorPlayerId === event.actorPlayerId)
        .sort((left, right) => left.seq - right.seq)[0]?.seq ?? Number.POSITIVE_INFINITY
      const payment = events
        .filter((candidate) =>
          candidate.type === 'resource.paid' &&
          candidate.seq > event.seq &&
          candidate.seq < nextStableBuiltSeq &&
          candidate.actorPlayerId === event.actorPlayerId &&
          candidate.paymentFor === 'stables')
        .sort((left, right) => left.seq - right.seq)[0]
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

type ContextualLogEntries = {
  map: Map<string, LogEntry>
  /** Replay entry keys for resource.paid events absorbed into a card.played/renovated/stable row. */
  consumedPaymentKeys: Set<string>
}

const buildContextualLogEntryMapForGroup = (
  entries: readonly ReplayTimelineEntry[],
  context: LogMapperContextInput,
): ContextualLogEntries => {
  const eventEntries = entries.filter((entry): entry is ReplayTimelineEntry & { event: GameEvent } =>
    !!entry.event)
  const events = eventEntries.map((entry) => entry.event)
  const consumedPaymentSeqs = consumedPaymentSeqsFor(events)
  const consumedPaymentKeys = new Set(
    eventEntries
      .filter((entry) => consumedPaymentSeqs.has(entry.event.seq))
      .map((entry) => entry.key),
  )
  const visibleEntries = [...eventEntries]
    .sort((left, right) => right.event.seq - left.event.seq)
    .filter((entry) =>
      !consumedPaymentKeys.has(entry.key) &&
      entryHasStandaloneLog(entry, context))
  const logEntries = eventsToLogEntries(events, context)
  const map = new Map<string, LogEntry>()
  visibleEntries.forEach((entry, index) => {
    const logEntry = logEntries[index]
    if (logEntry) map.set(entry.key, logEntry)
  })
  return { map, consumedPaymentKeys }
}

const buildContextualLogEntryMap = (
  entries: readonly ReplayTimelineEntry[],
  context: LogMapperContextInput,
): ContextualLogEntries => {
  const map = new Map<string, LogEntry>()
  const consumedPaymentKeys = new Set<string>()
  const groups = new Map<number, ReplayTimelineEntry[]>()
  entries
    .filter((entry) => !!entry.event)
    .forEach((entry) => {
      groups.set(entry.packetSeq, [...(groups.get(entry.packetSeq) ?? []), entry])
    })
  groups.forEach((groupEntries) => {
    const group = buildContextualLogEntryMapForGroup(groupEntries, context)
    group.map.forEach((logEntry, key) => map.set(key, logEntry))
    group.consumedPaymentKeys.forEach((key) => consumedPaymentKeys.add(key))
  })

  return { map, consumedPaymentKeys }
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

const removeReplayDerivedStateLogRows = (
  stateLog: readonly LogEntry[],
  contextualLogEntries: ReadonlyMap<string, LogEntry>,
): LogEntry[] => {
  const counts = visibleReplayDerivedLogCounts(contextualLogEntries)
  if (counts.size === 0) return [...stateLog]
  return stateLog.filter((entry) => {
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

  if (!entry.replayable) return { logEntry: null, label: '' }

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
  stateLog,
  currentRound,
  locale,
  playerNames,
  actionNames,
}: BuildActionLogTimelineRowsInput): ActionLogTimelineBucket[] => {
  const mapperContext = { playerNames, actionNames }
  const { map: contextualLogEntries, consumedPaymentKeys } =
    buildContextualLogEntryMap(entries, mapperContext)
  const eventRows: ActionLogTimelineRow[] = [...entries]
    .sort((left, right) =>
      right.packetSeq - left.packetSeq || right.packetLocalIndex - left.packetLocalIndex)
    .flatMap((entry): ActionLogTimelineRow[] => {
      // A payment absorbed into its card.played/renovated/stable row must not
      // fall through to the standalone single-event rendering — that would
      // duplicate the payment as a "pays X for Y" line.
      if (entry.event && consumedPaymentKeys.has(entry.key)) return []
      const { logEntry, label } = eventLabel(
        entry,
        locale,
        playerNames,
        actionNames,
        contextualLogEntries.get(entry.key),
      )
      if (!entry.replayable && !logEntry && !label) return []
      return [{
        kind: 'event',
        key: entry.key,
        entry,
        logEntry,
        label,
        round: entry.event?.round ?? currentRound,
        status: entry.status,
        replayable: entry.replayable,
        strikethrough: entry.status === 'canceled',
      }]
    })
  const visibleStateLog = removeReplayDerivedStateLogRows(stateLog, contextualLogEntries)
  const stateLogRows = groupStateLog(visibleStateLog, currentRound).flatMap((bucket) => bucket.rows)

  return mergeBuckets([...eventRows, ...stateLogRows])
}
