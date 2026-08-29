import { useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { Resource } from '../../../shared/contract/types'

type ResourceKey = keyof Resource

type Props = {
  locale: Locale
  discardAvailableByResource: Partial<Record<ResourceKey, number>>
  receiveResources: readonly ResourceKey[]
  maxTotal: number
  promptKey?: string
  isConfirmDisabled?: (payload: {
    discard: Partial<Record<ResourceKey, number>>
    receive: Partial<Record<ResourceKey, number>>
  }) => boolean
  onConfirm: (payload: {
    discard: Partial<Record<ResourceKey, number>>
    receive: Partial<Record<ResourceKey, number>>
  }) => void
  onCancel: () => void
}

const normalizeCount = (value: unknown, max: number) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : 0
  return Math.max(0, Math.min(max, normalized))
}

const stripZeroes = (
  values: Partial<Record<ResourceKey, number>>,
): Partial<Record<ResourceKey, number>> =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'number' && value > 0),
  ) as Partial<Record<ResourceKey, number>>

export const ResourceBatchExchangePanel = ({
  locale,
  discardAvailableByResource,
  receiveResources,
  maxTotal,
  promptKey,
  isConfirmDisabled,
  onConfirm,
  onCancel,
}: Props) => {
  const discardEntries = Object.entries(discardAvailableByResource) as Array<[ResourceKey, number]>
  const [discard, setDiscard] = useState<Partial<Record<ResourceKey, number>>>({})
  const [receive, setReceive] = useState<Partial<Record<ResourceKey, number>>>({})
  const discardTotal = discardEntries.reduce((sum, [key]) => sum + (discard[key] ?? 0), 0)
  const receiveTotal = receiveResources.reduce((sum, key) => sum + (receive[key] ?? 0), 0)
  const totalsValid = discardTotal === receiveTotal && discardTotal <= maxTotal
  const payload = { discard: stripZeroes(discard), receive: stripZeroes(receive) }

  const setCount = (
    setter: (value: Partial<Record<ResourceKey, number>>) => void,
    previous: Partial<Record<ResourceKey, number>>,
    key: ResourceKey,
    value: number,
    max: number,
  ) => {
    setter({ ...previous, [key]: normalizeCount(value, max) })
  }

  return (
    <div className="resource-batch-exchange-panel interaction-resource-quantity-panel">
      <div className="interaction-title">
        {promptKey ? t(locale, promptKey) : t(locale, 'ui.interactionSleightOfHand')}
      </div>
      <div className="resource-quantity-grid">
        {discardEntries.map(([key, max]) => (
          <label key={`discard-${key}`} className="resource-quantity-row">
            <span className="resource-quantity-label">{t(locale, 'ui.interactionBatchExchangeDiscard', {
              type: t(locale, `resources.${key}`),
              max,
            })}</span>
            <input
              type="number"
              min={0}
              max={max}
              value={discard[key] ?? 0}
              onChange={(e) => setCount(setDiscard, discard, key, Number(e.target.value), max)}
            />
          </label>
        ))}
        {receiveResources.map((key) => (
          <label key={`receive-${key}`} className="resource-quantity-row">
            <span className="resource-quantity-label">{t(locale, 'ui.interactionBatchExchangeReceive', {
              type: t(locale, `resources.${key}`),
            })}</span>
            <input
              type="number"
              min={0}
              max={maxTotal}
              value={receive[key] ?? 0}
              onChange={(e) => setCount(setReceive, receive, key, Number(e.target.value), maxTotal)}
            />
          </label>
        ))}
      </div>
      <div className="interaction-actions resource-quantity-actions">
        <button
          type="button"
          className="is-primary"
          disabled={!totalsValid || isConfirmDisabled?.(payload)}
          onClick={() => onConfirm(payload)}
        >
          {t(locale, 'ui.interactionBatchExchangeConfirm')}
        </button>
        <button type="button" onClick={onCancel}>
          {t(locale, 'ui.interactionBatchExchangeCancel')}
        </button>
      </div>
    </div>
  )
}
