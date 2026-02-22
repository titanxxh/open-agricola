import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { PendingChoice, PendingAnimalReorg } from '../../types/ui'

type Props = {
  pendingAnimalReorg: PendingAnimalReorg | null
  pendingChoice: PendingChoice | null
  pendingNextPlayerIndex: number | null
  locale: Locale
  pendingRoomTilesLength: number
  maxRoomSelections: number
  pendingStableTilesLength: number
  maxStableSelections: number
  pendingSowSelectionsLength?: number
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
  resolveChoice: (value: string) => void
  confirmNextPlayer: () => void
  harvestFeedPlayerName: string | null
  confirmHarvestFeed: () => void
}

export const InteractionBar = ({
  pendingAnimalReorg,
  pendingChoice,
  pendingNextPlayerIndex,
  locale,
  pendingRoomTilesLength,
  maxRoomSelections,
  pendingStableTilesLength,
  maxStableSelections,
  pendingSowSelectionsLength,
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
  resolveChoice,
  confirmNextPlayer,
  harvestFeedPlayerName,
  confirmHarvestFeed,
}: Props) => (
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
          <button onClick={confirmHarvestFeed}>
            {t(locale, 'ui.interactionConfirmButton')}
          </button>
        </div>
      </>
    ) : pendingChoice ? (
      <>
        <div className="interaction-title">
          {t(locale, pendingChoice.promptKey ?? 'ui.interactionChooseOne')}
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
            {pendingChoice.options.map((option) => (
              <button
                key={option.value}
                onClick={() => resolveChoice(option.value)}
                disabled={
                  pendingChoice.promptKey === 'ui.interactionSowSelect' &&
                  option.value === 'confirm' &&
                  (pendingSowSelectionsLength ?? 0) === 0
                }
              >
                {t(locale, option.labelKey, option.labelParams)}
              </button>
            ))}
          </div>
        )}
      </>
    ) : pendingNextPlayerIndex !== null ? (
      <>
        <div className="interaction-title">
          {t(locale, 'ui.interactionConfirmNext')}
        </div>
        <div className="interaction-actions">
          <button onClick={confirmNextPlayer}>
            {t(locale, 'ui.interactionConfirmButton')}
          </button>
        </div>
      </>
    ) : (
      <div className="interaction-title">{t(locale, 'ui.interactionChooseOne')}</div>
    )}
  </div>
)
