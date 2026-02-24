import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState } from '../../../shared/game/types'

type Props = {
  locale: Locale
  setLocale: (value: Locale) => void
  state: GameState
  currentPlayer: PlayerState
  allWorkersUsed: boolean
  devMode: boolean
  setDevMode: (value: boolean) => void
  isInteractive: boolean
}

export const GameHeader = ({
  locale,
  setLocale,
  state,
  currentPlayer,
  allWorkersUsed,
  devMode,
  setDevMode,
  isInteractive,
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
          disabled={!isInteractive}
        >
          {t(locale, 'ui.languageZh')}
        </button>
        <button
          className={locale === 'en' ? 'active' : ''}
          onClick={() => setLocale('en')}
          disabled={!isInteractive}
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
            disabled={!isInteractive}
          />
          {t(locale, 'ui.devMode')}
        </label>
      </div>
    </div>
  </header>
)
