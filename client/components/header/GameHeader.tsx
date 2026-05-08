import { useEffect, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, RoundPhase } from '../../../shared/contract/types'
import { harvestRounds } from '../../../shared/session/state-constants'
import { setPage } from '../../app/PageRouter'
import { LocaleSwitcher } from '../common/LocaleSwitcher'

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
  state: GameState
  currentPlayer: PlayerState
  devMode: boolean
  setDevMode: (value: boolean) => void
  myPlayerName: string | null
  isMyTurn: boolean
}

export const GameHeader = ({
  locale,
  state,
  currentPlayer,
  devMode,
  setDevMode,
  myPlayerName,
  isMyTurn,
}: Props) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const isHarvestRound = harvestRounds.includes(state.round)
  const phases = isHarvestRound ? PHASES_HARVEST : PHASES_NORMAL

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const node = menuContainerRef.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      setMenuOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  return (
    <header className={`header-compact ${isMyTurn ? 'my-turn' : 'not-my-turn'}`}>
      <div className="header-left">
        <button type="button" className="header-lobby-btn" onClick={() => setPage('lobby')} title={locale === 'zh' ? '返回大厅' : 'Back to Lobby'}>
          ←
        </button>
        <span className="header-round">R{state.round}/14</span>
        <span className="header-phase-pills">
          {phases.map((phase) => (
            <span key={phase} className={`header-phase-pill${phase === state.roundPhase ? ' active' : ''}`}>
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
        <div className="header-actions" ref={menuContainerRef}>
          <LocaleSwitcher className="header-locale-select" />
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
          {menuOpen && (
            <div className="header-menu">
              {devMode ? (
                <label className="header-menu-item">
                  <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
                  {t(locale, 'ui.devMode')}
                </label>
              ) : null}
              {myPlayerName && (
                <div className="header-menu-item header-menu-identity">{locale === 'zh' ? `你是 ${myPlayerName}` : `You are ${myPlayerName}`}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
