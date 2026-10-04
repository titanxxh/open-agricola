import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState } from '../../../shared/contract/types'
import { LogParts, prepareLogEntry } from './log-rendering'
import { pickLogIcon, type LogIconKey } from './action-log-icons'
import type { ActionLogTimelineBucket, ActionLogTimelineRow } from '../../app/action-log-timeline'
import type {
  ReplayTimelineEntry,
  ReplayTimelineFilter,
  ReplayTimelineSummary,
} from '../../app/replay-timeline'

interface Props {
  locale: Locale
  log: GameState['log']
  playerNames?: Readonly<Record<string, string>>
  currentRound: number
  /** Cap entries (newest first) to keep the panel snappy. Default: 80. */
  limit?: number
  timelineBuckets?: ActionLogTimelineBucket[]
  selectedReplayKey?: string | null
  replayFilter?: ReplayTimelineFilter
  replaySummary?: ReplayTimelineSummary
  onReplayFilterChange?: (filter: ReplayTimelineFilter) => void
  onSelectReplayEntry?: (entry: ReplayTimelineEntry) => void
  onReplayStep?: (direction: 'prev' | 'next') => void
  onReplayPlayPause?: () => void
  onReplayLatest?: () => void
  history?: { canLoadOlder: boolean; loadOlder: () => Promise<void>; loading: boolean; error: boolean; resetNotice: boolean }
  isReplayPlaying?: boolean
}

type RoundBucket = {
  round: number
  entries: GameState['log']
}

/**
 * Game log is `unshift`-ed (newest first). We walk it in that order; entries
 * that appear before a `log.enterRound{round=N}` boundary belong to round N,
 * and we step the running round down past it.
 */
const groupByRound = (log: GameState['log'], currentRound: number): RoundBucket[] => {
  const buckets: RoundBucket[] = []
  let bucket: GameState['log'] = []
  let round = currentRound
  for (const entry of log) {
    if (entry.key === 'log.enterRound') {
      const r = Number(entry.params?.round ?? round)
      if (bucket.length > 0) {
        buckets.push({ round: Number.isFinite(r) ? r : round, entries: bucket })
        bucket = []
      }
      round = (Number.isFinite(r) ? r : round) - 1
      continue
    }
    bucket.push(entry)
  }
  if (bucket.length > 0) {
    buckets.push({ round, entries: bucket })
  }
  return buckets
}

const stateLogBucketsToTimeline = (buckets: RoundBucket[]): ActionLogTimelineBucket[] =>
  buckets.map((bucket, bucketIndex) => ({
    round: bucket.round,
    rows: bucket.entries.map((logEntry, entryIndex) => ({
      kind: 'stateLog',
      key: `state-log-${bucketIndex}-${entryIndex}`,
      logEntry,
      label: '',
      round: bucket.round,
      replayable: false,
      strikethrough: false,
    })),
  }))

const filterRows = (
  buckets: ActionLogTimelineBucket[],
  filter: ReplayTimelineFilter,
): ActionLogTimelineBucket[] => {
  if (filter === 'all') return buckets

  return buckets
    .map((bucket) => ({
      ...bucket,
      rows: bucket.rows.filter((row) => row.kind === 'event' && row.status === filter),
    }))
    .filter((bucket) => bucket.rows.length > 0)
}

const rowClassName = (row: ActionLogTimelineRow, selectedReplayKey?: string | null) => [
  'action-log__entry',
  row.kind === 'event' ? 'action-log__entry--event' : 'action-log__entry--state-log',
  row.kind === 'event' && row.status === 'canceled' ? 'action-log__entry--canceled' : '',
  row.kind === 'event' && row.status === 'missing' ? 'action-log__entry--missing' : '',
  selectedReplayKey === row.key ? 'is-current' : '',
].filter(Boolean).join(' ')

const LOG_ICON_CLASS: Partial<Record<LogIconKey, string>> = {
  harvest: 'grain',
  sheep: 'sheep',
  boar: 'boar',
  cattle: 'cattle',
  home: 'room-wood',
  family: 'child',
  resource: 'wood',
  card: 'minor',
}

function LogIcon({ icon }: { icon: LogIconKey }) {
  const resourceClass = LOG_ICON_CLASS[icon]
  if (resourceClass) return <span className={`res-icon res-icon-${resourceClass}`} />
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  )
}

export function ActionLog({
  locale,
  log,
  playerNames = {},
  currentRound,
  limit = 80,
  timelineBuckets,
  selectedReplayKey,
  replayFilter = 'all',
  replaySummary,
  onReplayFilterChange,
  onSelectReplayEntry,
  onReplayStep,
  onReplayPlayPause,
  onReplayLatest,
  isReplayPlaying = false,
  history,
}: Props) {
  const isTimelineMode = !!timelineBuckets
  const stateLogBuckets = useMemo(
    () => groupByRound(log.slice(0, limit), currentRound),
    [log, currentRound, limit],
  )
  const buckets = useMemo(
    () => {
      if (!timelineBuckets) return stateLogBucketsToTimeline(stateLogBuckets)
      return filterRows(timelineBuckets, replayFilter)
    },
    [stateLogBuckets, replayFilter, timelineBuckets],
  )
  const filters: ReplayTimelineFilter[] = ['all', 'active', 'canceled']

  return (
    <div className="action-log">
      <h3 className="action-log__title">{t(locale, 'ui.actionLog')}</h3>
      {isTimelineMode && (
        <div className="action-log__controls">
          {filters.map((filter) => {
            const labelKey =
              filter === 'all'
                ? 'ui.actionLogFilterAll'
                : filter === 'active'
                  ? 'ui.actionLogFilterActive'
                  : 'ui.actionLogFilterCanceled'
            return (
              <button
                key={filter}
                type="button"
                className={[
                  'action-log__control',
                  replayFilter === filter ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                aria-label={t(locale, labelKey)}
                aria-pressed={replayFilter === filter}
                onClick={() => onReplayFilterChange?.(filter)}
              >
                {t(locale, labelKey)}
              </button>
            )
          })}
          <button
            type="button"
            className="action-log__control"
            aria-label={t(locale, 'ui.actionLogReplayPrev')}
            disabled={!onReplayStep}
            onClick={() => onReplayStep?.('prev')}
          >
            {t(locale, 'ui.actionLogReplayPrev')}
          </button>
          <button
            type="button"
            className="action-log__control"
            aria-label={t(
              locale,
              isReplayPlaying ? 'ui.actionLogReplayPause' : 'ui.actionLogReplayPlay',
            )}
            disabled={!onReplayPlayPause}
            onClick={onReplayPlayPause}
          >
            {t(locale, isReplayPlaying ? 'ui.actionLogReplayPause' : 'ui.actionLogReplayPlay')}
          </button>
          <button
            type="button"
            className="action-log__control"
            aria-label={t(locale, 'ui.actionLogReplayNext')}
            disabled={!onReplayStep}
            onClick={() => onReplayStep?.('next')}
          >
            {t(locale, 'ui.actionLogReplayNext')}
          </button>
          <button
            type="button"
            className="action-log__control"
            aria-label={t(locale, 'ui.actionLogReplayLatest')}
            disabled={!onReplayLatest}
            onClick={onReplayLatest}
          >
            {t(locale, 'ui.actionLogReplayLatest')}
          </button>
          {replaySummary && replaySummary.missingEvents > 0 ? (
            <span className="action-log__meta">{t(locale, 'ui.actionLogArchiveGap')}</span>
          ) : null}
        </div>
      )}
      <div className="action-log__body">
        {buckets.length === 0 && (
          <p className="action-log__empty">{t(locale, 'ui.noLogEntries')}</p>
        )}
        {buckets.map((bucket, idx) => (
          <div key={`round-${bucket.round}-${idx}`} className="action-log__round-group">
            <div className="action-log__round-header">
              {t(locale, 'ui.roundHeader', { round: bucket.round })}
            </div>
            <ul className="action-log__list">
              {bucket.rows.map((row) => {
                const entry = row.logEntry
                const prepared = entry ? prepareLogEntry(entry, locale, playerNames) : null
                const plainText = prepared?.plainText ?? row.label
                const playerName =
                  entry?.playerId && playerNames[entry.playerId] !== undefined
                    ? playerNames[entry.playerId]!
                    : typeof entry?.params?.player === 'string' ? entry.params.player : ''
                return (
                  <li
                    key={row.key}
                    data-testid={`action-log-row-${row.key}`}
                    className={rowClassName(row, selectedReplayKey)}
                    aria-disabled={!row.replayable}
                    onClick={() => {
                      if (row.kind === 'event' && row.replayable) onSelectReplayEntry?.(row.entry)
                    }}
                  >
                    <span className="action-log__icon" aria-hidden>
                      <LogIcon icon={pickLogIcon(plainText)} />
                    </span>
                    {playerName ? (
                      <span className="action-log__player">{playerName.slice(0, 1)}</span>
                    ) : null}
                    <span
                      className={[
                        'action-log__text',
                        row.strikethrough ? 'action-log__text--canceled' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {prepared ? (
                        <LogParts
                          parts={prepared.parts}
                          cardRefs={prepared.cardRefs}
                          locale={locale}
                        />
                      ) : (
                        plainText
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      {history && (
        <div className="action-log__controls" data-testid="room-history-controls">
          {history.canLoadOlder && <button type="button" className="action-log__control" disabled={history.loading} onClick={() => { void history.loadOlder() }}>
            {t(locale, history.loading ? 'ui.historyLoading' : 'ui.historyLoadOlder')}
          </button>}
          <span role="status" className="action-log__meta">
            {history.error ? t(locale, 'ui.historyLoadError') : history.resetNotice ? t(locale, 'ui.historyUpdated') : ''}
          </span>
        </div>
      )}
    </div>
  )
}
