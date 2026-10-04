import { useEffect, useId, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, RoundPhase } from '../../../shared/contract/types'
import { harvestRounds } from '../../../shared/contract/state-constants'
import { BrandMark } from '../common/BrandMark'
import { LocaleSwitcher } from '../common/LocaleSwitcher'
import { snakeOpeningPlacementOrders } from './snake-opening-orders'
import { getPlayerDisplayName } from '../../utils/player-name'

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
  embedded?: boolean
}

const shouldShowSnakeOpeningPill = (state: GameState): boolean =>
  state.enableSnakeOpening === true && state.round === 1 && !state.gameOver

export const GameHeader = ({
  locale,
  state,
  currentPlayer,
  devMode,
  setDevMode,
  myPlayerName,
  isMyTurn,
  embedded = false,
}: Props) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const snakePopoverId = useId()
  const isHarvestRound = harvestRounds.includes(state.round)
  const phases = isHarvestRound ? PHASES_HARVEST : PHASES_NORMAL
  const snakeOrders = shouldShowSnakeOpeningPill(state) ? snakeOpeningPlacementOrders(state, locale) : null
  const currentPlayerIndex = state.players?.findIndex((player) => player.id === currentPlayer.id) ?? -1

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
        {!embedded && (
          <BrandMark
            title="Open Agricola"
            className="site-home-brand header-home-brand"
            titleClassName="site-home-brand__title"
            homeLinkLabel={t(locale, 'platform.backToLobbyPlain')}
          />
        )}
        <span className="header-round">R{state.round}/14</span>
        <span className="header-phase-pills">
          {phases.map((phase) => (
            <span key={phase} className={`header-phase-pill${phase === state.roundPhase ? ' active' : ''}`}>
              {PHASE_LABELS[phase][locale]}
            </span>
          ))}
        </span>
        {snakeOrders && (
          <span className="header-snake-opening">
            <span className="header-snake-pill" tabIndex={0} aria-describedby={snakePopoverId}>
              {t(locale, 'ui.snakeOpening')}
            </span>
            <span className="header-snake-popover" role="tooltip" id={snakePopoverId}>
              <span className="header-snake-popover__desc">{t(locale, 'ui.snakeOpeningDescription')}</span>
              <span className="header-snake-popover__row">
                <span className="header-snake-popover__label">{t(locale, 'ui.snakeOpeningFirstPlacement')}</span>
                <span className="header-snake-popover__order">{snakeOrders.first.join(' → ')}</span>
              </span>
              <span className="header-snake-popover__row">
                <span className="header-snake-popover__label">{t(locale, 'ui.snakeOpeningSecondPlacement')}</span>
                <span className="header-snake-popover__order">{snakeOrders.second.join(' → ')}</span>
              </span>
            </span>
          </span>
        )}
      </div>
      <div className="header-right">
        {state.gameOver ? (
          <span className="status-badge game-over">{t(locale, 'ui.statusGameOver')}</span>
        ) : isMyTurn ? (
          <span className="status-badge your-turn">{locale === 'zh' ? '你的回合' : 'Your Turn'}</span>
        ) : (
          <span className="status-badge waiting-turn">
            {getPlayerDisplayName(locale, currentPlayer.name, currentPlayerIndex >= 0 ? currentPlayerIndex : undefined, currentPlayer.nameIsDefault)}
          </span>
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
