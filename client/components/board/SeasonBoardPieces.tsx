import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { SeasonId } from '../../../shared/seasons/types'
import {
  seasonActionCardCopy,
  type SeasonBoardAdjustment,
  type SeasonBoardIcon,
  type SeasonIconToken,
} from '../../../shared/projections/season-display'

type SeasonIconKind =
  | 'wood'
  | 'clay'
  | 'reed'
  | 'stone'
  | 'food'
  | 'grain'
  | 'vegetable'
  | 'sheep'
  | 'field'
  | 'sow'
  | 'bake'
  | 'child-free'
  | 'barn'
  | 'fence-icon'

const seasonIconByToken: Record<SeasonIconToken, SeasonIconKind> = {
  WOOD: 'wood',
  CLAY: 'clay',
  REED: 'reed',
  STONE: 'stone',
  FOOD: 'food',
  GRAIN: 'grain',
  FIELD: 'field',
  FENCE: 'fence-icon',
  STABLE: 'barn',
}

const SeasonIcon = ({ icon }: { icon: SeasonIconKind }) => (
  <span className={`res-icon res-icon-${icon}`} aria-hidden="true" />
)

const SeasonIconRow = ({ items }: { items: readonly SeasonBoardIcon[] }) => (
  <span className="seasons-board__icon-row">
    {items.map(({ token, ...item }, index) => (
      <span key={`${seasonIconByToken[token]}-${index}`} className="seasons-board__icon-item">
        {item.text ? <span className="seasons-board__icon-text">{item.text}</span> : null}
        <SeasonIcon icon={seasonIconByToken[token]} />
        {item.dividerAfter ? <span className="seasons-board__icon-separator">/</span> : null}
        {item.arrowAfter ? <span className="seasons-board__icon-arrow">→</span> : null}
      </span>
    ))}
  </span>
)

export const SeasonBoardCopy = ({ id, children }: { id: string; children: string }) => (
  <span className={`seasons-board__board-copy seasons-board__board-copy--${id}`}>{children}</span>
)

export const SeasonAdjustment = ({ locale, adjustment }: { locale: Locale; adjustment: SeasonBoardAdjustment }) => (
  <span className={`seasons-board__resource-adjustment seasons-board__resource-adjustment--${adjustment.id}`}>
    {adjustment.labelKey ? (
      <span className="seasons-board__adjustment-label">{t(locale, adjustment.labelKey)}</span>
    ) : null}
    {adjustment.accumulation ? <span className="seasons-board__accumulation-arrow" aria-hidden="true" /> : null}
    <SeasonIconRow items={adjustment.items} />
  </span>
)

const SeasonActionBody = ({ locale, season }: { locale: Locale; season: SeasonId }) => {
  if (season === 'winter') {
    const copy = seasonActionCardCopy.winter
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--winter">
        <span className="seasons-board__winter-family">
          <span className="seasons-board__large-plus">+</span>
          <SeasonIcon icon="child-free" />
          <span>{t(locale, copy.family.labelKey)}</span>
        </span>
        <span className="seasons-board__winter-harvest">
          {t(locale, copy.harvestPrefix.labelKey)}
          <span className="seasons-board__inline-icons">
            <span>{copy.foodPerHarvest}</span>
            <SeasonIcon icon="food" />
          </span>
          {t(locale, copy.harvestSuffix.labelKey)}
          <span className="seasons-board__inline-icons">
            <span>{copy.wood}</span>
            <SeasonIcon icon="wood" />
          </span>
        </span>
      </span>
    )
  }

  if (season === 'spring') {
    const copy = seasonActionCardCopy.spring
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--spring">
        <span className="seasons-board__spring-text">
          <span>{t(locale, copy.breeding.labelKey)}</span>
          <span>{t(locale, copy.andOr.labelKey)}</span>
          <strong>{t(locale, copy.sow.labelKey)}</strong>
        </span>
        <SeasonIcon icon="sow" />
      </span>
    )
  }

  if (season === 'summer') {
    const copy = seasonActionCardCopy.summer
    return (
      <span className="seasons-board__action-copy seasons-board__action-copy--summer">
        <span className="seasons-board__summer-plow">
          <strong>{t(locale, copy.plow.labelKey)}</strong>
          <SeasonIcon icon="field" />
        </span>
        <span className="seasons-board__action-and-or">{t(locale, copy.andOr.labelKey)}</span>
        <span className="seasons-board__summer-market">
          <strong>{t(locale, copy.bakeBread.labelKey)}</strong>
          <SeasonIcon icon="bake" />
          <span>{t(locale, copy.or.labelKey)}</span>
          <strong>{t(locale, copy.sellGrain.labelKey)}</strong>
          <span className="seasons-board__trade-line">
            <span>{`-${copy.grainSold}x`}</span>
            <SeasonIcon icon="grain" />
            <span>→</span>
            <span>{copy.foodPerGrain}</span>
            <SeasonIcon icon="food" />
          </span>
        </span>
      </span>
    )
  }

  const copy = seasonActionCardCopy.autumn
  return (
    <span className="seasons-board__action-copy seasons-board__action-copy--autumn">
      <span className="seasons-board__autumn-field">
        <span>{t(locale, copy.fieldPhase.labelKey)}</span>
        <span>{t(locale, copy.andOr.labelKey)}</span>
      </span>
      <span className="seasons-board__autumn-vegetable">
        <span>{`+${copy.vegetable}`}</span>
        <SeasonIcon icon="vegetable" />
      </span>
    </span>
  )
}

export const SeasonActionCard = ({ locale, season, actionName }: { locale: Locale; season: SeasonId; actionName: string }) => (
  <span className="seasons-board__season-action-card">
    <span className="seasons-board__action-header">
      {actionName}
    </span>
    <SeasonActionBody locale={locale} season={season} />
    <span className="seasons-board__action-footer" />
  </span>
)
