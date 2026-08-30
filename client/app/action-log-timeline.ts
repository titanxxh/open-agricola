import type { GameEvent } from '../../shared/contract/events'
import type { LogEntry } from '../../shared/contract/types'
import {
  buildLogPresentationPlan,
  type EventLogMapperContext,
  type LogPresentationEventRef,
  type LogPresentationRow,
  logPresentationRowIdentity,
  logPresentationRowIdentityKey,
} from '../../shared/events/log-mapper'
import type { Locale } from '../../shared/i18n'
import { collectPublicEventFeedback } from './public-event-notifications'
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

type ReplayEventTimelineEntry = ReplayTimelineEntry & { event: GameEvent }

const presentationEventRefKey = (ref: LogPresentationEventRef): string =>
  JSON.stringify([ref.type, ref.id, ref.seq])

type ContextualLogEntries = {
  map: Map<string, LogPresentationRow>
  consumedEventKeys: Set<string>
  suppressedEventKeys: Set<string>
}

const buildContextualLogEntryMapForGroup = (
  entries: readonly ReplayTimelineEntry[],
  context: EventLogMapperContext,
): ContextualLogEntries => {
  const eventEntries = entries.filter((entry): entry is ReplayEventTimelineEntry =>
    !!entry.event)
  const entryByRef = new Map<string, ReplayEventTimelineEntry>()
  eventEntries.forEach((entry) => {
    entryByRef.set(presentationEventRefKey(entry.event), entry)
  })
  const plan = buildLogPresentationPlan(eventEntries.map((entry) => entry.event), context)
  const map = new Map<string, LogPresentationRow>()
  plan.rows.forEach((row) => {
    const entry = entryByRef.get(presentationEventRefKey(row.sourceEventRef))
    if (entry && !map.has(entry.key)) map.set(entry.key, row)
  })
  const consumedEventKeys = new Set<string>()
  plan.consumedEvents.forEach((consumed) => {
    const entry = entryByRef.get(presentationEventRefKey(consumed.consumedEventRef))
    if (entry) consumedEventKeys.add(entry.key)
  })
  const suppressedEventKeys = new Set<string>()
  plan.suppressedEvents.forEach((suppressed) => {
    const entry = entryByRef.get(presentationEventRefKey(suppressed.suppressedEventRef))
    if (entry) suppressedEventKeys.add(entry.key)
  })
  return { map, consumedEventKeys, suppressedEventKeys }
}

const buildContextualLogEntryMap = (
  entries: readonly ReplayTimelineEntry[],
  context: EventLogMapperContext,
): ContextualLogEntries => {
  const map = new Map<string, LogPresentationRow>()
  const consumedEventKeys = new Set<string>()
  const suppressedEventKeys = new Set<string>()
  const groups = new Map<number, ReplayTimelineEntry[]>()
  entries
    .filter((entry) => !!entry.event)
    .forEach((entry) => {
      groups.set(entry.packetSeq, [...(groups.get(entry.packetSeq) ?? []), entry])
    })
  groups.forEach((groupEntries) => {
    const group = buildContextualLogEntryMapForGroup(groupEntries, context)
    group.map.forEach((logEntry, key) => map.set(key, logEntry))
    group.consumedEventKeys.forEach((key) => consumedEventKeys.add(key))
    group.suppressedEventKeys.forEach((key) => suppressedEventKeys.add(key))
  })

  return { map, consumedEventKeys, suppressedEventKeys }
}

const visibleReplayDerivedLogCounts = (
  contextualLogEntries: ReadonlyMap<string, LogPresentationRow>,
): Map<string, number> => {
  const counts = new Map<string, number>()
  ;[...contextualLogEntries.values()]
    .filter((row) => row.logEntry.key !== 'log.enterRound')
    .forEach((row) => {
      const key = logPresentationRowIdentityKey(row.identity)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
  return counts
}

const splitReplayIndependentStateLogRows = (
  stateLog: readonly LogEntry[],
  contextualLogEntries: ReadonlyMap<string, LogPresentationRow>,
): { leading: LogEntry[]; trailing: LogEntry[] } => {
  const counts = visibleReplayDerivedLogCounts(contextualLogEntries)
  if (counts.size === 0) return { leading: [], trailing: [...stateLog] }
  const leading: LogEntry[] = []
  const trailing: LogEntry[] = []
  let foundReplayDerived = false

  stateLog.forEach((entry) => {
    if (entry.key !== 'log.enterRound') {
      const key = logPresentationRowIdentityKey(logPresentationRowIdentity(entry))
      const remaining = counts.get(key) ?? 0
      if (remaining > 0) {
        counts.set(key, remaining - 1)
        foundReplayDerived = true
        return
      }
    }
    ;(foundReplayDerived ? trailing : leading).push(entry)
  })

  return foundReplayDerived ? { leading, trailing } : { leading: [], trailing: leading }
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
  contextualLogRow?: LogPresentationRow,
): { logEntry: LogEntry | null; label: string } => {
  if (!entry.event) return { logEntry: null, label: locale === 'zh' ? 'archive 缺口' : 'Archive gap' }

  if (contextualLogRow) return { logEntry: contextualLogRow.logEntry, label: '' }

  const [notification] = collectPublicEventFeedback([entry.event], locale).notifications
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
  const { map: contextualLogEntries, consumedEventKeys, suppressedEventKeys } =
    buildContextualLogEntryMap(entries, mapperContext)
  const eventRows: ActionLogTimelineRow[] = [...entries]
    .sort((left, right) =>
      right.packetSeq - left.packetSeq || right.packetLocalIndex - left.packetLocalIndex)
    .flatMap((entry): ActionLogTimelineRow[] => {
      if (suppressedEventKeys.has(entry.key)) return []
      if (entry.event && consumedEventKeys.has(entry.key)) return []
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
  const visibleStateLog = splitReplayIndependentStateLogRows(stateLog, contextualLogEntries)
  const leadingStateLogRows = groupStateLog(visibleStateLog.leading, currentRound)
    .flatMap((bucket) => bucket.rows)
  const trailingStateLogRows = groupStateLog(visibleStateLog.trailing, currentRound)
    .flatMap((bucket) => bucket.rows)

  return mergeBuckets([...leadingStateLogRows, ...eventRows, ...trailingStateLogRows])
}
