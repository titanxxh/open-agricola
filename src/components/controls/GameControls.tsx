import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'

type Props = {
  locale: Locale
  onUndo: () => void
  onUndoAction: () => void
  onShowScoring: () => void
  historyLength: number
  hasActionStartSnapshot: boolean
  isInteractive: boolean
}

export const GameControls = ({
  locale,
  onUndo,
  onUndoAction,
  onShowScoring,
  historyLength,
  hasActionStartSnapshot,
  isInteractive,
}: Props) => (
  <div className="controls">
    <button onClick={onUndo} disabled={!isInteractive || historyLength === 0}>
      {t(locale, 'ui.undoStep')}
    </button>
    <button onClick={onUndoAction} disabled={!isInteractive || !hasActionStartSnapshot}>
      {t(locale, 'ui.undoAction')}
    </button>
    <button onClick={onShowScoring} disabled={!isInteractive}>
      {t(locale, 'ui.scoringPadButton')}
    </button>
  </div>
)
