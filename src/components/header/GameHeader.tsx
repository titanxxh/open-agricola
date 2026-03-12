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
  myPlayerName: string | null
  isMyTurn: boolean
}

export const GameHeader = ({
  locale,
  setLocale,
  state,
  currentPlayer,
  allWorkersUsed,
  devMode,
  setDevMode,
  myPlayerName,
  isMyTurn,
}: Props) => (
  <header className={`header ${isMyTurn ? 'my-turn' : 'not-my-turn'}`}>
    <div>
      <h1>{t(locale, 'ui.gameTitle')}</h1>
      <div className="subtitle">
        {t(locale, 'ui.round')} {state.round} / 14 · {t(locale, 'ui.currentPlayer')}{' '}
        {currentPlayer.name}
      </div>
      {myPlayerName && (
        <div className="my-identity">
          {locale === 'zh' ? `你是 ${myPlayerName}` : `You are ${myPlayerName}`}
        </div>
      )}
    </div>
    <div className="status">
      {state.gameOver ? (
        <span className="status-badge game-over">{t(locale, 'ui.statusGameOver')}</span>
      ) : isMyTurn ? (
        <span className="status-badge your-turn">
          {locale === 'zh' ? '轮到你了' : 'Your Turn'}
        </span>
      ) : (
        <span className="status-badge waiting-turn">
          {locale === 'zh' ? `等待 ${currentPlayer.name}` : `Waiting for ${currentPlayer.name}`}
        </span>
      )}
      <span className="status-text">
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
