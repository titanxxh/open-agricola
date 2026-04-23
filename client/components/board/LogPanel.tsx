import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState } from '../../../shared/game/types'
import { LogParts, prepareLogEntry } from './log-rendering'

type Props = {
  locale: Locale
  log: GameState['log']
  variant?: 'bottom' | 'sidebar'
}

export const LogPanel = ({ locale, log, variant = 'bottom' }: Props) => (
  <section className={`log ${variant === 'sidebar' ? 'log-sidebar' : 'log-bottom'}`}>
    <h3>{t(locale, 'ui.actionLog')}</h3>
    <ul>
      {log.map((entry, index) => {
        const { parts, cardRefs } = prepareLogEntry(entry, locale)
        return (
          <li key={`${entry.key}-${index}`} className="log-entry-with-cards">
            <LogParts parts={parts} cardRefs={cardRefs} locale={locale} />
          </li>
        )
      })}
    </ul>
  </section>
)
