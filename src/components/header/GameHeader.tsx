import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { GameState, PlayerState } from '../../game/types'

type Props = {
  locale: Locale
  setLocale: (value: Locale) => void
  state: GameState
  currentPlayer: PlayerState
  allWorkersUsed: boolean
  devMode: boolean
  setDevMode: (value: boolean) => void
}

export const GameHeader = ({
  locale,
  setLocale,
  state,
  currentPlayer,
  allWorkersUsed,
  devMode,
  setDevMode,
}: Props) => (
  <header className="header">
    <div>
      <h1>{t(locale, 'ui.gameTitle')}</h1>
      <div className="subtitle">
        {t(locale, 'ui.round')} {state.round} · {t(locale, 'ui.currentPlayer')}{' '}
        {currentPlayer.name}
      </div>
    </div>
    <div className="status">
      <span>
        {state.gameOver ? t(locale, 'ui.statusGameOver') : t(locale, 'ui.statusInProgress')}
      </span>
      <span>
        {allWorkersUsed ? t(locale, 'ui.statusRoundReady') : t(locale, 'ui.statusWaiting')}
      </span>
      <div className="locale-switch">
        <button
          className={locale === 'zh' ? 'active' : ''}
          onClick={() => setLocale('zh')}
        >
          {t(locale, 'ui.languageZh')}
        </button>
        <button
          className={locale === 'en' ? 'active' : ''}
          onClick={() => setLocale('en')}
        >
          {t(locale, 'ui.languageEn')}
        </button>
      </div>
      <div className="dev-toggle">
        <label>
          <input
            type="checkbox"
            checked={devMode}
            onChange={(event) => setDevMode(event.target.checked)}
          />
          {t(locale, 'ui.devMode')}
        </label>
      </div>
    </div>
  </header>
)
