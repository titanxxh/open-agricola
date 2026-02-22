import type { Locale } from '../../i18n'
import { t } from '../../i18n'

type Props = {
  locale: Locale
  onUndo: () => void
  onUndoAction: () => void
  onUndoRound: () => void
  onEndRound: () => void
  onResetGame: () => void
  onShowScoring: () => void
  historyLength: number
  hasActionStartSnapshot: boolean
  allWorkersUsed: boolean
  isGameOver: boolean
}

export const GameControls = ({
  locale,
  onUndo,
  onUndoAction,
  onUndoRound,
  onEndRound,
  onResetGame,
  onShowScoring,
  historyLength,
  hasActionStartSnapshot,
  allWorkersUsed,
  isGameOver,
}: Props) => (
  <div className="controls">
    <button onClick={onUndo} disabled={historyLength === 0}>
      {t(locale, 'ui.undoStep')}
    </button>
    <button onClick={onUndoAction} disabled={!hasActionStartSnapshot}>
      {t(locale, 'ui.undoAction')}
    </button>
    <button onClick={onUndoRound} disabled={!hasActionStartSnapshot}>
      {t(locale, 'ui.undoRound')}
    </button>
    <button onClick={onEndRound} disabled={!allWorkersUsed || isGameOver}>
      {t(locale, 'ui.endRound')}
    </button>
    <button onClick={onShowScoring}>{t(locale, 'ui.scoringPadButton')}</button>
    <button onClick={onResetGame}>{t(locale, 'ui.resetGame')}</button>
  </div>
)
