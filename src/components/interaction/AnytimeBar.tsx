import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { AnytimeAction } from '../../../shared/game/types'

type Props = {
  anytimeActions: AnytimeAction[]
  locale: Locale
  isInteractive: boolean
  takeAnytimeAction: (actionId: string) => void
}

export const AnytimeBar = ({
  anytimeActions,
  locale,
  isInteractive,
  takeAnytimeAction,
}: Props) =>
  anytimeActions.length > 0 ? (
    <div className="anytime-bar">
      <div className="anytime-title">{t(locale, 'ui.anytimeActions')}</div>
      <div className="anytime-actions">
        {anytimeActions.map((action) => (
          <button
            key={action.id}
            onClick={() => takeAnytimeAction(action.id)}
            disabled={!isInteractive}
          >
            {t(locale, action.labelKey, action.labelParams as Record<string, string | number> | undefined)}
          </button>
        ))}
      </div>
    </div>
  ) : null
