import { t as translateMessage } from '../../../shared/i18n'
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { GameState, PlayerState, RoundPhase } from '../../../shared/contract/types'
import { harvestRounds } from '../../../shared/contract/state-constants'
import { BrandMark } from '../common/BrandMark'
import { LocaleSwitcher } from '../common/LocaleSwitcher'
import { SiteCommunityLinks } from '../common/SiteCommunityLinks'
import { snakeOpeningPlacementOrders } from './snake-opening-orders'
import { getPlayerDisplayName } from '../../utils/player-name'

const PHASES_NORMAL: RoundPhase[] = ['preparation', 'work', 'returning-home']
const PHASES_HARVEST: RoundPhase[] = ['preparation', 'work', 'returning-home', 'harvest', 'field', 'feeding', 'breeding']


type Props = {
  locale: Locale
  state: GameState
  currentPlayer: PlayerState
  devMode: boolean
  setDevMode: (value: boolean) => void
  myPlayerName: string | null
  isMyTurn: boolean
  embedded?: boolean
  menuExtra?: ReactNode
  menuAlert?: boolean
  onOpenEncyclopedia?: () => void
  encyclopediaEntryRef?: Ref<HTMLButtonElement>
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
  menuExtra = null,
  menuAlert = false,
  onOpenEncyclopedia,
  encyclopediaEntryRef,
}: Props) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)
  const menuAlertSeen = useRef(false)
  const snakePopoverId = useId()
  const isSetup = state.phase === 'draft' || state.phase === 'parent-selection'
  const isHarvestRound = harvestRounds.includes(state.round)
  const phases = isHarvestRound ? PHASES_HARVEST : PHASES_NORMAL
  const snakeOrders = !isSetup && shouldShowSnakeOpeningPill(state) ? snakeOpeningPlacementOrders(state, locale) : null
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

  useEffect(() => {
    if (!menuAlert) {
      menuAlertSeen.current = false
      return
    }
    if (menuAlertSeen.current) return
    menuAlertSeen.current = true
    setMenuOpen(true)
  }, [menuAlert])

  return (
    <header className={`header-compact${menuOpen ? ' header-compact--menu-open' : ''}${isSetup ? '' : isMyTurn ? ' my-turn' : ' not-my-turn'}`}>
      <div className="header-left">
        {!embedded && (
          <BrandMark
            title="Open Agricola"
            className="site-home-brand header-home-brand"
            titleClassName="site-home-brand__title"
            homeLinkLabel={t(locale, 'platform.backToLobbyPlain')}
          />
        )}
        {!isSetup && <span className="header-round">R{state.round}/14</span>}
        {state.enableMoorBalanceRules === true && (
          <span className="header-moor-balance" data-testid="moor-balance-rules" title={t(locale, 'platform.moorBalanceRulesHint')}>
            {t(locale, 'platform.moorBalanceRules')}
          </span>
        )}
        {!isSetup && <span className="header-phase-pills">
          {phases.map((phase) => (
            <span key={phase} className={`header-phase-pill${phase === state.roundPhase ? ' active' : ''}`}>
              {t(locale, `ui.phases.${phase}`)}
            </span>
          ))}
        </span>}
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
        {!isSetup && (state.gameOver ? (
          <span className="status-badge game-over">{t(locale, 'ui.statusGameOver')}</span>
        ) : isMyTurn ? (
          <span className="status-badge your-turn">{translateMessage(locale, "ui.copy.components_header_GameHeader.your_turn_a14e9a")}</span>
        ) : (
          <span className="status-badge waiting-turn" data-player-color={currentPlayer.color} style={{ backgroundColor: currentPlayer.color }}>
            {t(locale, 'ui.waitingForPlayerAction', {
              player: getPlayerDisplayName(locale, currentPlayer.name, currentPlayerIndex >= 0 ? currentPlayerIndex : undefined, currentPlayer.nameIsDefault),
            })}
          </span>
        ))}
        <div className="header-actions" ref={menuContainerRef}>
          {!embedded && <SiteCommunityLinks />}
          <LocaleSwitcher className="header-locale-select" />
          {onOpenEncyclopedia && (
            <button
              ref={encyclopediaEntryRef}
              type="button"
              className="header-action-btn header-encyclopedia-btn"
              onClick={onOpenEncyclopedia}
              aria-haspopup="dialog"
              aria-label={t(locale, 'ui.encyclopedia.inGame.open')}
              title={t(locale, 'ui.encyclopedia.inGame.open')}
            >
              <span className="header-action-btn__icon" aria-hidden>
                📖
              </span>
              <span className="header-action-btn__label">{t(locale, 'ui.encyclopedia.inGame.open')}</span>
            </button>
          )}
          <button
            type="button"
            className={`header-action-btn${menuAlert ? ' header-action-btn--pending' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            data-game-end-pending={menuAlert ? 'true' : 'false'}
            title={t(locale, 'ui.headerMenu')}
          >
            <span className="header-action-btn__icon" aria-hidden>
              ⋯
            </span>
            <span className="header-action-btn__label">{t(locale, 'ui.headerMenu')}</span>
          </button>
          <div className="header-menu" hidden={!menuOpen}>
            {devMode ? (
              <label className="header-menu-item">
                <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
                {t(locale, 'ui.devMode')}
              </label>
            ) : null}
            {myPlayerName && (
              <div className="header-menu-item header-menu-identity">{translateMessage(locale, "ui.copy.components_header_GameHeader.you_are_8f0fa0", { value0: myPlayerName })}</div>
            )}
            {menuExtra}
          </div>
        </div>
      </div>
    </header>
  )
}
