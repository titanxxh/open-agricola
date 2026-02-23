import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState } from '../../../shared/game/types'

type Props = {
  locale: Locale
  log: GameState['log']
}

export const LogPanel = ({ locale, log }: Props) => (
  <section className="log log-bottom">
    <h3>{t(locale, 'ui.actionLog')}</h3>
    <ul>
      {log.map((entry, index) => (
        <li key={`${entry.key}-${index}`}>
          {t(locale, entry.key, entry.params)}
        </li>
      ))}
    </ul>
  </section>
)
