import type { ReactNode } from 'react'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import type { Locale } from '../../shared/i18n'
import { t } from '../../shared/i18n'
import { ResourceLine } from '../components/common/ResourceLine'
import { translateCardText } from '../components/common/cardText'
import type { AnytimeExchangeOption } from './anytime-exchange-ui'
import type { HarvestFeedOption } from './hooks/use-harvest-flow'
import type { PendingChoice } from '../types/ui'

type BakeExchangeInfo = Record<string, { food: number; max: number }>

export type ExchangeOverlayDraft = {
  bake: {
    isActive: boolean
    info: BakeExchangeInfo
    options: readonly ActionChoiceOption[]
    counts: Record<string, number>
    limitById: Record<string, number>
    summary: Resource
    hasSelection: boolean
    hasSummary: boolean
    updateCount: (id: string, delta: number) => void
    reset: () => void
  }
  anytime: {
    isActive: boolean
    options: readonly AnytimeExchangeOption[]
    counts: Record<string, number>
    limitById: Record<string, number>
    summary: Resource
    hasSelection: boolean
    hasSummary: boolean
    updateCount: (id: string, delta: number) => void
  }
  harvest: {
    isActive: boolean
    options: readonly HarvestFeedOption[]
    counts: Record<string, number>
    limitById: Record<string, number>
    heating: { required: number; minimum: number; maximum: number; fuelUsed: number; sickWorkers: number; updatePayment: (delta: number) => void } | null
    convertedFood: number
    begging: number
    summary: Resource
    hasSummary: boolean
    updateCount: (id: string, delta: number) => void
    reset: () => void
  }
}

type HarvestPending = {
  playerName: string
  remaining: number
  foodUsed: number
} | null

type ExchangeOverlayActions = {
  confirmBakeExchange: () => void
  confirmAnytimeExchange: () => void
  cancelAnytimeExchange: () => void
  confirmHarvestFeed: () => void
  confirmHeating: () => void
}

type ExchangeOverlayPresentationProps = {
  locale: Locale
  isInteractive: boolean
  pendingChoice: PendingChoice | null
  harvestPending: HarvestPending
  heatingPending?: { playerName: string; required: number } | null
  heatingConfirmDisabled?: boolean
  harvestFeedConfirmDisabled?: boolean
  draft: ExchangeOverlayDraft
  cardLabel: (id: string) => string
  actions: ExchangeOverlayActions
  navigation?: ReactNode
}

const resourceMap = (resources: Partial<Resource>): Resource => ({
  ...emptyResources,
  ...resources,
})

const ExchangeStepControl = ({
  current,
  canAdd,
  canSubtract,
  onChange,
}: {
  current: number
  canAdd: boolean
  canSubtract: boolean
  onChange: (delta: number) => void
}) => (
  <div className="exchange-steps">
    <button
      type="button"
      className="exchange-step"
      onClick={() => onChange(-1)}
      disabled={!canSubtract}
    >
      -
    </button>
    <div className="exchange-count">{current}</div>
    <button
      type="button"
      className="exchange-step"
      onClick={() => onChange(1)}
      disabled={!canAdd}
    >
      +
    </button>
  </div>
)

const ExchangeModal = ({
  title,
  subtitle,
  children,
  navigation,
}: {
  title: string
  subtitle: string
  children: ReactNode
  navigation?: ReactNode
}) => (
  <div className="exchange-overlay">
    <div className="exchange-modal">
      <div className="exchange-header">
        <div className="exchange-title">{title}</div>
        <div className="exchange-subtitle">{subtitle}</div>
        {navigation ? <div className="exchange-view-navigation">{navigation}</div> : null}
      </div>
      <div className="exchange-content">{children}</div>
    </div>
  </div>
)

const ResourceExchangeRow = ({
  locale,
  option,
  current,
  limit,
  mode,
  testId,
  onChange,
}: {
  locale: Locale
  option: Pick<HarvestFeedOption, 'id' | 'sourceId' | 'exchangeIndex' | 'sourceName' | 'from' | 'to'>
  current: number
  limit: number
  mode?: 'payment'
  testId: string
  onChange: (id: string, delta: number) => void
}) => (
  <div
    className="exchange-row"
    data-testid={testId}
  >
    <div className="exchange-name">{option.sourceName}</div>
    <div className="exchange-rate">
      <span className="interaction-resource-exchange">
        <ResourceLine
          locale={locale}
          mode={mode}
          resources={resourceMap(option.from)}
          hideZero
        />
        <span className="interaction-resource-exchange-arrow" aria-hidden="true">
          <span className="res-icon res-icon-arrow" />
        </span>
        <ResourceLine
          locale={locale}
          resources={resourceMap(option.to)}
          hideZero
        />
      </span>
    </div>
    <ExchangeStepControl
      current={current}
      canAdd={current < limit}
      canSubtract={current > 0}
      onChange={(delta) => onChange(option.id, delta)}
    />
  </div>
)

export const ExchangeOverlayPresentation = ({
  locale,
  isInteractive,
  pendingChoice,
  harvestPending,
  heatingPending,
  heatingConfirmDisabled,
  harvestFeedConfirmDisabled,
  draft,
  cardLabel,
  actions,
  navigation,
}: ExchangeOverlayPresentationProps) => {
  const heating = draft.harvest.heating
  const settlementPlayer = heating ? heatingPending : harvestPending
  if (draft.harvest.isActive && settlementPlayer && isInteractive) {
    return (
      <ExchangeModal
        title={t(locale, 'ui.exchangeCenterTitle')}
        subtitle={t(locale, heating ? 'ui.harvestHeatingSubtitle' : 'ui.harvestFeedSubtitle', {
          player: settlementPlayer.playerName,
          count: heating?.required ?? harvestPending?.remaining ?? 0,
        })}
        navigation={navigation}
      >
        <div className="exchange-options">
          {draft.harvest.options.map((option) => (
            <ResourceExchangeRow
              key={option.id}
              locale={locale}
              option={option}
              current={draft.harvest.counts[option.id] ?? 0}
              limit={draft.harvest.limitById[option.id] ?? 0}
              testId={`${heating ? 'heating' : 'harvest-feed'}-option-${option.sourceId}-ex${option.exchangeIndex}`}
              onChange={draft.harvest.updateCount}
            />
          ))}
        </div>
        {heating ? <div className="exchange-row" data-testid="heating-fuel-payment">
          <div className="exchange-name">{t(locale, 'ui.harvestHeatingFuelUsed')}</div>
          <ResourceLine locale={locale} resources={{ fuel: heating.fuelUsed }} hideZero />
          <ExchangeStepControl current={heating.fuelUsed} canAdd={heating.fuelUsed < heating.maximum}
            canSubtract={heating.fuelUsed > heating.minimum} onChange={heating.updatePayment} />
        </div> : null}
        <div className="exchange-footer">
          <div className="exchange-summary">
            <div className="exchange-progress">
              {heating ? t(locale, 'ui.harvestHeatingProgress', {
                paid: heating.fuelUsed, required: heating.required, sick: heating.sickWorkers,
              }) : t(locale, 'ui.harvestFeedProgress', {
                fed: (harvestPending?.foodUsed ?? 0) + draft.harvest.convertedFood,
                required: (harvestPending?.foodUsed ?? 0) + (harvestPending?.remaining ?? 0),
                begging: draft.harvest.begging,
              })}
            </div>
            {draft.harvest.hasSummary ? (
              <ResourceLine
                locale={locale}
                resources={draft.harvest.summary}
                emptyLabel={t(locale, 'ui.noResources')}
              />
            ) : (
              t(locale, 'ui.noResources')
            )}
          </div>
          <div className="exchange-actions">
            <button
              type="button"
              className="exchange-cancel"
              onClick={draft.harvest.reset}
            >
              {t(locale, 'ui.exchangeReset')}
            </button>
            <button
              type="button"
              className="exchange-confirm"
              onClick={heating ? actions.confirmHeating : actions.confirmHarvestFeed}
              disabled={heating ? heatingConfirmDisabled : harvestFeedConfirmDisabled}
            >
              {t(locale, 'ui.interactionConfirmButton')}
            </button>
          </div>
        </div>
      </ExchangeModal>
    )
  }

  if (draft.anytime.isActive && pendingChoice && isInteractive) {
    return (
      <ExchangeModal
        title={t(locale, 'ui.exchangeCenterTitle')}
        subtitle={translateCardText(locale, pendingChoice.promptKey ?? 'ui.interactionChooseOne')}
        navigation={navigation}
      >
        <div className="exchange-options">
          {draft.anytime.options.map((option) => (
            <ResourceExchangeRow
              key={option.id}
              locale={locale}
              option={option}
              current={draft.anytime.counts[option.id] ?? 0}
              limit={draft.anytime.limitById[option.id] ?? 0}
              mode="payment"
              testId={`anytime-exchange-option-${option.sourceId}-ex${option.exchangeIndex}`}
              onChange={draft.anytime.updateCount}
            />
          ))}
        </div>
        <div className="exchange-footer">
          <div className="exchange-summary">
            {draft.anytime.hasSummary ? (
              <ResourceLine
                locale={locale}
                resources={draft.anytime.summary}
                emptyLabel={t(locale, 'ui.noResources')}
              />
            ) : (
              t(locale, 'ui.noResources')
            )}
          </div>
          <div className="exchange-actions">
            <button
              type="button"
              className="exchange-cancel"
              onClick={actions.cancelAnytimeExchange}
            >
              {t(locale, 'ui.interactionCancel')}
            </button>
            <button
              type="button"
              className="exchange-confirm"
              onClick={actions.confirmAnytimeExchange}
              disabled={!draft.anytime.hasSelection}
            >
              {t(locale, 'ui.interactionConfirmButton')}
            </button>
          </div>
        </div>
      </ExchangeModal>
    )
  }

  if (draft.bake.isActive && pendingChoice && isInteractive) {
    return (
      <ExchangeModal
        title={t(locale, 'ui.bakeBreadTitle')}
        subtitle={translateCardText(locale, pendingChoice.promptKey ?? 'ui.interactionChooseOne')}
        navigation={navigation}
      >
        <div className="exchange-options">
          {draft.bake.options.map((option) => {
            const info = draft.bake.info[option.value] ?? {
              food: 0,
              max: 0,
            }
            const current = draft.bake.counts[option.value] ?? 0
            const limit = draft.bake.limitById[option.value] ?? 0
            const rateText = Number.isFinite(info.max)
              ? t(locale, 'ui.bakeBreadRateLimited', {
                  max: info.max,
                  food: info.food,
                })
              : t(locale, 'ui.bakeBreadRate', { food: info.food })
            return (
              <div key={option.value} className="exchange-row">
                <div className="exchange-name">{cardLabel(option.value)}</div>
                <div className="exchange-rate">{rateText}</div>
                <ExchangeStepControl
                  current={current}
                  canAdd={current < limit}
                  canSubtract={current > 0}
                  onChange={(delta) => draft.bake.updateCount(option.value, delta)}
                />
              </div>
            )
          })}
        </div>
        <div className="exchange-footer">
          <div className="exchange-summary">
            {draft.bake.hasSummary ? (
              <ResourceLine
                locale={locale}
                resources={draft.bake.summary}
                emptyLabel={t(locale, 'ui.noResources')}
              />
            ) : (
              t(locale, 'ui.noResources')
            )}
          </div>
          <div className="exchange-actions">
            <button
              type="button"
              className="exchange-cancel"
              onClick={draft.bake.reset}
            >
              {t(locale, 'ui.exchangeReset')}
            </button>
            <button
              type="button"
              className="exchange-confirm"
              onClick={actions.confirmBakeExchange}
              disabled={!draft.bake.hasSelection}
            >
              {t(locale, 'ui.interactionConfirmButton')}
            </button>
          </div>
        </div>
      </ExchangeModal>
    )
  }

  return null
}
