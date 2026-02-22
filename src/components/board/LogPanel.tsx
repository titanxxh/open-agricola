import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { GameState } from '../../game/types'

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
