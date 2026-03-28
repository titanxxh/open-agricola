import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, RoundPhase } from '../../../shared/game/types'
import { harvestRounds } from '../../../shared/logic/state'
import { setPage } from '../../app/PageRouter'

const PHASES_NORMAL: RoundPhase[] = ['preparation', 'work', 'returning-home']
const PHASES_HARVEST: RoundPhase[] = ['preparation', 'work', 'returning-home', 'harvest', 'field', 'feeding', 'breeding']

const PHASE_LABELS: Record<RoundPhase, Record<Locale, string>> = {
  'preparation':    { en: 'Preparation',    zh: '准备' },
  'work':           { en: 'Work',           zh: '工作' },
  'returning-home': { en: 'Returning Home', zh: '回家' },
  'harvest':        { en: 'Harvest',        zh: '收获' },
  'field':          { en: 'Field',          zh: '收割' },
  'feeding':        { en: 'Feeding',        zh: '喂食' },
  'breeding':       { en: 'Breeding',       zh: '繁殖' },
}

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
}: Props) => {
  const isHarvestRound = harvestRounds.includes(state.round)
  const phases = isHarvestRound ? PHASES_HARVEST : PHASES_NORMAL

  return (
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
        <button
          type="button"
          className="header-lobby-btn"
          onClick={() => setPage('lobby')}
          title={locale === 'zh' ? '返回大厅' : 'Back to Lobby'}
        >
          {locale === 'zh' ? '← 大厅' : '← Lobby'}
        </button>
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
      <div className="phase-bar">
        <span className="phase-round">
          {t(locale, 'ui.round')} <strong>{state.round}</strong> / 14
        </span>
        {phases.map((phase, i) => (
          <span key={phase}>
            {i > 0 && <span className="phase-separator">&#x25B8;</span>}
            <span className={`phase-label${phase === state.phase ? ' phase-active' : ''}`}>
              {PHASE_LABELS[phase][locale]}
            </span>
          </span>
        ))}
      </div>
    </header>
  )
}
