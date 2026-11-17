import { t, type Locale } from '../../../shared/i18n'
import type { ClientGameState } from '../../services/rehydrate'

type Props = {
  locale: Locale
  requirements: ClientGameState['players'][number]['harvestRequirements'] | undefined
}

export function HarvestRequirements({ locale, requirements }: Props) {
  if (!requirements) return null
  const foodLabel = t(locale, 'ui.harvestRequirementsFood', { count: requirements.food })
  const fuelLabel = t(locale, 'ui.harvestRequirementsFuel', { count: requirements.fuel ?? 0 })
  return (
    <div className="harvest-requirements" data-testid="harvest-requirements" title={t(locale, 'ui.harvestRequirementsHint')}>
      <span className="harvest-requirements__title">{t(locale, 'ui.harvestRequirementsTitle', { round: requirements.round })}</span>
      <span className="harvest-requirements__amount" aria-label={foodLabel} title={foodLabel}>
        <span className="res-icon res-icon-food" aria-hidden="true" />
        <span>{requirements.food}</span>
      </span>
      {requirements.fuel !== null ? (
        <span className="harvest-requirements__amount" aria-label={fuelLabel} title={fuelLabel}>
          <span className="res-icon res-icon-fuel" aria-hidden="true" />
          <span>{requirements.fuel}</span>
        </span>
      ) : null}
    </div>
  )
}
