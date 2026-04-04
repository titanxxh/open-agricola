import { useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, RoundPhase } from '../../../shared/game/types'
import { harvestRounds } from '../../../shared/logic/state'
import { setPage } from '../../app/PageRouter'
import { LocaleSelect } from '../common/LocaleSwitcher'

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
  onUndo: () => void
  onUndoAction: () => void
  onShowScoring: () => void
  historyLength: number
  hasActionStartSnapshot: boolean
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
  myPlayerName,
  isMyTurn,
  onUndo,
  onUndoAction,
  onShowScoring,
  historyLength,
  hasActionStartSnapshot,
  isInteractive,
}: Props) => {
  void allWorkersUsed
  const [menuOpen, setMenuOpen] = useState(false)
  const isHarvestRound = harvestRounds.includes(state.round)
  const phases = isHarvestRound ? PHASES_HARVEST : PHASES_NORMAL

  return (
    <header className={`header-compact ${isMyTurn ? 'my-turn' : 'not-my-turn'}`}>
      <div className="header-left">
        <button type="button" className="header-lobby-btn" onClick={() => setPage('lobby')} title={locale === 'zh' ? '返回大厅' : 'Back to Lobby'}>
          ←
        </button>
        <span className="header-round">R{state.round}/14</span>
        <span className="header-phase-pills">
          {phases.map((phase) => (
            <span key={phase} className={`header-phase-pill${phase === state.phase ? ' active' : ''}`}>
              {PHASE_LABELS[phase][locale]}
            </span>
          ))}
        </span>
      </div>
      <div className="header-right">
        {state.gameOver ? (
          <span className="status-badge game-over">{t(locale, 'ui.statusGameOver')}</span>
        ) : isMyTurn ? (
          <span className="status-badge your-turn">{locale === 'zh' ? '你的回合' : 'Your Turn'}</span>
        ) : (
          <span className="status-badge waiting-turn">{currentPlayer.name}</span>
        )}
        <div className="header-actions">
          <LocaleSelect locale={locale} setLocale={setLocale} className="header-locale-select" />
          <button
            type="button"
            className="header-action-btn"
            onClick={onUndo}
            disabled={!isInteractive || historyLength === 0}
            title={t(locale, 'ui.undoStep')}
          >
            <span className="header-action-btn__icon" aria-hidden>
              ↩
            </span>
            <span className="header-action-btn__label">{t(locale, 'ui.undoStep')}</span>
          </button>
          <button
            type="button"
            className="header-action-btn"
            onClick={onUndoAction}
            disabled={!isInteractive || !hasActionStartSnapshot}
            title={t(locale, 'ui.undoAction')}
          >
            <span className="header-action-btn__icon" aria-hidden>
              ⟲
            </span>
            <span className="header-action-btn__label">{t(locale, 'ui.undoAction')}</span>
          </button>
          <button
            type="button"
            className="header-action-btn"
            onClick={onShowScoring}
            disabled={!isInteractive}
            title={t(locale, 'ui.scoringPadButton')}
          >
            <span className="header-action-btn__icon" aria-hidden>
              📊
            </span>
            <span className="header-action-btn__label">{t(locale, 'ui.scoringPadButton')}</span>
          </button>
          <button
            type="button"
            className="header-action-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            title={t(locale, 'ui.headerMenu')}
          >
            <span className="header-action-btn__icon" aria-hidden>
              ⋯
            </span>
            <span className="header-action-btn__label">{t(locale, 'ui.headerMenu')}</span>
          </button>
        </div>
        {menuOpen && (
          <div className="header-menu">
            <label className="header-menu-item">
              <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
              {t(locale, 'ui.devMode')}
            </label>
            {myPlayerName && (
              <div className="header-menu-item header-menu-identity">{locale === 'zh' ? `你是 ${myPlayerName}` : `You are ${myPlayerName}`}</div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
