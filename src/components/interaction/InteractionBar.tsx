import type { Locale } from '../../../shared/i18n'
import { t, type TranslationKey } from '../../../shared/i18n'
import type { PendingChoice, PendingAnimalReorg } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import type { Resource } from '../../../shared/game/types'

type Props = {
  pendingAnimalReorg: PendingAnimalReorg | null
  pendingChoice: PendingChoice | null
  pendingNextPlayerIndex: number | null
  pendingPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  locale: Locale
  playerNames: string[]
  pendingRoomTilesLength: number
  maxRoomSelections: number
  pendingStableTilesLength: number
  maxStableSelections: number
  pendingSowSelectionsLength?: number
  hasPendingPlowSelection: boolean
  fenceErrorText: string
  roomErrorText: string
  stableErrorText: string
  plowErrorText: string
  sowErrorText: string
  isSelectingFences: boolean
  isSelectingRooms: boolean
  isSelectingStables: boolean
  isSelectingPlow: boolean
  isSelectingSow: boolean
  isInteractive: boolean
  resolveChoice: (value: string) => void
  confirmNextPlayer: () => void
  confirmPlayerSwitch: () => void
  harvestFeedPlayerName: string | null
  confirmHarvestFeed: () => void
}

export const InteractionBar = ({
  pendingAnimalReorg,
  pendingChoice,
  pendingNextPlayerIndex,
  pendingPlayerSwitch,
  locale,
  playerNames,
  pendingRoomTilesLength,
  maxRoomSelections,
  pendingStableTilesLength,
  maxStableSelections,
  pendingSowSelectionsLength,
  hasPendingPlowSelection,
  fenceErrorText,
  roomErrorText,
  stableErrorText,
  plowErrorText,
  sowErrorText,
  isSelectingFences,
  isSelectingRooms,
  isSelectingStables,
  isSelectingPlow,
  isSelectingSow,
  isInteractive,
  resolveChoice,
  confirmNextPlayer,
  confirmPlayerSwitch,
  harvestFeedPlayerName,
  confirmHarvestFeed,
}: Props) => {
  const isFarmSelectionPrompt =
    pendingChoice?.promptKey === 'ui.interactionFenceSelect' ||
    pendingChoice?.promptKey === 'ui.interactionRoomSelect' ||
    pendingChoice?.promptKey === 'ui.interactionStableSelect' ||
    pendingChoice?.promptKey === 'ui.interactionPlowSelect' ||
    pendingChoice?.promptKey === 'ui.interactionSowSelect'
  const visibleOptions =
    pendingChoice?.promptKey === 'ui.interactionPlowSelect' && hasPendingPlowSelection
      ? pendingChoice.options.filter((option) => option.value === 'confirm')
      : isFarmSelectionPrompt
        ? (pendingChoice?.options ?? []).filter((option) => option.value !== 'cancel')
        : pendingChoice?.options ?? []
  const isRoomConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionRoomSelect' &&
    pendingRoomTilesLength === 0
  const isStableConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionStableSelect' &&
    pendingStableTilesLength === 0

  return (
    <div className="interaction-bar">
      {pendingAnimalReorg ? (
        <>
          <div className="interaction-title">
            {t(locale, 'ui.interactionReorgAnimalsTitle')}
          </div>
          <div className="interaction-subtitle">
            {t(locale, 'ui.interactionReorgAnimalsSubtitle')}
          </div>
        </>
      ) : harvestFeedPlayerName ? (
        <>
          <div className="interaction-title">
            {t(locale, 'ui.harvestFeedConfirm')}
          </div>
          <div className="interaction-actions">
            <button onClick={confirmHarvestFeed} disabled={!isInteractive}>
              {t(locale, 'ui.interactionConfirmButton')}
            </button>
          </div>
        </>
      ) : pendingChoice && isInteractive ? (
        <>
          <div className="interaction-title">
            {t(locale, pendingChoice.promptKey as TranslationKey ?? 'ui.interactionChooseOne')}
          </div>
          {pendingChoice.promptKey === 'ui.interactionRoomSelect' ? (
            <div className="interaction-subtitle">
              {t(locale, 'ui.interactionRoomSelectSubtitle', {
                selected: pendingRoomTilesLength,
                max: maxRoomSelections,
              })}
            </div>
          ) : null}
          {pendingChoice.promptKey === 'ui.interactionStableSelect' ? (
            <div className="interaction-subtitle">
              {t(locale, 'ui.interactionStableSelectSubtitle', {
                selected: pendingStableTilesLength,
                max: maxStableSelections,
              })}
            </div>
          ) : null}
          {pendingChoice.promptKey === 'ui.interactionSowSelect' ? (
            <div className="interaction-subtitle">
              {t(locale, 'ui.interactionSowSelectSubtitle', {
                selected: pendingSowSelectionsLength ?? 0,
              })}
            </div>
          ) : null}
          {isSelectingFences && fenceErrorText ? (
            <div className="interaction-error">{fenceErrorText}</div>
          ) : null}
          {isSelectingRooms && roomErrorText ? (
            <div className="interaction-error">{roomErrorText}</div>
          ) : null}
          {isSelectingStables && stableErrorText ? (
            <div className="interaction-error">{stableErrorText}</div>
          ) : null}
          {isSelectingPlow && plowErrorText ? (
            <div className="interaction-error">{plowErrorText}</div>
          ) : null}
          {isSelectingSow && sowErrorText ? (
            <div className="interaction-error">{sowErrorText}</div>
          ) : null}
          {pendingChoice.promptKey === 'ui.interactionBakeBreadChoice' ? null : (
            <div className="interaction-actions">
              {visibleOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => resolveChoice(option.value)}
                  disabled={
                    !isInteractive ||
                    (pendingChoice.promptKey === 'ui.interactionRoomSelect' &&
                      option.value === 'confirm' &&
                      isRoomConfirmDisabled) ||
                    (pendingChoice.promptKey === 'ui.interactionStableSelect' &&
                      option.value === 'confirm' &&
                      isStableConfirmDisabled) ||
                    (pendingChoice.promptKey === 'ui.interactionPlowSelect' &&
                      option.value === 'confirm' &&
                      !hasPendingPlowSelection) ||
                    (pendingChoice.promptKey === 'ui.interactionSowSelect' &&
                      option.value === 'confirm' &&
                      (pendingSowSelectionsLength ?? 0) === 0)
                  }
                >
                  {option.labelKey === 'prompt.selectPaymentOption' && option.labelParams && typeof option.labelParams === 'object' && 'resourcesPaid' in option.labelParams ? (
                    <span className="payment-option-content">
                      {Object.keys(option.labelParams.resourcesPaid as Partial<Resource>).filter(k => (option.labelParams?.resourcesPaid as Record<string, number>)[k] > 0).length === 0 ? (
                        <span>{t(locale, 'ui.interactionPaymentFree')}</span>
                      ) : (
                        <ResourceLine locale={locale} resources={option.labelParams.resourcesPaid as Partial<Resource>} hideZero />
                      )}
                      {option.labelParams.cardUsed && (
                        <span className="payment-option-card">
                          {' '}
                          ({t(locale, 'ui.interactionPaymentReturn')} {(option.labelParams.cardUsed as string).startsWith('Major_') ? t(locale, `improvements.${option.labelParams.cardUsed as string}.name` as TranslationKey) : t(locale, `minorImprovements.${option.labelParams.cardUsed as string}.name` as TranslationKey)})
                        </span>
                      )}
                    </span>
                  ) : option.labelKey === 'ui.interactionActionOrReplace' &&
                    option.labelParams &&
                    typeof option.labelParams.actionNameKey === 'string' ? (
                    t(locale, option.labelKey, {
                      action: t(locale, option.labelParams.actionNameKey),
                    })
                  ) : option.labelKey === 'ui.interactionUseCard' &&
                    option.labelParams &&
                    typeof option.labelParams.cardNameKey === 'string' ? (
                    t(locale, option.labelKey, {
                      card: t(locale, option.labelParams.cardNameKey),
                    })
                  ) : (
                    t(locale, option.labelKey, option.labelParams)
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : pendingPlayerSwitch && isInteractive ? (
        <>
          <div className="interaction-title">
            {t(locale, 'ui.interactionPlayerSwitchPrompt', {
              player: playerNames[pendingPlayerSwitch.toPlayerIndex] ?? `Player ${pendingPlayerSwitch.toPlayerIndex + 1}`,
            })}
          </div>
          <div className="interaction-actions">
            <button onClick={confirmPlayerSwitch} disabled={!isInteractive}>
              {t(locale, 'ui.interactionPlayerSwitchConfirm')}
            </button>
          </div>
        </>
      ) : pendingNextPlayerIndex !== null && isInteractive ? (
        <>
          <div className="interaction-title">
            {t(locale, 'ui.interactionConfirmNext')}
          </div>
          <div className="interaction-actions">
            <button onClick={confirmNextPlayer} disabled={!isInteractive}>
              {t(locale, 'ui.interactionConfirmSwitch')}
            </button>
          </div>
        </>
      ) : (
        <div className="interaction-title">
          {isInteractive ? t(locale, 'ui.interactionChooseOne') : t(locale, 'ui.statusWaiting')}
        </div>
      )}
    </div>
  )
}
