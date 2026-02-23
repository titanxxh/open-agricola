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
  devMode,
  seedValue,
  onSeedChange,
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
    {devMode ? (
      <label className="seed-input">
        {t(locale, 'ui.resetSeed')}
        <input
          type="number"
          value={seedValue}
          placeholder={t(locale, 'ui.resetSeedPlaceholder')}
          onChange={(event) => onSeedChange(event.target.value)}
        />
      </label>
    ) : null}
    <button onClick={onResetGame}>{t(locale, 'ui.resetGame')}</button>
  </div>
)
