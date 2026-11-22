import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import type { Locale } from '../../shared/i18n'
import { t } from '../../shared/i18n'
import { ResourceLine } from '../components/common/ResourceLine'
import { translateCardText } from '../components/common/cardText'
import type { AnytimeExchangeOption } from './anytime-exchange-ui'
import type { HarvestFeedOption } from './hooks/use-harvest-flow'
import type { useReserveCookingDraftPresentation } from './reserve-cooking-draft-presentation'
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
  reserveCooking?: {
    draft: NonNullable<ReturnType<typeof useReserveCookingDraftPresentation>['overlay']>
    confirm: () => void
    cancel: () => void
  }
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

export function HarvestShortfallDialog({ locale, message, onBack, onContinue }: {
  locale: Locale
  message: string
  onBack: () => void
  onContinue: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      className="harvest-shortfall-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={event => { event.preventDefault(); onBack() }}
    >
      <header className="exchange-header">
        <h2 id={titleId} className="exchange-title">{t(locale, 'ui.harvestShortfallTitle')}</h2>
      </header>
      <div className="exchange-content">
        <p id={messageId}>{message}</p>
        <div className="exchange-actions">
          <button type="button" className="exchange-cancel" onClick={onBack}>
            {t(locale, 'ui.harvestShortfallBack')}
          </button>
          <button type="button" className="exchange-confirm" onClick={onContinue}>
            {t(locale, 'ui.interactionContinue')}
          </button>
        </div>
      </div>
    </dialog>
  )
}

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
  reserveCooking,
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

  const recipeDraft = reserveCooking?.draft ?? draft.anytime
  if ((reserveCooking || (draft.anytime.isActive && pendingChoice)) && isInteractive) {
    const summary = reserveCooking ? { food: reserveCooking.draft.food } : draft.anytime.summary
    const hasSummary = reserveCooking ? reserveCooking.draft.food > 0 : draft.anytime.hasSummary
    return (
      <ExchangeModal
        title={t(locale, 'ui.exchangeCenterTitle')}
        subtitle={reserveCooking
          ? t(locale, 'ui.reorgConvertToFood')
          : translateCardText(locale, pendingChoice?.promptKey ?? 'ui.interactionChooseOne')}
        navigation={navigation}
      >
        <div className="exchange-options">
          {recipeDraft.options.map((option) => (
            <ResourceExchangeRow
              key={option.id}
              locale={locale}
              option={option}
              current={recipeDraft.counts[option.id] ?? 0}
              limit={recipeDraft.limitById[option.id] ?? 0}
              mode="payment"
              testId={`${reserveCooking ? 'reserve-cooking' : 'anytime-exchange'}-option-${option.sourceId}-ex${option.exchangeIndex}`}
              onChange={recipeDraft.updateCount}
            />
          ))}
        </div>
        <div className="exchange-footer">
          <div className="exchange-summary">
            {hasSummary ? (
              <ResourceLine
                locale={locale}
                resources={summary}
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
              onClick={reserveCooking?.cancel ?? actions.cancelAnytimeExchange}
            >
              {t(locale, 'ui.interactionCancel')}
            </button>
            <button
              type="button"
              className="exchange-confirm"
              onClick={reserveCooking?.confirm ?? actions.confirmAnytimeExchange}
              disabled={!(reserveCooking?.draft.canConfirm ?? draft.anytime.hasSelection)}
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
