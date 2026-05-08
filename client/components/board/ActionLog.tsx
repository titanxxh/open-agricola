import { useMemo } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState } from '../../../shared/contract/types'
import { LogParts, prepareLogEntry } from './log-rendering'
import { pickLogIcon } from './action-log-icons'

interface Props {
  locale: Locale
  log: GameState['log']
  currentRound: number
  /** Cap entries (newest first) to keep the panel snappy. Default: 80. */
  limit?: number
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

export function ActionLog({ locale, log, currentRound, limit = 80 }: Props) {
  const buckets = useMemo(
    () => groupByRound(log.slice(0, limit), currentRound),
    [log, currentRound, limit],
  )

  return (
    <div className="action-log">
      <h3 className="action-log__title">{t(locale, 'ui.actionLog')}</h3>
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
              {bucket.entries.map((entry, i) => {
                const { parts, cardRefs, plainText } = prepareLogEntry(entry, locale)
                const playerName =
                  typeof entry.params?.player === 'string' ? entry.params.player : ''
                return (
                  <li key={`${entry.key}-${idx}-${i}`} className="action-log__entry">
                    <span className="action-log__icon" aria-hidden>
                      {pickLogIcon(plainText)}
                    </span>
                    {playerName ? (
                      <span className="action-log__player">{playerName.slice(0, 1)}</span>
                    ) : null}
                    <span className="action-log__text">
                      <LogParts parts={parts} cardRefs={cardRefs} locale={locale} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
