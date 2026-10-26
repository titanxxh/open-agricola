import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { AnytimeAction } from '../../../shared/contract/types'
import { translateCardText } from '../common/cardText'
import { getCardDisplayName } from '../common/cardText'
import { renderDescriptionPreview } from './ActionDescription'

type Props = {
  anytimeActions: AnytimeAction[]
  locale: Locale
  isInteractive: boolean
  takeAnytimeAction: (actionId: string) => void
  variant?: 'standalone' | 'inline'
}

export const AnytimeBar = ({
  anytimeActions,
  locale,
  isInteractive,
  takeAnytimeAction,
  variant = 'standalone',
}: Props) =>
  anytimeActions.length > 0 ? (
    <div className={`anytime-bar${variant === 'inline' ? ' anytime-bar--inline' : ''}`}>
      <div className="anytime-title">{t(locale, 'ui.anytimeActions')}</div>
      <div className="anytime-actions">
        {anytimeActions.map((action) => (
          <button
            key={action.id}
            data-anytime-action-id={action.id}
            className={action.id === 'exchange' ? 'anytime-exchange-button' : undefined}
            aria-label={action.id === 'exchange' ? t(locale, 'ui.exchangeCenterTitle') : undefined}
            title={action.id === 'exchange' ? t(locale, 'ui.exchangeCenterTitle') : undefined}
            onClick={() => takeAnytimeAction(action.id)}
            disabled={!isInteractive}
          >
            {action.id === 'exchange' ? (
              <span className="res-icon res-icon-cook" aria-hidden="true" />
            ) : (
              <>
                {action.sourceCard && !(action.descriptionPreview?.kind === 'action' && action.descriptionPreview.labelKey === `cards.${action.sourceCard}.name` && !action.descriptionPreview.effectPreview) ? <span className="anytime-source">{getCardDisplayName(locale, action.sourceCard)}{': '}</span> : null}
                {action.descriptionPreview ? renderDescriptionPreview(locale, action.descriptionPreview) : translateCardText(
                  locale,
                  action.labelKey,
                  action.labelParams as Record<string, string | number> | undefined,
                )}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null
