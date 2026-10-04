import { useMemo, useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { Resource } from '../../../shared/contract/types'
import { translateCardText } from '../common/cardText'

type ResourceKey = keyof Resource

type Props = {
  locale: Locale
  availableByResource: Partial<Record<ResourceKey, number>>
  promptKey?: string
  requireAtLeastOne?: boolean
  isConfirmDisabled?: (counts: Partial<Record<ResourceKey, number>>) => boolean
  onConfirm: (counts: Partial<Record<ResourceKey, number>>) => void
  onCancel: () => void
}

const normalizeCount = (value: unknown, max: number) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  const normalized = Number.isFinite(numeric) ? Math.floor(numeric) : 0
  return Math.max(0, Math.min(max, normalized))
}

const createCounts = (
  entries: Array<[ResourceKey, number]>,
  previous?: Partial<Record<ResourceKey, number>>,
): Partial<Record<ResourceKey, number>> =>
  Object.fromEntries(entries.map(([key, max]) => [
    key,
    normalizeCount(previous?.[key] ?? 0, max),
  ])) as Partial<Record<ResourceKey, number>>

export const ResourceQuantitySelectPanel = ({
  locale, availableByResource, promptKey, requireAtLeastOne = true, isConfirmDisabled, onConfirm, onCancel,
}: Props) => {
  const entries = useMemo(
    () => Object.entries(availableByResource) as Array<[ResourceKey, number]>,
    [availableByResource],
  )
  const [counts, setCounts] = useState<Partial<Record<ResourceKey, number>>>(() => createCounts(entries))
  const currentCounts = createCounts(entries, counts)
  const total = entries.reduce((sum, [k]) => sum + (currentCounts[k] ?? 0), 0)

  const setCount = (key: ResourceKey, value: number, max: number) => {
    setCounts((prev) => createCounts(entries, {
      ...prev,
      [key]: normalizeCount(value, max),
    }))
  }

  return (
    <div className="resource-quantity-select-panel interaction-resource-quantity-panel">
      <div className="interaction-title">
        {translateCardText(locale, promptKey ?? 'ui.interactionResourceQuantitySelect')}
      </div>
      <div className="resource-quantity-grid">
        {entries.map(([key, max]) => (
          <label key={key} className="resource-quantity-row">
            <span className="resource-quantity-label">{t(locale, 'ui.interactionResourceQuantityRow', {
              type: t(locale, `resources.${key}`),
              max,
            })}</span>
            <input
              type="number"
              min={0}
              max={max}
              value={currentCounts[key] ?? 0}
              onChange={(e) => setCount(key, Number(e.target.value), max)}
              disabled={max === 0}
            />
          </label>
        ))}
      </div>
      <div className="interaction-actions resource-quantity-actions">
        <button
          type="button"
          className="is-primary"
          disabled={(requireAtLeastOne && total < 1) || isConfirmDisabled?.(currentCounts)}
          onClick={() => onConfirm(currentCounts)}
        >
          {t(locale, 'ui.interactionResourceQuantityConfirm')}
        </button>
        <button type="button" onClick={onCancel}>
          {t(locale, 'ui.interactionResourceQuantityCancel')}
        </button>
      </div>
    </div>
  )
}
