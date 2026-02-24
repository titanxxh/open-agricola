import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'

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
  isInteractive: boolean
  devMode: boolean
  seedValue: string
  onSeedChange: (value: string) => void
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
  isInteractive,
  devMode,
  seedValue,
  onSeedChange,
}: Props) => (
  <div className="controls">
    <button onClick={onUndo} disabled={!isInteractive || historyLength === 0}>
      {t(locale, 'ui.undoStep')}
    </button>
    <button onClick={onUndoAction} disabled={!isInteractive || !hasActionStartSnapshot}>
      {t(locale, 'ui.undoAction')}
    </button>
    <button onClick={onUndoRound} disabled={!isInteractive || !hasActionStartSnapshot}>
      {t(locale, 'ui.undoRound')}
    </button>
    <button onClick={onEndRound} disabled={!isInteractive || !allWorkersUsed || isGameOver}>
      {t(locale, 'ui.endRound')}
    </button>
    <button onClick={onShowScoring} disabled={!isInteractive}>
      {t(locale, 'ui.scoringPadButton')}
    </button>
    {devMode ? (
      <label className="seed-input">
        {t(locale, 'ui.resetSeed')}
        <input
          type="number"
          value={seedValue}
          placeholder={t(locale, 'ui.resetSeedPlaceholder')}
          onChange={(event) => onSeedChange(event.target.value)}
          disabled={!isInteractive}
        />
      </label>
    ) : null}
    <button onClick={onResetGame} disabled={!isInteractive}>
      {t(locale, 'ui.resetGame')}
    </button>
  </div>
)
